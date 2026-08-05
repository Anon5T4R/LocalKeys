//! Ponte com o navegador.
//!
//! Arquitetura: o navegador **não** fala com este processo diretamente. Ele
//! lança o binário `localkeys-bridge` (o "host nativo"), que por sua vez se
//! conecta num socket local (AF_UNIX; no Windows é o AF_UNIX nativo — um
//! pathname em disco, via `uds_windows`) aqui do app. A extensão nunca toca no
//! processo que guarda a chave da sessão.
//!
//! Neste arquivo:
//! - `start()` (chamado no setup do Tauri) grava o `bridge.json` — socket,
//!   token e caminho do app — que o bridge lê para se conectar e autenticar;
//!   registra os manifests nativos (`native_host`); e sobe o servidor.
//! - O servidor aceita conexões, valida o token no handshake e responde o
//!   protocolo: `status`, `vault`, `unlock`, `lock`, `totp`.
//! - `remember_last_vault()` persiste o último vault aberto num arquivo, para o
//!   `status` devolver o caminho mesmo depois de o app reiniciar (a extensão
//!   precisa dele para destrancar com a master password no navegador).
//!
//! Segurança:
//! - A chave da sessão e o vault em claro vivem SÓ neste processo (mesma memória
//!   do WebView); a ponte só reencaminha frames e nunca fica com eles.
//! - Handshake com token (lido do `bridge.json` de acesso local) antes de
//!   aceitar qualquer pedido.
//! - O protocolo só devolve **logins** (id/nome/usuário/senha/uris/totp) — nunca
//!   cartões, identidades, anexos ou campos personalizados.

use std::io::{Read, Write};
use std::path::PathBuf;

use base64::Engine;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::AppState;

/// Nome base do socket (vira `<config>/com.localkeys.bridge.sock`).
pub const PIPE_BASENAME: &str = "com.localkeys.bridge";

/// Máximo de um frame (16 MB, igual ao limite do native messaging).
const MAX_FRAME: usize = 16 * 1024 * 1024;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BridgeConfig {
    pub socket: String,
    pub token: String,
    pub gui_exe: Option<String>,
    #[serde(default = "default_timeout_ms")]
    pub timeout_ms: u64,
}

fn default_timeout_ms() -> u64 {
    30_000
}

/// Diretório de config do app (tem que bater com o que o `localkeys-bridge`
/// resolve sozinho: `%APPDATA%\com.localkeys.app` / `~/.config/com.localkeys.app`).
fn config_dir() -> Option<PathBuf> {
    #[cfg(windows)]
    {
        std::env::var_os("APPDATA").map(|d| PathBuf::from(d).join("com.localkeys.app"))
    }
    #[cfg(unix)]
    {
        let base = std::env::var_os("XDG_CONFIG_HOME")
            .map(PathBuf::from)
            .or_else(|| std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".config")))?;
        Some(base.join("com.localkeys.app"))
    }
}

/// Endereço do socket que o servidor escuta e o bridge conecta. É um PATHNAME
/// em disco nos dois SOs: no Windows o `uds_windows` usa o AF_UNIX nativo (que
/// também é pathname — não é o namespace `\\.\pipe\`), e o `sun_path` precisa
/// caber em 108 bytes, então o nome curto `bridge.sock` na pasta de config.
fn socket_addr() -> String {
    config_dir()
        .map(|d| d.join(format!("{PIPE_BASENAME}.sock")))
        .unwrap_or_else(|| std::env::temp_dir().join(format!("{PIPE_BASENAME}.sock")))
        .to_string_lossy()
        .into_owned()
}

// ── framing (4 bytes little-endian + payload), igual no bridge ──────────────

fn read_frame(stream: &mut impl Read) -> std::io::Result<Option<Vec<u8>>> {
    let mut len_buf = [0u8; 4];
    match stream.read_exact(&mut len_buf) {
        Ok(()) => {}
        Err(e) if e.kind() == std::io::ErrorKind::UnexpectedEof => return Ok(None),
        Err(e) => return Err(e),
    }
    let len = u32::from_le_bytes(len_buf) as usize;
    if len == 0 || len > MAX_FRAME {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            "frame com tamanho inválido",
        ));
    }
    let mut buf = vec![0u8; len];
    stream.read_exact(&mut buf)?;
    Ok(Some(buf))
}

