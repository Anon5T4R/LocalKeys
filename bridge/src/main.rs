//! Ponte nativa (native messaging) entre o navegador e o LocalKeys.
//!
//! O navegador (Chrome/Firefox) lança este processo apontado pelo manifest
//! nativo registrado. Ele é um **relay burro**:
//!
//! ```text
//! navegador ──(stdin/stdout, frames nativos)──► bridge ──(socket)──► LocalKeys (GUI)
//! ```
//!
//! - Lê frames do native messaging (4 bytes little-endian + JSON) do stdin e
//!   repassa para o socket do app principal (`app_config_dir/bridge.json`
//!   guarda o nome do socket + o token de autenticação).
//! - Devolve as respostas do app para o stdout.
//! - Se o app não estiver rodando, **abre ele** e espera o socket aparecer.
//!
//! Regras de segurança:
//! - Só o socket local, com handshake de token (o mesmo JSON que o app escreveu).
//! - Nada de senha/chave passa por aqui: o bridge só reencaminha bytes.
//! - Nada além de frames no stdout (o navegador aborta se vir lixo); debug vai
//!   pro stderr, que o navegador mostra no console.

use std::io::{self, Read, Write};
use std::path::PathBuf;
use std::process;
use std::time::Duration;

use serde::Deserialize;

// ── socket local (AF_UNIX; no Windows é o AF_UNIX nativo, um pathname) ──────
#[cfg(windows)]
use uds_windows::UnixStream;
#[cfg(unix)]
use std::os::unix::net::UnixStream;

// ── config lida do `bridge.json` escrito pelo app principal ─────────────────

#[derive(Debug, Deserialize)]
struct BridgeConfig {
    /// Nome do socket do app: o pathname do AF_UNIX (arquivo em disco).
    socket: String,
    /// Token de autenticação do handshake.
    token: String,
    /// Caminho do executável do LocalKeys para abrir se não estiver rodando.
    gui_exe: Option<String>,
}

