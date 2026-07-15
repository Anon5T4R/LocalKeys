//! Clipboard no Windows com **exclusão do histórico (Win+V) e da nuvem**.
//!
//! O `navigator.clipboard` do WebView não expõe os formatos que dizem ao Windows
//! "não registre isto no histórico nem sincronize na nuvem" — então uma senha
//! copiada ficava no `Win+V` mesmo depois de limpa. Aqui escrevemos pelo Win32
//! marcando esses formatos, do jeito que KeePass/1Password fazem, e limpamos a
//! área de transferência após 30 s (só se ainda for o nosso texto).

use std::time::Duration;

use clipboard_win::{empty, get_clipboard_string, raw, register_format, with_clipboard, Clipboard};

/// Formatos que instruem o Windows a não guardar/sincronizar o conteúdo.
const EXCLUSION_FORMATS: [&str; 3] = [
    "ExcludeClipboardContentFromMonitorProcessing",
    "CanIncludeInClipboardHistory",
    "CanUploadToCloudClipboard",
];

const CLEAR_AFTER: Duration = Duration::from_secs(30);

pub fn copy_secret(text: String) -> Result<(), String> {
    {
        // Abre a área de transferência (RAII: fecha ao sair do bloco).
        let _clip = Clipboard::new_attempts(10).map_err(|e| format!("abrir clipboard: {e}"))?;
        // set_string limpa e grava o texto (CF_UNICODETEXT).
        raw::set_string(&text).map_err(|e| format!("gravar clipboard: {e}"))?;
        // Adiciona os formatos de exclusão SEM limpar o texto.
        for name in EXCLUSION_FORMATS {
            if let Some(fmt) = register_format(name) {
                let _ = raw::set_without_clear(fmt.get(), &[0u8; 4]);
            }
        }
    }

    // Limpa em 30 s, mas só se a área de transferência ainda contiver o segredo
    // (para não apagar algo que o usuário copiou depois).
    std::thread::spawn(move || {
        std::thread::sleep(CLEAR_AFTER);
        if let Ok(current) = get_clipboard_string() {
            if current == text {
                let _ = with_clipboard(|| {
                    let _ = empty();
                });
            }
        }
    });
    Ok(())
}