fn write_frame(stream: &mut impl Write, data: &[u8]) -> std::io::Result<()> {
    let len = u32::try_from(data.len())
        .map_err(|_| std::io::Error::new(std::io::ErrorKind::InvalidData, "frame grande demais"))?;
    stream.write_all(&len.to_le_bytes())?;
    stream.write_all(data)?;
    stream.flush()
}

// ── inicialização (setup do Tauri) ──────────────────────────────────────────

/// Grava o `bridge.json`, registra os manifests nativos e sobe o servidor.
pub fn start(state: AppState) -> Result<(), String> {
    let dir = config_dir().ok_or("sem diretório de config")?;
    std::fs::create_dir_all(&dir)
        .map_err(|e| format!("falha ao criar '{}': {e}", dir.display()))?;

    let mut token_bytes = [0u8; 32];
    use rand::RngCore;
    rand::rngs::OsRng.fill_bytes(&mut token_bytes);
    let cfg = BridgeConfig {
        socket: socket_addr(),
        token: base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(token_bytes),
        gui_exe: std::env::current_exe().ok().map(|p| p.to_string_lossy().into_owned()),
        timeout_ms: default_timeout_ms(),
    };
    let raw = serde_json::to_vec(&cfg).map_err(|e| format!("config: {e}"))?;
    crate::atomic_write(&dir.join("bridge.json"), &raw)?;

    crate::native_host::register()?;

    std::thread::spawn(move || server_loop(state, cfg));
    Ok(())
}

fn server_loop(state: AppState, cfg: BridgeConfig) {
    // Arquivo de socket órfão de uma execução anterior (quedas etc.). Vale nos
    // dois SOs: no Windows o AF_UNIX também materializa um arquivo no disco.
    let _ = std::fs::remove_file(&cfg.socket);
    #[cfg(windows)]
    let listener = match uds_windows::UnixListener::bind(&cfg.socket) {
        Ok(l) => l,
        Err(e) => {
            eprintln!("bridge: falha ao criar o socket '{}': {e}", cfg.socket);
            return;
        }
    };
    #[cfg(unix)]
    let listener = match std::os::unix::net::UnixListener::bind(&cfg.socket) {
        Ok(l) => l,
        Err(e) => {
            eprintln!("bridge: falha ao criar o socket '{}': {e}", cfg.socket);
            return;
        }
    };

    for conn in listener.incoming() {
        let Ok(mut conn) = conn else { continue };
        let state = state.clone();
        let cfg = cfg.clone();
        std::thread::spawn(move || handle_connection(&mut conn, &state, &cfg));
    }
}

fn handle_connection(conn: &mut (impl Read + Write), state: &AppState, cfg: &BridgeConfig) {
    // Handshake: o primeiro frame do bridge é `{"auth":"<token>"}`. Comparação
    // em tempo constante para não vazar informação pela duração.
    let Some(auth) = read_frame(conn).ok().flatten() else { return };
    let Ok(v) = serde_json::from_slice::<Value>(&auth) else { return };
    let ok = v
        .get("auth")
        .and_then(|t| t.as_str())
        .map(|t| constant_time_eq(t.as_bytes(), cfg.token.as_bytes()))
        .unwrap_or(false);
    if !ok {
        return;
    }

    loop {
        let Some(frame) = read_frame(conn).ok().flatten() else { break };
        let Ok(msg) = serde_json::from_slice::<Value>(&frame) else { break };
        let resp = dispatch(state, msg);
        if write_frame(conn, &serde_json::to_vec(&resp).unwrap_or_default()).is_err() {
            break;
        }
    }
}

fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut diff = 0u8;
    for (x, y) in a.iter().zip(b.iter()) {
        diff |= x ^ y;
    }
    diff == 0
}

// ── protocolo ───────────────────────────────────────────────────────────────

fn dispatch(state: &AppState, msg: Value) -> Value {
    let id = msg.get("id").cloned().unwrap_or(Value::Null);
    let op = msg.get("op").and_then(|v| v.as_str()).unwrap_or("");
    let resp = match op {
        "status" => status(state),
        "vault" => vault(state),
        "unlock" => {
            let path = msg.get("path").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let password = msg
                .get("password")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            unlock(state, &path, &password)
        }
        "lock" => lock(state),
        "totp" => {
            let secret = msg.get("secret").and_then(|v| v.as_str()).unwrap_or("").to_string();
            totp(state, &secret)
        }
        "copy" => {
            let text = msg.get("text").and_then(|v| v.as_str()).unwrap_or("").to_string();
            copy(state, &text)
        }
        _ => json!({ "ok": false, "error": "op desconhecido" }),
    };
    let mut out = resp;
    out["id"] = id;
    out
}

