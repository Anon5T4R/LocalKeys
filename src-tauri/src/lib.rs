//! LocalKeys — back-end Tauri.
//!
//! Fronteira de segurança: a **master password** chega uma vez (create/open),
//! vira uma [`crypto::SessionKey`] que fica **só aqui no back-end** e é apagada
//! da memória ao trancar. O front-end nunca guarda a senha nem a chave — recebe
//! o conteúdo do vault (para renderizar) e manda de volta o JSON para salvar.

mod bwdecrypt;
#[cfg(windows)]
mod clipboard;
mod crypto;
mod generator;
mod kdbx;
mod totp;

const KEYRING_SERVICE: &str = "LocalKeys";

use std::path::Path;
use std::sync::Mutex;

use base64::Engine;
use serde::Serialize;
use tauri::{Manager, State};
use zeroize::Zeroizing;

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

/// Gravação atômica: escreve num arquivo temporário no mesmo diretório e o
/// renomeia por cima (o `fs::rename` substitui o destino de forma atômica tanto
/// no Windows quanto no Unix). Mantém um `.bak` do estado anterior. Assim uma
/// gravação interrompida não corrompe o vault.
fn atomic_write(path: &str, bytes: &[u8]) -> Result<(), String> {
    let p = Path::new(path);
    if p.exists() {
        let _ = std::fs::copy(p, format!("{path}.bak"));
    }
    let tmp = format!("{path}.tmp");
    std::fs::write(&tmp, bytes).map_err(|e| format!("falha ao gravar '{tmp}': {e}"))?;
    std::fs::rename(&tmp, p).map_err(|e| {
        let _ = std::fs::remove_file(&tmp);
        format!("falha ao substituir '{path}': {e}")
    })
}

/// Cria um vault novo no `path` com a `password` e já o deixa destrancado.
#[tauri::command(async)]
fn create_vault(
    path: String,
    password: String,
    state: State<'_, AppState>,
) -> Result<OpenResult, String> {
    let password = Zeroizing::new(password);
    if password.is_empty() {
        return Err("a master password não pode ser vazia".into());
    }
    let (file, session) =
        crypto::create_vault(&password, EMPTY_VAULT.as_bytes()).map_err(|e| e.to_string())?;
    atomic_write(&path, &file)?;
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
    let password = Zeroizing::new(password);
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
    // O JSON do vault (todas as senhas em claro) é apagado da memória ao sair.
    let vault = Zeroizing::new(vault);
    // Rejeita lixo antes de cifrar (defesa contra estado corrompido no front).
    serde_json::from_str::<serde_json::Value>(&vault)
        .map_err(|e| format!("vault inválido (não é JSON): {e}"))?;

    let guard = state.session.lock().unwrap();
    let session = guard.as_ref().ok_or("vault está trancado")?;
    let file = session.seal(vault.as_bytes()).map_err(|e| e.to_string())?;
    atomic_write(&path, &file)
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
    let old_password = Zeroizing::new(old_password);
    let new_password = Zeroizing::new(new_password);
    if new_password.is_empty() {
        return Err("a nova master password não pode ser vazia".into());
    }
    let file = std::fs::read(&path).map_err(|e| format!("falha ao ler '{path}': {e}"))?;
    let renewed = crypto::change_password(&old_password, &new_password, &file)
        .map_err(|e| e.to_string())?;
    atomic_write(&path, &renewed)?;
    // A chave guardada no keyring foi derivada do salt antigo — invalida.
    if let Ok(entry) = keyring::Entry::new(KEYRING_SERVICE, &path) {
        let _ = entry.delete_credential();
    }
    Ok(())
}

// --- Auto-type (digita direto no campo, sem passar pelo clipboard) ---

#[tauri::command(async)]
fn type_text(text: String) -> Result<(), String> {
    use enigo::{Enigo, Keyboard, Settings};
    let mut enigo =
        Enigo::new(&Settings::default()).map_err(|e| format!("auto-type indisponível: {e}"))?;
    enigo.text(&text).map_err(|e| format!("falha ao digitar: {e}"))?;
    Ok(())
}

// --- Import do export CIFRADO do Bitwarden (experimental) ---

#[tauri::command(async)]
fn import_bitwarden_encrypted(path: String, password: String) -> Result<String, String> {
    let password = Zeroizing::new(password);
    let json = std::fs::read_to_string(&path).map_err(|e| format!("falha ao ler '{path}': {e}"))?;
    bwdecrypt::decrypt_export(&json, &password)
}

// --- Desbloqueio rápido via keyring do SO (opt-in) ---

/// Guarda a chave da sessão atual no cofre do SO, para abrir sem a master depois.
/// Exige o vault destrancado.
#[tauri::command(async)]
fn enable_quick_unlock(path: String, state: State<'_, AppState>) -> Result<(), String> {
    let guard = state.session.lock().unwrap();
    let session = guard.as_ref().ok_or("destranque o vault primeiro")?;
    let b64 = base64::engine::general_purpose::STANDARD.encode(session.key_bytes());
    keyring::Entry::new(KEYRING_SERVICE, &path)
        .map_err(|e| format!("keyring: {e}"))?
        .set_password(&b64)
        .map_err(|e| format!("keyring: {e}"))
}

