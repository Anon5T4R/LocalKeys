//! LocalKeys — back-end Tauri.
//!
//! Fronteira de segurança: a **master password** chega uma vez (create/open),
//! vira uma [`crypto::SessionKey`] que fica **só aqui no back-end** e é apagada
//! da memória ao trancar. O front-end nunca guarda a senha nem a chave — recebe
//! o conteúdo do vault (para renderizar) e manda de volta o JSON para salvar.

mod crypto;
mod generator;

use std::path::Path;
use std::sync::Mutex;

use serde::Serialize;
use tauri::{Manager, State};

use generator::{PassphraseOptions, PasswordOptions, Strength};

/// Vault recém-criado: versão do schema + coleções vazias. O schema completo
/// (tipos de item, pastas, lixeira) vive no front-end em TypeScript.
const EMPTY_VAULT: &str = r#"{"version":1,"folders":[],"items":[]}"#;

/// Estado do app: a sessão do vault destrancado (ou `None` = trancado).
#[derive(Default)]
struct AppState {
    session: Mutex<Option<crypto::SessionKey>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct OpenResult {
    /// JSON do vault decifrado, para o front renderizar.
    vault: String,
}

/// Cria um vault novo no `path` com a `password` e já o deixa destrancado.
#[tauri::command(async)]
fn create_vault(
    path: String,
    password: String,
    state: State<'_, AppState>,
) -> Result<OpenResult, String> {
    if password.is_empty() {
        return Err("a master password não pode ser vazia".into());
    }
    let (file, session) =
        crypto::create_vault(&password, EMPTY_VAULT.as_bytes()).map_err(|e| e.to_string())?;
    std::fs::write(&path, &file).map_err(|e| format!("falha ao gravar '{path}': {e}"))?;
    *state.session.lock().unwrap() = Some(session);
    Ok(OpenResult {
        vault: EMPTY_VAULT.to_string(),
    })
}

/// Abre um vault existente. Faz uma cópia de backup antes de mexer.
#[tauri::command(async)]
fn open_vault(
    path: String,
    password: String,
    state: State<'_, AppState>,
) -> Result<OpenResult, String> {
    let file = std::fs::read(&path).map_err(|e| format!("falha ao ler '{path}': {e}"))?;
    let (plaintext, session) = crypto::open_vault(&password, &file).map_err(|e| e.to_string())?;
    // Backup do último estado bom ao abrir (retenção simples de 1 cópia).
    let _ = std::fs::copy(&path, format!("{path}.bak"));
    let vault =
        String::from_utf8(plaintext.to_vec()).map_err(|_| "vault não é UTF-8 válido".to_string())?;
    *state.session.lock().unwrap() = Some(session);
    Ok(OpenResult { vault })
}

/// Salva o vault: valida que é JSON, recifra com a chave da sessão (nonce novo)
/// e grava. Não pede a senha de novo. Preserva um `.bak` do estado anterior.
#[tauri::command(async)]
fn save_vault(
    path: String,
    vault: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    // Rejeita lixo antes de cifrar (defesa contra estado corrompido no front).
    serde_json::from_str::<serde_json::Value>(&vault)
        .map_err(|e| format!("vault inválido (não é JSON): {e}"))?;

    let guard = state.session.lock().unwrap();
    let session = guard.as_ref().ok_or("vault está trancado")?;
    let file = session.seal(vault.as_bytes()).map_err(|e| e.to_string())?;

    // Backup do estado anterior antes de sobrescrever (rede de segurança contra
    // gravação parcial). Atomicidade via rename fica para v0.2.
    if Path::new(&path).exists() {
        let _ = std::fs::copy(&path, format!("{path}.bak"));
    }
    std::fs::write(&path, &file).map_err(|e| format!("falha ao salvar '{path}': {e}"))?;
    Ok(())
}

/// Tranca o vault: apaga a chave de sessão da memória.
#[tauri::command(async)]
fn lock_vault(state: State<'_, AppState>) -> Result<(), String> {
    *state.session.lock().unwrap() = None; // Drop → Zeroizing apaga a chave
    Ok(())
}

/// O vault está destrancado?
#[tauri::command(async)]
fn is_unlocked(state: State<'_, AppState>) -> bool {
    state.session.lock().unwrap().is_some()
}

/// Troca a master password de um vault fechado no disco.
#[tauri::command(async)]
fn change_master_password(
    path: String,
    old_password: String,
    new_password: String,
) -> Result<(), String> {
    if new_password.is_empty() {
        return Err("a nova master password não pode ser vazia".into());
    }
    let file = std::fs::read(&path).map_err(|e| format!("falha ao ler '{path}': {e}"))?;
    let renewed =
        crypto::change_password(&old_password, &new_password, &file).map_err(|e| e.to_string())?;
    if Path::new(&path).exists() {
        let _ = std::fs::copy(&path, format!("{path}.bak"));
    }
    std::fs::write(&path, &renewed).map_err(|e| format!("falha ao salvar '{path}': {e}"))?;
    Ok(())
}

#[tauri::command(async)]
fn generate_password(opts: PasswordOptions) -> Result<String, String> {
    generator::generate_password(&opts)
}

#[tauri::command(async)]
fn generate_passphrase(opts: PassphraseOptions) -> Result<String, String> {
    generator::generate_passphrase(&opts)
}

#[tauri::command(async)]
fn password_strength(password: String, user_inputs: Vec<String>) -> Strength {
    let refs: Vec<&str> = user_inputs.iter().map(|s| s.as_str()).collect();
    generator::password_strength(&password, &refs)
}

/// Caminho passado no launch (abrir um `.tkeys` pelo "Abrir com"), se houver.
#[tauri::command(async)]
fn get_startup_file() -> Option<String> {
    std::env::args()
        .skip(1)
        .find(|a| !a.starts_with('-') && Path::new(a).is_file())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    // Instância única: um 2º "Abrir com" foca a janela existente em vez de abrir
    // outra (importante num gerenciador de senhas — um só processo com a chave).
    #[cfg(all(desktop, not(any(target_os = "android", target_os = "ios"))))]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.set_focus();
            }
        }));
    }

    builder
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            create_vault,
            open_vault,
            save_vault,
            lock_vault,
            is_unlocked,
            change_master_password,
            generate_password,
            generate_passphrase,
            password_strength,
            get_startup_file,
        ])
        .run(tauri::generate_context!())
        .expect("erro ao iniciar o LocalKeys");
}