fn status(state: &AppState) -> Value {
    let unlocked = state.session.lock().unwrap().is_some();
    json!({
        "ok": true,
        "unlocked": unlocked,
        "lastVaultPath": last_vault_path(state),
    })
}

fn vault(state: &AppState) -> Value {
    let guard = state.vault.lock().unwrap();
    match guard.as_ref() {
        Some(plain) => match slim_logins(plain) {
            Ok(logins) => json!({ "ok": true, "logins": logins }),
            Err(e) => json!({ "ok": false, "error": e }),
        },
        None => json!({ "ok": false, "error": "locked" }),
    }
}

fn unlock(state: &AppState, path: &str, password: &str) -> Value {
    if path.is_empty() {
        return json!({ "ok": false, "error": "sem caminho" });
    }
    match crate::open_vault_impl(state, path, password) {
        Ok(_) => {
            let guard = state.vault.lock().unwrap();
            let logins = guard
                .as_ref()
                .and_then(|plain| slim_logins(plain).ok())
                .unwrap_or(Value::Array(vec![]));
            json!({ "ok": true, "lastVaultPath": path, "logins": logins })
        }
        Err(e) => json!({ "ok": false, "error": e }),
    }
}

fn lock(state: &AppState) -> Value {
    crate::lock_vault_impl(state);
    json!({ "ok": true })
}

fn totp(state: &AppState, secret: &str) -> Value {
    if state.session.lock().unwrap().is_none() {
        return json!({ "ok": false, "error": "locked" });
    }
    match crate::totp::now(secret) {
        Ok(c) => json!({
            "ok": true,
            "code": c.code,
            "period": c.period,
            "secondsRemaining": c.seconds_remaining,
        }),
        Err(e) => json!({ "ok": false, "error": e }),
    }
}

/// Copia um segredo para o clipboard **pelo app** — no Windows isso exclui o
/// histórico (Win+V) e a nuvem e limpa em 30 s. Nas outras plataformas o
/// navegador copia direto (fallback na extensão).
fn copy(state: &AppState, text: &str) -> Value {
    if state.session.lock().unwrap().is_none() {
        return json!({ "ok": false, "error": "locked" });
    }
    #[cfg(windows)]
    {
        crate::clipboard::copy_secret(text.to_string())
            .map(|_| json!({ "ok": true }))
            .unwrap_or_else(|e| json!({ "ok": false, "error": e }))
    }
    #[cfg(not(windows))]
    {
        json!({ "ok": false, "error": "use o clipboard do navegador nesta plataforma" })
    }
}

/// Extrai só os logins do vault em claro, no formato mínimo que a extensão usa.
/// Nunca vaza cartões, identidades, anexos ou custom fields.
fn slim_logins(vault_bytes: &[u8]) -> Result<Value, String> {
    let text = std::str::from_utf8(vault_bytes).map_err(|_| "vault não é UTF-8 válido".to_string())?;
    let v: Value = serde_json::from_str(text).map_err(|e| e.to_string())?;
    let items = v
        .get("items")
        .and_then(|a| a.as_array())
        .map(|a| a.as_slice())
        .unwrap_or(&[]);

    let mut logins = Vec::new();
    for it in items {
        let is_login = it.get("kind").and_then(|k| k.as_str()) == Some("login");
        let deleted = it
            .get("deletedAt")
            .map(|d| !d.is_null())
            .unwrap_or(false);
        if !is_login || deleted {
            continue;
        }
        let login = it.get("login").cloned().unwrap_or(Value::Null);
        logins.push(json!({
            "id": it.get("id").cloned().unwrap_or(Value::Null),
            "name": it.get("name").cloned().unwrap_or(Value::Null),
            "folderId": it.get("folderId").cloned().unwrap_or(Value::Null),
            "favorite": it.get("favorite").cloned().unwrap_or(json!(false)),
            "username": login.get("username").cloned().unwrap_or(Value::Null),
            "password": login.get("password").cloned().unwrap_or(Value::Null),
            "uris": login.get("uris").cloned().unwrap_or(json!([])),
            "totp": login.get("totp").cloned().unwrap_or(json!("")),
        }));
    }
    Ok(Value::Array(logins))
}