#[tauri::command(async)]
fn disable_quick_unlock(path: String) -> Result<(), String> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, &path).map_err(|e| format!("keyring: {e}"))?;
    match entry.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("keyring: {e}")),
    }
}

#[tauri::command(async)]
fn has_quick_unlock(path: String) -> bool {
    keyring::Entry::new(KEYRING_SERVICE, &path)
        .and_then(|e| e.get_password())
        .is_ok()
}

/// Abre o vault usando a chave guardada no keyring (sem pedir a master).
#[tauri::command(async)]
fn quick_unlock(path: String, state: State<'_, AppState>) -> Result<OpenResult, String> {
    let b64 = keyring::Entry::new(KEYRING_SERVICE, &path)
        .map_err(|e| format!("keyring: {e}"))?
        .get_password()
        .map_err(|_| "sem desbloqueio rápido para este cofre".to_string())?;
    let raw = base64::engine::general_purpose::STANDARD
        .decode(b64)
        .map_err(|_| "chave inválida no keyring".to_string())?;
    let key: [u8; 32] = raw
        .as_slice()
        .try_into()
        .map_err(|_| "tamanho de chave inválido".to_string())?;
    let file = std::fs::read(&path).map_err(|e| format!("falha ao ler '{path}': {e}"))?;
    let (plaintext, session) = crypto::open_with_key(&key, &file).map_err(|e| e.to_string())?;
    let vault =
        String::from_utf8(plaintext.to_vec()).map_err(|_| "vault não é UTF-8 válido".to_string())?;
    *state.session.lock().unwrap() = Some(session);
    Ok(OpenResult { vault })
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

/// Código TOTP atual de uma chave base32 (+ segundos restantes).
#[tauri::command(async)]
fn totp_now(secret: String) -> Result<totp::TotpCode, String> {
    totp::now(&secret)
}

/// Importa entradas de um banco KeePass `.kdbx` (leitura, decifrando com a senha).
#[tauri::command(async)]
fn import_kdbx(path: String, password: String) -> Result<Vec<kdbx::KdbxEntry>, String> {
    kdbx::import(&path, &password)
}

/// Lê um arquivo de texto (para importar CSV/JSON de outros gerenciadores).
#[tauri::command(async)]
fn read_text_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| format!("falha ao ler '{path}': {e}"))
}

/// Grava texto (para exportar o vault em JSON/CSV claro).
#[tauri::command(async)]
fn write_text_file(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, content).map_err(|e| format!("falha ao gravar '{path}': {e}"))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AttachmentData {
    name: String,
    size: u64,
    data_b64: String,
}

/// Lê um arquivo binário (anexo) e devolve nome/tamanho/base64. O conteúdo será
/// guardado dentro do blob cifrado do vault.
#[tauri::command(async)]
fn read_file_b64(path: String) -> Result<AttachmentData, String> {
    let bytes = std::fs::read(&path).map_err(|e| format!("falha ao ler '{path}': {e}"))?;
    let name = Path::new(&path)
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("arquivo")
        .to_string();
    Ok(AttachmentData {
        name,
        size: bytes.len() as u64,
        data_b64: base64::engine::general_purpose::STANDARD.encode(&bytes),
    })
}

/// Grava um anexo (base64 → bytes) no `path` escolhido (salvar/baixar anexo).
#[tauri::command(async)]
fn write_file_b64(path: String, data_b64: String) -> Result<(), String> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(data_b64.as_bytes())
        .map_err(|e| format!("base64 inválido: {e}"))?;
    std::fs::write(&path, bytes).map_err(|e| format!("falha ao gravar '{path}': {e}"))
}

/// Copia um segredo para a área de transferência **excluindo-o do histórico do
/// Windows (Win+V) e da nuvem**, limpando após 30 s. Só no Windows; nas outras
/// plataformas retorna erro e o front cai no clipboard do navegador.
#[cfg(windows)]
#[tauri::command(async)]
fn copy_secret(text: String) -> Result<(), String> {
    clipboard::copy_secret(text)
}

#[cfg(not(windows))]
#[tauri::command(async)]
fn copy_secret(_text: String) -> Result<(), String> {
    Err("clipboard nativo indisponível nesta plataforma".into())
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
            totp_now,
            import_kdbx,
            read_text_file,
            write_text_file,
            read_file_b64,
            write_file_b64,
            copy_secret,
            type_text,
            import_bitwarden_encrypted,
            enable_quick_unlock,
            disable_quick_unlock,
            has_quick_unlock,
            quick_unlock,
            get_startup_file,
        ])
        .run(tauri::generate_context!())
        .expect("erro ao iniciar o LocalKeys");
}
