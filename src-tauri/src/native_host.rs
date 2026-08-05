//! Registro do `localkeys-bridge` como host nativo (Chrome, Chromium, Edge,
//! Firefox).
//!
//! O navegador só lança um host nativo que esteja registrado:
//! - Chrome/Edge/Chromium no Windows: entrada de registro `HKCU` apontando para
//!   um manifest JSON (que fica na pasta de config do app, sob nosso controle).
//! - Chrome/Chromium/Edge no Linux: manifest em
//!   `~/.config/<navegador>/NativeMessagingHosts/`.
//! - Firefox (Windows e Linux): manifest em `~/.mozilla/native-messaging-hosts/`
//!   (Windows: `%APPDATA%\Mozilla\NativeMessagingHosts\`).
//!
//! Registrar a cada abertura do app é idempotente e barato, e mantém os IDs das
//! extensões em dia (Chrome deriva o ID da chave de assinatura; se a extensão
//! for re-assinada o ID muda). Tudo é por usuário (HKCU/`~`) — não pede admin.

use std::path::PathBuf;

use serde_json::json;

/// ID da extensão no Chrome (32 caracteres minúsculos, derivado da chave RSA
/// fixa que a extensão declara no `manifest.json` — ver `browser-ext/`).
const CHROME_EXT_ID: &str = "hekflailgllfkpagnacgmfhkjfngcnjb";

/// ID da extensão no Firefox (declarado em `browser_specific_settings.gecko.id`
/// na extensão; precisa ser estável entre versões).
const FIREFOX_EXT_ID: &str = "localkeys@localkeys";

fn bridge_exe_path() -> Option<PathBuf> {
    let dir = std::env::current_exe().ok()?.parent()?.to_path_buf();
    #[cfg(windows)]
    let name = "localkeys-bridge.exe";
    #[cfg(not(windows))]
    let name = "localkeys-bridge";
    Some(dir.join(name))
}

fn chrome_manifest(bridge: &str) -> String {
    serde_json::to_string_pretty(&json!({
        "name": "com.localkeys.bridge",
        "description": "Ponte LocalKeys <-> navegador",
        "path": bridge,
        "type": "stdio",
        "allowed_origins": [format!("chrome-extension://{CHROME_EXT_ID}/")],
    }))
    .expect("manifest deve serializar")
}

fn firefox_manifest(bridge: &str) -> String {
    serde_json::to_string_pretty(&json!({
        "name": "com.localkeys.bridge",
        "description": "Ponte LocalKeys <-> navegador",
        "path": bridge,
        "type": "stdio",
        "allowed_extensions": [FIREFOX_EXT_ID],
    }))
    .expect("manifest deve serializar")
}

/// Registra os manifests de todos os navegadores instalados (não falha se um
/// não existir; só registra onde dá). Pula se o bridge não estiver presente
/// (ex.: desenvolvimento sem o binário compilado ao lado do app).
pub fn register() -> Result<(), String> {
    let bridge = bridge_exe_path().ok_or("não achei o caminho do executável do app")?;
    if !bridge.exists() {
        eprintln!(
            "host nativo: bridge não encontrado em '{}' — pulei o registro",
            bridge.display()
        );
        return Ok(());
    }
    let bridge_str = bridge.to_string_lossy().into_owned();

    #[cfg(windows)]
    {
        register_windows(&bridge_str)?;
    }
    #[cfg(unix)]
    {
        register_unix(&bridge_str)?;
    }

    Ok(())
}

#[cfg(windows)]
fn register_windows(bridge: &str) -> Result<(), String> {
    let local = std::env::var_os("LOCALAPPDATA")
        .map(|d| PathBuf::from(d).join("com.localkeys.app"))
        .ok_or("sem LOCALAPPDATA")?;
    std::fs::create_dir_all(&local)
        .map_err(|e| format!("falha ao criar '{}': {e}", local.display()))?;

    // Chrome/Edge/Chromium compartilham o mesmo manifest; a diferença é a chave
    // de registro por navegador.
    let manifest = local.join("localkeys-bridge.chrome.json");
    std::fs::write(&manifest, chrome_manifest(bridge))
        .map_err(|e| format!("falha ao gravar o manifest: {e}"))?;
    for key in [
        r"HKCU\Software\Google\Chrome\NativeMessagingHosts\com.localkeys.bridge",
        r"HKCU\Software\Microsoft\Edge\NativeMessagingHosts\com.localkeys.bridge",
        r"HKCU\Software\Chromium\NativeMessagingHosts\com.localkeys.bridge",
    ] {
        write_reg_key(key, &manifest)?;
    }

    // Firefox exige o manifest num local fixo (não aceita registro).
    let ff_dir = std::env::var_os("APPDATA")
        .map(|d| PathBuf::from(d).join("Mozilla").join("NativeMessagingHosts"))
        .ok_or("sem APPDATA")?;
    std::fs::create_dir_all(&ff_dir)
        .map_err(|e| format!("falha ao criar '{}': {e}", ff_dir.display()))?;
    std::fs::write(ff_dir.join("com.localkeys.bridge.json"), firefox_manifest(bridge))
        .map_err(|e| format!("falha ao gravar o manifest do Firefox: {e}"))?;

    Ok(())
}

#[cfg(windows)]
fn write_reg_key(key: &str, manifest: &std::path::Path) -> Result<(), String> {
    let out = std::process::Command::new("reg")
        .args([
            "add",
            key,
            "/ve",
            "/t",
            "REG_SZ",
            "/d",
            &manifest.to_string_lossy(),
            "/f",
        ])
        .output()
        .map_err(|e| format!("reg add falhou: {e}"))?;
    if !out.status.success() {
        return Err(format!(
            "reg add '{key}' falhou: {}",
            String::from_utf8_lossy(&out.stderr)
        ));
    }
    Ok(())
}

#[cfg(unix)]
fn register_unix(bridge: &str) -> Result<(), String> {
    let base = std::env::var_os("XDG_CONFIG_HOME")
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".config")))
        .ok_or("sem diretório de config")?;
    let home = std::env::var_os("HOME").map(PathBuf::from).ok_or("sem HOME")?;

    // Chrome, Chromium e Edge (Linux) leem `~/.config/<nome>/NativeMessagingHosts/`.
    let mut targets = [
        base.join("google-chrome/NativeMessagingHosts/com.localkeys.bridge.json"),
        base.join("chromium/NativeMessagingHosts/com.localkeys.bridge.json"),
        base.join("microsoft-edge/NativeMessagingHosts/com.localkeys.bridge.json"),
    ]
    .to_vec();
    targets.push(home.join(".mozilla/native-messaging-hosts/com.localkeys.bridge.json"));

    let mut erros = 0usize;
    for (i, p) in targets.iter().enumerate() {
        let content = if i == targets.len() - 1 {
            firefox_manifest(bridge)
        } else {
            chrome_manifest(bridge)
        };
        if let Some(parent) = p.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        if let Err(e) = std::fs::write(p, content) {
            erros += 1;
            eprintln!("host nativo: não deu para registrar em '{}': {e}", p.display());
        }
    }
    if erros == targets.len() {
        return Err("não deu para registrar o host nativo em nenhum navegador".into());
    }
    Ok(())
}
