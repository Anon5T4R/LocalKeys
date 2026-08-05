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
    /// Quanto tempo (ms) espera o app responder antes de desistir.
    #[serde(default = "default_timeout_ms")]
    timeout_ms: u64,
}

fn default_timeout_ms() -> u64 {
    15_000
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
    const CREATE_BREAKAWAY_FROM_JOB: u32 = 0x0100_0000;
    const CREATE_NEW_PROCESS_GROUP: u32 = 0x0000_0200;
    let mut cmd = std::process::Command::new(gui_exe);
    cmd.creation_flags(CREATE_BREAKAWAY_FROM_JOB | CREATE_NEW_PROCESS_GROUP)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null());
    let _ = cmd.spawn();
}

#[cfg(unix)]
fn spawn_gui(gui_exe: &str) {
    let _ = std::process::Command::new(gui_exe)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn();
}

/// Conecta ao socket do app, abrindo o app se necessário (com retry).
fn connect(cfg: &BridgeConfig) -> Result<UnixStream, String> {
    let target = socket_path(cfg);
    let started = std::time::Instant::now();
    let mut spawned = false;

    // 1ª tentativa imediata + umas tentativas rápidas antes de abrir o app
    // (o app pode estar inicializando). Depois de ~1,2 s sem socket, abre o app.
    let mut attempts: u32 = 0;
    loop {
        match UnixStream::connect(target) {
            Ok(s) => return Ok(s),
            Err(_) => {
                if !spawned && attempts >= 5 {
                    spawned = true;
                    if let Some(exe) = &cfg.gui_exe {
                        spawn_gui(exe);
                    }
                }
                if started.elapsed() > Duration::from_millis(cfg.timeout_ms) {
                    return Err("LocalKeys não respondeu — está rodando?".into());
                }
                attempts += 1;
                std::thread::sleep(Duration::from_millis(200));
            }
        }
    }
}

fn main() {
    let cfg = match load_config() {
        Ok(c) => c,
        Err(e) => {
            eprintln!("localkeys-bridge: {e}");
            process::exit(1);
        }
    };

    let mut stream = match connect(&cfg) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("localkeys-bridge: {e}");
            process::exit(1);
        }
    };

    // autentica ANTES de qualquer relay (frames do navegador ficam no buffer
    // do stdin até o handshake terminar).
    if let Err(e) = write_frame(&mut stream, &auth_frame(&cfg.token)) {
        eprintln!("localkeys-bridge: falha no handshake: {e}");
        process::exit(1);
    }

    // ── relay bidirecional em 2 threads ─────────────────────────────────────
    // 1) stdin do navegador → socket (para o app). EOF no stdin (extensão
    //    desconectou) fecha o lado de escrita do socket.
    // 2) socket → stdout (para o navegador). EOF no socket (app caiu/fechou o
    //    app) encerra o processo — e o navegador vê a desconexão.

    let mut socket_tx = stream
        .try_clone()
        .expect("clonar o socket do app deve funcionar");
    let reader = std::thread::spawn(move || {
        let mut stdin = io::stdin().lock();
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