// ── último vault aberto (compartilhado com a extensão) ──────────────────────

/// Guarda o último vault aberto na memória e num arquivo (para sobreviver ao
/// reinício do app, já que a extensão pode precisar do caminho para destrancar).
pub(crate) fn remember_last_vault(state: &AppState, path: &str) {
    *state.last_vault_path.lock().unwrap() = Some(path.to_string());
    if let Some(dir) = config_dir() {
        let _ = std::fs::create_dir_all(&dir);
        let _ = std::fs::write(
            dir.join("last-vault.json"),
            json!({ "path": path }).to_string(),
        );
    }
}

pub(crate) fn last_vault_path(state: &AppState) -> Option<String> {
    if let Some(p) = state.last_vault_path.lock().unwrap().clone() {
        return Some(p);
    }
    let dir = config_dir()?;
    let raw = std::fs::read_to_string(dir.join("last-vault.json")).ok()?;
    let v: Value = serde_json::from_str(&raw).ok()?;
    v.get("path").and_then(|p| p.as_str()).map(|s| s.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Arc, Mutex};
    use zeroize::Zeroizing;

    #[cfg(windows)]
    type TestStream = uds_windows::UnixStream;
    #[cfg(unix)]
    type TestStream = std::os::unix::net::UnixStream;

    fn test_state() -> AppState {
        AppState {
            session: Arc::new(Mutex::new(None)),
            vault: Arc::new(Mutex::new(None)),
            last_vault_path: Arc::new(Mutex::new(None)),
        }
    }

    /// Nome de socket único por teste (evita colisão entre testes no mesmo
    /// processo e com o app rodando de verdade).
    fn test_socket_name(tag: &str) -> String {
        static COUNTER: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(0);
        let n = COUNTER.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
        let name = format!("localkeys-bridge-test-{}-{tag}-{n}.sock", std::process::id());
        std::env::temp_dir().join(name).to_string_lossy().into_owned()
    }

    fn wait_connect(socket: &str) -> TestStream {
        let mut last = None;
        for _ in 0..50 {
            match TestStream::connect(socket) {
                Ok(s) => return s,
                Err(e) => last = Some(e),
            }
            std::thread::sleep(std::time::Duration::from_millis(100));
        }
        panic!("socket não subiu: {last:?}");
    }

    fn spawn_server(state: &AppState, tag: &str) -> BridgeConfig {
        let cfg = BridgeConfig {
            socket: test_socket_name(tag),
            token: format!("tok-{tag}"),
            gui_exe: None,
            timeout_ms: 5000,
        };
        let s = state.clone();
        let c = cfg.clone();
        std::thread::spawn(move || server_loop(s, c));
        cfg
    }

    #[test]
    fn framing_roundtrip() {
        let mut buf: Vec<u8> = Vec::new();
        let payload = b"{\"a\":1}";
        write_frame(&mut buf, payload).unwrap();
        let mut cur = std::io::Cursor::new(buf);
        let out = read_frame(&mut cur).unwrap().unwrap();
        assert_eq!(out, payload);
    }

    #[test]
    fn framing_rejeita_tamanho_grande() {
        let mut cur = std::io::Cursor::new(vec![0xff, 0xff, 0xff, 0xff]);
        assert!(read_frame(&mut cur).is_err());
    }

    #[test]
    fn constant_time_eq_basico() {
        assert!(constant_time_eq(b"abc", b"abc"));
        assert!(!constant_time_eq(b"abc", b"abd"));
        assert!(!constant_time_eq(b"abc", b"abcd"));
    }

    /// A extensão só recebe logins ativos — cartões, notas, itens apagados e
    /// campos sensíveis nunca saem do processo.
    #[test]
    fn slim_logins_filtra_so_logins_ativos() {
        let vault = r#"{
            "version": 1,
            "folders": [],
            "items": [
                {"id":"1","kind":"login","name":"a","deletedAt":null,"favorite":false,"folderId":null,
                 "login":{"username":"u1","password":"p1","uris":["https://a.example"],"totp":"SECRET1"}},
                {"id":"2","kind":"note","name":"n","deletedAt":null},
                {"id":"3","kind":"login","name":"lixo","deletedAt":123,
                 "login":{"username":"x","password":"y","uris":[],"totp":""}},
                {"id":"4","kind":"card","deletedAt":null,"card":{"number":"4111"}}
            ]
        }"#;
        let out = slim_logins(vault.as_bytes()).unwrap();
        let arr = out.as_array().unwrap();
        assert_eq!(arr.len(), 1);
        let a = &arr[0];
        assert_eq!(a["id"], "1");
        assert_eq!(a["username"], "u1");
        assert_eq!(a["password"], "p1");
        assert_eq!(a["uris"][0], "https://a.example");
        assert_eq!(a["totp"], "SECRET1");
        // Campos que não devem vazar:
        assert!(a.get("notes").is_none());
        assert!(a.get("customFields").is_none());
        assert!(a.get("attachments").is_none());
    }

    #[test]
    fn status_trancado_reponde_unlocked_false() {
        let state = test_state();
        let r = dispatch(&state, json!({ "id": 7, "op": "status" }));
        assert_eq!(r["id"], 7);
        assert_eq!(r["ok"], true);
        assert_eq!(r["unlocked"], false);
    }

    #[test]
    fn vault_trancado_da_erro_locked() {
        let state = test_state();
        let r = dispatch(&state, json!({ "id": 1, "op": "vault" }));
        assert_eq!(r["ok"], false);
        assert_eq!(r["error"], "locked");
    }

    #[test]
    fn op_desconhecido_da_erro() {
        let state = test_state();
        let r = dispatch(&state, json!({ "id": 2, "op": "nada" }));
        assert_eq!(r["ok"], false);
    }

    #[test]
    fn unlock_sem_caminho_da_erro() {
        let state = test_state();
        let r = dispatch(&state, json!({ "id": 3, "op": "unlock", "path": "", "password": "x" }));
        assert_eq!(r["ok"], false);
    }

    /// Vault destrancado: a ponte devolve os logins já filtrados.
    #[test]
    fn vault_destrancado_devolve_logins() {
        let state = test_state();
        let (_, session) = crate::crypto::create_vault(
            "senha",
            br#"{"version":1,"folders":[],"items":[
                {"id":"a","kind":"login","name":"x","deletedAt":null,
                 "login":{"username":"u","password":"p","uris":["https://x"],"totp":""}}
            ]}"#,
        )
        .unwrap();
        *state.session.lock().unwrap() = Some(session);
        *state.vault.lock().unwrap() = Some(Zeroizing::new(
            br#"{"version":1,"folders":[],"items":[
                {"id":"a","kind":"login","name":"x","deletedAt":null,
                 "login":{"username":"u","password":"p","uris":["https://x"],"totp":""}}
            ]}"#
                .to_vec(),
        ));
        let r = dispatch(&state, json!({ "id": 5, "op": "vault" }));
        assert_eq!(r["ok"], true);
        assert_eq!(r["logins"][0]["username"], "u");
        assert_eq!(r["logins"][0]["password"], "p");
    }

    /// Teste de integração real do socket: handshake certo + pedido + resposta,
    /// passando pelo mesmo framing que o `localkeys-bridge` usa.
    #[test]
    fn handshake_e_status_por_socket() {
        let state = test_state();
        let cfg = spawn_server(&state, "ok");
        let mut conn = wait_connect(&cfg.socket);

        write_frame(&mut conn, br#"{"auth":"tok-ok"}"#).unwrap();
        write_frame(&mut conn, br#"{"id":7,"op":"status"}"#).unwrap();
        let raw = read_frame(&mut conn).unwrap().expect("deve responder");
        let v: Value = serde_json::from_slice(&raw).unwrap();
        assert_eq!(v["id"], 7);
        assert_eq!(v["ok"], true);
        assert_eq!(v["unlocked"], false);
    }

    /// Token errado: o servidor fecha a conexão sem responder nada.
    #[test]
    fn auth_errada_fecha_a_conexao() {
        let state = test_state();
        let cfg = spawn_server(&state, "bad");
        let mut conn = wait_connect(&cfg.socket);

        write_frame(&mut conn, br#"{"auth":"tok-errado"}"#).unwrap();
        assert!(read_frame(&mut conn).unwrap().is_none());
    }

    /// Sem frame de auth no primeiro pedido, a conexão também é rejeitada.
    #[test]
    fn sem_handshake_fecha_a_conexao() {
        let state = test_state();
        let cfg = spawn_server(&state, "noauth");
        let mut conn = wait_connect(&cfg.socket);

        write_frame(&mut conn, br#"{"id":1,"op":"status"}"#).unwrap();
        assert!(read_frame(&mut conn).unwrap().is_none());
    }
}