/// Diretório de config do app (tem que bater com `tauri::Manager::path` do GUI):
/// Windows `%APPDATA%\com.localkeys.app`, Linux `~/.config/com.localkeys.app`.
fn app_config_dir() -> Option<PathBuf> {
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

fn load_config() -> Result<BridgeConfig, String> {
    let dir = app_config_dir().ok_or("não achei o diretório de config do LocalKeys")?;
    let file = dir.join("bridge.json");
    let raw = std::fs::read_to_string(&file)
        .map_err(|e| format!("sem config de ponte em '{}': {e} (o LocalKeys precisa rodar uma vez)", file.display()))?;
    serde_json::from_str(&raw)
        .map_err(|e| format!("config de ponte inválida em '{}': {e}", file.display()))
}

/// A porta final do socket: o pathname (ou path do AF_UNIX) vindo do config.
fn socket_path(cfg: &BridgeConfig) -> &str {
    &cfg.socket
}

// ── framing do native messaging (igual nos dois lados: navegador ↔ bridge ↔ app)

fn read_frame(stream: &mut impl Read) -> io::Result<Option<Vec<u8>>> {
    let mut len_buf = [0u8; 4];
    match stream.read_exact(&mut len_buf) {
        Ok(()) => {}
        Err(e) if e.kind() == io::ErrorKind::UnexpectedEof => return Ok(None),
        Err(e) => return Err(e),
    }
    let len = u32::from_le_bytes(len_buf) as usize;
    if len == 0 || len > 16 * 1024 * 1024 {
        return Err(io::Error::new(io::ErrorKind::InvalidData, "frame com tamanho inválido"));
    }
    let mut buf = vec![0u8; len];
    stream.read_exact(&mut buf)?;
    Ok(Some(buf))
}

fn write_frame(stream: &mut impl Write, data: &[u8]) -> io::Result<()> {
    let len = u32::try_from(data.len())
        .map_err(|_| io::Error::new(io::ErrorKind::InvalidData, "frame grande demais"))?;
    stream.write_all(&len.to_le_bytes())?;
    stream.write_all(data)?;
    stream.flush()
}

fn auth_frame(token: &str) -> Vec<u8> {
    format!(r#"{{"auth":"{token}"}}"#).into_bytes()
}

// ── subir o app se preciso (Windows: fora do job do navegador) ──────────────

#[cfg(windows)]
fn spawn_gui(gui_exe: &str) {
    use std::os::windows::process::CommandExt;
    // o navegador mata o JOB inteiro ao fechar a extensão — o app precisa
    // sobreviver, então é criado fora do job (CREATE_BREAKAWAY_FROM_JOB) e num
    // grupo de processo próprio. stdin/stdout anulados para o GUI não tocar no
    // pipe nativo do navegador (que é este processo).
    //
    // Alguns navegadores NÃO permitem breakaway (CreateProcess falha com
    // ACCESS_DENIED) — nesse caso sobe no job mesmo: o app abre e funciona,
    // embora possa ser derrubado junto quando o navegador matar o host.
    const CREATE_BREAKAWAY_FROM_JOB: u32 = 0x0100_0000;
    const CREATE_NEW_PROCESS_GROUP: u32 = 0x0000_0200;
    let mut cmd = std::process::Command::new(gui_exe);
    cmd.stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null());
    match cmd
        .creation_flags(CREATE_BREAKAWAY_FROM_JOB | CREATE_NEW_PROCESS_GROUP)
        .spawn()
    {
        Ok(_) => {}
        Err(e) => {
            eprintln!("localkeys-bridge: breakaway falhou ({e}); subindo o app dentro do job do navegador");
            let mut cmd2 = std::process::Command::new(gui_exe);
            cmd2.creation_flags(CREATE_NEW_PROCESS_GROUP)
                .stdin(std::process::Stdio::null())
                .stdout(std::process::Stdio::null())
                .stderr(std::process::Stdio::null());
            let _ = cmd2.spawn();
        }
    }
}

#[cfg(unix)]
fn spawn_gui(gui_exe: &str) {
    let _ = std::process::Command::new(gui_exe)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn();
}

/// Conecta ao socket do app. **Não abre o app** — abrir é responsabilidade do
/// `activate` (pedido explícito da extensão). Como é só sonda, espera pouco e
/// falha rápido ("offline") quando o app está fechado.
fn connect(cfg: &BridgeConfig) -> Result<UnixStream, String> {
    let target = socket_path(cfg);
    let timeout = Duration::from_millis(2500);
    let started = std::time::Instant::now();
    loop {
        match UnixStream::connect(target) {
            Ok(s) => return Ok(s),
            Err(_) => {
                if started.elapsed() > timeout {
                    return Err("LocalKeys offline — abra o app".into());
                }
                std::thread::sleep(Duration::from_millis(200));
            }
        }
    }
}

/// O op da 1ª frame (ou vazio se não der pra ler).
fn first_op(frame: &[u8]) -> String {
    serde_json::from_slice::<serde_json::Value>(frame)
        .ok()
        .and_then(|v| v.get("op").and_then(|o| o.as_str()).map(str::to_owned))
        .unwrap_or_default()
}

/// Resposta de erro ecoando o `id` da frame que falhou (o navegador casa por id).
fn error_frame(first: &[u8], msg: &str) -> Vec<u8> {
    let id = serde_json::from_slice::<serde_json::Value>(first)
        .ok()
        .and_then(|v| v.get("id").cloned())
        .unwrap_or(serde_json::Value::Null);
    let mut resp = serde_json::json!({ "ok": false, "error": msg });
    resp["id"] = id;
    resp.to_string().into_bytes()
}

/// Relay bidirecional em 2 threads, repassando as frames restantes do stdin:
/// 1) stdin do navegador → socket (para o app). EOF no stdin (extensão
///    desconectou) fecha o lado de escrita do socket.
/// 2) socket → stdout (para o navegador). EOF no socket (app caiu/fechou o
///    app) encerra o processo — e o navegador vê a desconexão.
fn relay(mut stream: UnixStream, stdin: io::Stdin) {
    let mut socket_tx = stream
        .try_clone()
        .expect("clonar o socket do app deve funcionar");
    let reader = std::thread::spawn(move || {
        let mut stdin = stdin.lock();
        loop {
            match read_frame(&mut stdin) {
                Ok(Some(frame)) => {
                    if write_frame(&mut socket_tx, &frame).is_err() {
                        break;
                    }
                }
                Ok(None) => {
                    let _ = socket_tx.shutdown(std::net::Shutdown::Write);
                    break;
                }
                Err(_) => break,
            }
        }
    });

    {
        let mut stdout = io::stdout().lock();
        loop {
            match read_frame(&mut stream) {
                Ok(Some(frame)) => {
                    if write_frame(&mut stdout, &frame).is_err() {
                        break;
                    }
                }
                Ok(None) | Err(_) => break,
            }
        }
    }

    let _ = reader.join();
}

fn main() {
    let cfg = match load_config() {
        Ok(c) => c,
        Err(e) => {
            eprintln!("localkeys-bridge: {e}");
            process::exit(1);
        }
    };

    // O navegador envia a 1ª frame assim que abre a porta; o op decide se o
    // app deve ser aberto ("activate") ou apenas sondado (status/vault/...).
    let first = {
        let mut stdin = io::stdin().lock();
        match read_frame(&mut stdin) {
            Ok(Some(f)) => f,
            Ok(None) | Err(_) => process::exit(0),
        }
    };
    let op = first_op(&first);

    // "activate" = pedido explícito da extensão para abrir o app: dispara o GUI
    // e responde na hora, sem esperar o socket (o app abre no próprio ritmo e
    // sondas futuras o pegam de pé).
    if op == "activate" {
        let running = UnixStream::connect(socket_path(&cfg)).is_ok();
        if !running {
            if let Some(exe) = &cfg.gui_exe {
                spawn_gui(exe);
            }
        }
        let resp = format!(r#"{{"ok":true,"spawned":{}}}"#, !running);
        let _ = write_frame(&mut io::stdout().lock(), resp.as_bytes());
        process::exit(0);
    }

    let mut stream = match connect(&cfg) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("localkeys-bridge: {e}");
            let resp = error_frame(&first, &e);
            let _ = write_frame(&mut io::stdout().lock(), &resp);
            process::exit(1);
        }
    };

    // autentica ANTES de qualquer relay (a 1ª frame fica com a gente até o
    // handshake terminar; as demais seguem no buffer do stdin).
    if let Err(e) = write_frame(&mut stream, &auth_frame(&cfg.token)) {
        eprintln!("localkeys-bridge: falha no handshake: {e}");
        process::exit(1);
    }

    // repassa a 1ª frame (já lida) e segue com o relay do resto.
    if write_frame(&mut stream, &first).is_err() {
        process::exit(1);
    }
    relay(stream, io::stdin());
}
