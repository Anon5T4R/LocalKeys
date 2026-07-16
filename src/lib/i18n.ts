import { useSyncExternalStore } from "react";

/**
 * i18n leve da UI (mesmo padrão do LocalCode/LocalTranslate). O dicionário `pt`
 * é a fonte da verdade das chaves; `en`/`es` como `Record<MessageKey, string>`
 * fazem o compilador recusar chave faltando ou sobrando. O locale vive num
 * store externo (não React) pra o `t()` poder ser chamado fora de componente
 * (toasts do store). O App remonta a árvore na troca (key={locale} no main.tsx).
 *
 * NÃO traduzir: nome/marca do app (LocalKeys), endônimos de idioma, e strings
 * de formato/domínio (cabeçalhos CSV, aliases de campo no import.ts).
 */

export type Locale = "pt" | "en" | "es";

export const LOCALE_LABELS: Record<Locale, string> = {
  pt: "Português",
  en: "English",
  es: "Español",
};

const LOCALE_KEY = "localkeys.locale";

const pt = {
  // Unlock
  "unlock.tagline": "Seu cofre de senhas — 100% local, sem nuvem.",
  "unlock.tabOpen": "Abrir cofre",
  "unlock.tabCreate": "Criar cofre",
  "unlock.opening": "Abrindo:",
  "unlock.master": "Senha mestra",
  "unlock.masterPlaceholder": "sua senha mestra",
  "unlock.confirm": "Confirmar",
  "unlock.confirmPlaceholder": "repita a senha mestra",
  "unlock.warn":
    "⚠️ Não há recuperação. Se você esquecer esta senha, o cofre é irrecuperável — é o que mantém ele seguro.",
  "unlock.mismatch": "as senhas não coincidem",
  "unlock.processing": "Processando…",
  "unlock.createBtn": "Criar e destrancar",
  "unlock.openBtn": "Destrancar",
  "unlock.quick": "🔓 Desbloqueio rápido (sem senha)",

  // Sidebar / vault
  "vault.lockTitle": "Trancar (Esc)",
  "vault.lock": "🔒 Trancar",
  "vault.search": "Buscar…",
  "vault.filterAll": "Todos",
  "vault.filterFav": "★ Favoritos",
  "vault.filterLogin": "🔑 Logins",
  "vault.filterNote": "📝 Notas",
  "vault.filterCard": "💳 Cartões",
  "vault.filterIdentity": "🪪 Identidades",
  "vault.filterTrash": "🗑 Lixeira",
  "vault.folders": "Pastas",
  "vault.addFolder": "+ pasta",
  "vault.folderPlaceholder": "nome + Enter",
  "vault.delFolderTitle": "Apagar pasta (os itens ficam sem pasta)",
  "vault.new": "Novo:",
  "vault.noName": "(sem nome)",
  "vault.empty": "Nada aqui.",
  "vault.report": "🛡️ Relatório",
  "vault.importExport": "⇄ Importar / Exportar",
  "vault.quickTitle": "Abrir este cofre sem digitar a master neste computador (opt-in)",
  "vault.quickOn": "🔓 Rápido: on",
  "vault.quickOff": "🔒 Rápido: off",
  "vault.placeholder": "Selecione um item ou crie um novo.",

  // Tipos de item
  "kind.login": "Login",
  "kind.note": "Nota segura",
  "kind.card": "Cartão",
  "kind.identity": "Identidade",

  // Editor
  "editor.namePlaceholder": "Nome do {kind}",
  "editor.favorite": "Favorito",
  "editor.noFolder": "— sem pasta —",
  "editor.username": "Usuário",
  "editor.password": "Senha",
  "editor.url": "URL",
  "editor.totpKey": "TOTP (chave base32)",
  "editor.totpPlaceholder": "ex.: JBSWY3DPEHPK3PXP",
  "editor.cardholder": "Titular",
  "editor.number": "Número",
  "editor.exp": "Validade",
  "editor.expPlaceholder": "MM/AA",
  "editor.cvv": "CVV",
  "editor.firstName": "Nome",
  "editor.lastName": "Sobrenome",
  "editor.email": "E-mail",
  "editor.phone": "Telefone",
  "editor.address": "Endereço",
  "editor.notes": "Notas",
  "editor.copy": "Copiar",
  "editor.show": "Ver",
  "editor.hide": "Ocultar",
  "editor.generate": "Gerar",
  "editor.typeTitle": "Digitar no campo em foco",
  "editor.customFields": "Campos personalizados",
  "editor.add": "+ Adicionar",
  "editor.cfName": "nome",
  "editor.cfValue": "valor",
  "editor.showTitle": "Mostrar",
  "editor.hideTitle": "Ocultar",
  "editor.copyTitle": "Copiar",
  "editor.removeTitle": "Remover",
  "editor.attachments": "Anexos",
  "editor.attachHint": "(máx. 1 MB, cifrados no cofre)",
  "editor.attach": "+ Anexar",
  "editor.save": "Salvar",
  "editor.attachTooBig": "Anexo grande demais (máx. 1 MB)",
  "editor.attachSaved": "Anexo salvo",
  "editor.history": "Histórico de senhas ({n})",
  "editor.oldPassword": "Senha antiga",
  "editor.restore": "Restaurar",
  "editor.deleteConfirm": "Excluir para sempre? Não dá para desfazer.",
  "editor.deleteForever": "Excluir para sempre",
  "editor.toTrash": "🗑 Mover para a lixeira",
  "editor.fieldLabel": "Campo",
  "editor.code": "Código",

  // Gerador
  "gen.password": "Senha",
  "gen.passphrase": "Frase-senha",
  "gen.regenTitle": "Gerar outra",
  "gen.use": "Usar",
  "gen.length": "Comprimento: {n}",
  "gen.words": "Palavras: {n}",
  "gen.capitalize": "Maiúsculas",
  "gen.number": "Número",

  // Medidor de força
  "strength.0": "Muito fraca",
  "strength.1": "Fraca",
  "strength.2": "Razoável",
  "strength.3": "Boa",
  "strength.4": "Forte",

  // TOTP
  "totp.invalid": "chave TOTP inválida (base32)",
  "totp.label": "Código TOTP",
  "totp.copyTitle": "Copiar código",

  // Import/Export
  "ie.title": "Importar / Exportar",
  "ie.sub":
    "Importe de Bitwarden (JSON), Chrome/Edge, LastPass, 1Password (CSV) ou KeePass (.kdbx).",
  "ie.importFile": "📥 Importar de um arquivo…",
  "ie.exportVault": "📤 Exportar meu cofre…",
  "ie.kdbxTitle": "Abrir KeePass (.kdbx)",
  "ie.kdbxSub": "Digite a senha mestra do banco KeePass.",
  "ie.kdbxPlaceholder": "senha do .kdbx",
  "ie.import": "Importar",
  "ie.bwTitle": "Importar Bitwarden (cifrado)",
  "ie.bwWarnPre": "⚠️",
  "ie.bwWarnStrong": "Experimental:",
  "ie.bwWarnMid":
    " a decifragem do export cifrado do Bitwarden ainda não foi testada com arquivo real. Se falhar, exporte do Bitwarden como JSON",
  "ie.bwWarnNot": "não",
  "ie.bwWarnPost": "-cifrado e importe por ali.",
  "ie.bwPlaceholder": "senha do export",
  "ie.exportTitle": "Exportar cofre",
  "ie.exportWarnPre": "⚠️ O arquivo exportado fica",
  "ie.exportWarnStrong": "em claro",
  "ie.exportWarnPost":
    " (sem senha!). Qualquer um que o abrir vê todas as suas senhas. Use só para migrar e apague depois.",
  "ie.fmtJson": "JSON (todos os campos)",
  "ie.fmtCsv": "CSV (planilha)",
  "ie.exportAnyway": "Exportar em claro mesmo assim",
  "ie.done": "✅ Importado",
  "ie.doneWarnPre": "⚠️ O arquivo",
  "ie.doneWarnMid": "está",
  "ie.doneWarnClear": "em claro",
  "ie.doneWarnPost":
    ", com todas as senhas que você acabou de importar.",
  "ie.doneWarnDelete": "Apague-o",
  "ie.doneWarnEnd": "depois de conferir que veio tudo.",
  "ie.openFolder": "📂 Abrir a pasta do arquivo",
  "ie.processing": "Processando…",
  "ie.close": "Fechar",
  "ie.noItems": "Nenhum item reconhecido no arquivo.",
  "ie.noKdbx": "Nenhuma entrada encontrada no .kdbx.",
  "ie.noBw": "Nada reconhecido no arquivo.",
  "ie.exportedToast": "Exportado em claro — proteja/apague o arquivo depois",

  // Relatório de segurança
  "report.title": "🛡️ Relatório de segurança",
  "report.sub": "Feito 100% local — nada é enviado a lugar nenhum.",
  "report.reused": "Senhas repetidas",
  "report.reusedNone": "Nenhuma senha repetida. 👍",
  "report.sameCount": "{n}× a mesma senha:",
  "report.weak": "Senhas fracas",
  "report.analyzing": "Analisando…",
  "report.weakNone": "Nenhuma senha fraca. 👍",

  // Toasts (store)
  "toast.quickOn": "Desbloqueio rápido ativado neste computador",
  "toast.quickOff": "Desbloqueio rápido desativado",
  "toast.typing": "Digitando em 3 s — clique no campo de destino",
  "toast.copiedDefault": "Copiado",
  "toast.copiedNoHist": "{label} — fora do histórico, limpa em 30 s",
  "toast.copiedClipboard": "{label} — limpa em 30 s",
  "toast.importedOne": "{n} item importado",
  "toast.importedMany": "{n} itens importados",

  // Idioma
  "lang.title": "Idioma",
} as const;

export type MessageKey = keyof typeof pt;

const en: Record<MessageKey, string> = {
  "unlock.tagline": "Your password vault — 100% local, no cloud.",
  "unlock.tabOpen": "Open vault",
  "unlock.tabCreate": "Create vault",
  "unlock.opening": "Opening:",
  "unlock.master": "Master password",
  "unlock.masterPlaceholder": "your master password",
  "unlock.confirm": "Confirm",
  "unlock.confirmPlaceholder": "repeat the master password",
  "unlock.warn":
    "⚠️ There is no recovery. If you forget this password, the vault is unrecoverable — that's what keeps it secure.",
  "unlock.mismatch": "the passwords don't match",
  "unlock.processing": "Processing…",
  "unlock.createBtn": "Create and unlock",
  "unlock.openBtn": "Unlock",
  "unlock.quick": "🔓 Quick unlock (no password)",

  "vault.lockTitle": "Lock (Esc)",
  "vault.lock": "🔒 Lock",
  "vault.search": "Search…",
  "vault.filterAll": "All",
  "vault.filterFav": "★ Favorites",
  "vault.filterLogin": "🔑 Logins",
  "vault.filterNote": "📝 Notes",
  "vault.filterCard": "💳 Cards",
  "vault.filterIdentity": "🪪 Identities",
  "vault.filterTrash": "🗑 Trash",
  "vault.folders": "Folders",
  "vault.addFolder": "+ folder",
  "vault.folderPlaceholder": "name + Enter",
  "vault.delFolderTitle": "Delete folder (items become unfiled)",
  "vault.new": "New:",
  "vault.noName": "(no name)",
  "vault.empty": "Nothing here.",
  "vault.report": "🛡️ Report",
  "vault.importExport": "⇄ Import / Export",
  "vault.quickTitle": "Open this vault without typing the master on this computer (opt-in)",
  "vault.quickOn": "🔓 Quick: on",
  "vault.quickOff": "🔒 Quick: off",
  "vault.placeholder": "Select an item or create a new one.",

  "kind.login": "Login",
  "kind.note": "Secure note",
  "kind.card": "Card",
  "kind.identity": "Identity",

  "editor.namePlaceholder": "{kind} name",
  "editor.favorite": "Favorite",
  "editor.noFolder": "— no folder —",
  "editor.username": "Username",
  "editor.password": "Password",
  "editor.url": "URL",
  "editor.totpKey": "TOTP (base32 key)",
  "editor.totpPlaceholder": "e.g.: JBSWY3DPEHPK3PXP",
  "editor.cardholder": "Cardholder",
  "editor.number": "Number",
  "editor.exp": "Expiry",
  "editor.expPlaceholder": "MM/YY",
  "editor.cvv": "CVV",
  "editor.firstName": "First name",
  "editor.lastName": "Last name",
  "editor.email": "E-mail",
  "editor.phone": "Phone",
  "editor.address": "Address",
  "editor.notes": "Notes",
  "editor.copy": "Copy",
  "editor.show": "Show",
  "editor.hide": "Hide",
  "editor.generate": "Generate",
  "editor.typeTitle": "Type into the focused field",
  "editor.customFields": "Custom fields",
  "editor.add": "+ Add",
  "editor.cfName": "name",
  "editor.cfValue": "value",
  "editor.showTitle": "Show",
  "editor.hideTitle": "Hide",
  "editor.copyTitle": "Copy",
  "editor.removeTitle": "Remove",
  "editor.attachments": "Attachments",
  "editor.attachHint": "(max. 1 MB, encrypted in the vault)",
  "editor.attach": "+ Attach",
  "editor.save": "Save",
  "editor.attachTooBig": "Attachment too big (max. 1 MB)",
  "editor.attachSaved": "Attachment saved",
  "editor.history": "Password history ({n})",
  "editor.oldPassword": "Old password",
  "editor.restore": "Restore",
  "editor.deleteConfirm": "Delete forever? This can't be undone.",
  "editor.deleteForever": "Delete forever",
  "editor.toTrash": "🗑 Move to trash",
  "editor.fieldLabel": "Field",
  "editor.code": "Code",

  "gen.password": "Password",
  "gen.passphrase": "Passphrase",
  "gen.regenTitle": "Generate another",
  "gen.use": "Use",
  "gen.length": "Length: {n}",
  "gen.words": "Words: {n}",
  "gen.capitalize": "Capitalize",
  "gen.number": "Number",

  "strength.0": "Very weak",
  "strength.1": "Weak",
  "strength.2": "Fair",
  "strength.3": "Good",
  "strength.4": "Strong",

  "totp.invalid": "invalid TOTP key (base32)",
  "totp.label": "TOTP code",
  "totp.copyTitle": "Copy code",

  "ie.title": "Import / Export",
  "ie.sub":
    "Import from Bitwarden (JSON), Chrome/Edge, LastPass, 1Password (CSV) or KeePass (.kdbx).",
  "ie.importFile": "📥 Import from a file…",
  "ie.exportVault": "📤 Export my vault…",
  "ie.kdbxTitle": "Open KeePass (.kdbx)",
  "ie.kdbxSub": "Type the KeePass database master password.",
  "ie.kdbxPlaceholder": "the .kdbx password",
  "ie.import": "Import",
  "ie.bwTitle": "Import Bitwarden (encrypted)",
  "ie.bwWarnPre": "⚠️",
  "ie.bwWarnStrong": "Experimental:",
  "ie.bwWarnMid":
    " decrypting Bitwarden's encrypted export hasn't been tested with a real file yet. If it fails, export from Bitwarden as",
  "ie.bwWarnNot": "un",
  "ie.bwWarnPost": "encrypted JSON and import that instead.",
  "ie.bwPlaceholder": "the export password",
  "ie.exportTitle": "Export vault",
  "ie.exportWarnPre": "⚠️ The exported file is",
  "ie.exportWarnStrong": "in the clear",
  "ie.exportWarnPost":
    " (no password!). Anyone who opens it sees all your passwords. Use it only to migrate and delete it afterwards.",
  "ie.fmtJson": "JSON (all fields)",
  "ie.fmtCsv": "CSV (spreadsheet)",
  "ie.exportAnyway": "Export in the clear anyway",
  "ie.done": "✅ Imported",
  "ie.doneWarnPre": "⚠️ The file",
  "ie.doneWarnMid": "is",
  "ie.doneWarnClear": "in the clear",
  "ie.doneWarnPost": ", with all the passwords you just imported.",
  "ie.doneWarnDelete": "Delete it",
  "ie.doneWarnEnd": "after checking that everything came through.",
  "ie.openFolder": "📂 Open the file's folder",
  "ie.processing": "Processing…",
  "ie.close": "Close",
  "ie.noItems": "No item recognized in the file.",
  "ie.noKdbx": "No entry found in the .kdbx.",
  "ie.noBw": "Nothing recognized in the file.",
  "ie.exportedToast": "Exported in the clear — protect/delete the file afterwards",

  "report.title": "🛡️ Security report",
  "report.sub": "Done 100% locally — nothing is sent anywhere.",
  "report.reused": "Reused passwords",
  "report.reusedNone": "No reused passwords. 👍",
  "report.sameCount": "{n}× the same password:",
  "report.weak": "Weak passwords",
  "report.analyzing": "Analyzing…",
  "report.weakNone": "No weak passwords. 👍",

  "toast.quickOn": "Quick unlock enabled on this computer",
  "toast.quickOff": "Quick unlock disabled",
  "toast.typing": "Typing in 3 s — click the target field",
  "toast.copiedDefault": "Copied",
  "toast.copiedNoHist": "{label} — off the history, clears in 30 s",
  "toast.copiedClipboard": "{label} — clears in 30 s",
  "toast.importedOne": "{n} item imported",
  "toast.importedMany": "{n} items imported",

  "lang.title": "Language",
};

const es: Record<MessageKey, string> = {
  "unlock.tagline": "Tu caja fuerte de contraseñas — 100% local, sin nube.",
  "unlock.tabOpen": "Abrir caja",
  "unlock.tabCreate": "Crear caja",
  "unlock.opening": "Abriendo:",
  "unlock.master": "Contraseña maestra",
  "unlock.masterPlaceholder": "tu contraseña maestra",
  "unlock.confirm": "Confirmar",
  "unlock.confirmPlaceholder": "repite la contraseña maestra",
  "unlock.warn":
    "⚠️ No hay recuperación. Si olvidas esta contraseña, la caja es irrecuperable — eso es lo que la mantiene segura.",
  "unlock.mismatch": "las contraseñas no coinciden",
  "unlock.processing": "Procesando…",
  "unlock.createBtn": "Crear y desbloquear",
  "unlock.openBtn": "Desbloquear",
  "unlock.quick": "🔓 Desbloqueo rápido (sin contraseña)",

  "vault.lockTitle": "Bloquear (Esc)",
  "vault.lock": "🔒 Bloquear",
  "vault.search": "Buscar…",
  "vault.filterAll": "Todos",
  "vault.filterFav": "★ Favoritos",
  "vault.filterLogin": "🔑 Accesos",
  "vault.filterNote": "📝 Notas",
  "vault.filterCard": "💳 Tarjetas",
  "vault.filterIdentity": "🪪 Identidades",
  "vault.filterTrash": "🗑 Papelera",
  "vault.folders": "Carpetas",
  "vault.addFolder": "+ carpeta",
  "vault.folderPlaceholder": "nombre + Enter",
  "vault.delFolderTitle": "Borrar carpeta (los elementos quedan sin carpeta)",
  "vault.new": "Nuevo:",
  "vault.noName": "(sin nombre)",
  "vault.empty": "Nada aquí.",
  "vault.report": "🛡️ Informe",
  "vault.importExport": "⇄ Importar / Exportar",
  "vault.quickTitle": "Abrir esta caja sin escribir la maestra en este equipo (opcional)",
  "vault.quickOn": "🔓 Rápido: sí",
  "vault.quickOff": "🔒 Rápido: no",
  "vault.placeholder": "Selecciona un elemento o crea uno nuevo.",

  "kind.login": "Acceso",
  "kind.note": "Nota segura",
  "kind.card": "Tarjeta",
  "kind.identity": "Identidad",

  "editor.namePlaceholder": "Nombre del {kind}",
  "editor.favorite": "Favorito",
  "editor.noFolder": "— sin carpeta —",
  "editor.username": "Usuario",
  "editor.password": "Contraseña",
  "editor.url": "URL",
  "editor.totpKey": "TOTP (clave base32)",
  "editor.totpPlaceholder": "ej.: JBSWY3DPEHPK3PXP",
  "editor.cardholder": "Titular",
  "editor.number": "Número",
  "editor.exp": "Caducidad",
  "editor.expPlaceholder": "MM/AA",
  "editor.cvv": "CVV",
  "editor.firstName": "Nombre",
  "editor.lastName": "Apellido",
  "editor.email": "Correo",
  "editor.phone": "Teléfono",
  "editor.address": "Dirección",
  "editor.notes": "Notas",
  "editor.copy": "Copiar",
  "editor.show": "Ver",
  "editor.hide": "Ocultar",
  "editor.generate": "Generar",
  "editor.typeTitle": "Escribir en el campo enfocado",
  "editor.customFields": "Campos personalizados",
  "editor.add": "+ Añadir",
  "editor.cfName": "nombre",
  "editor.cfValue": "valor",
  "editor.showTitle": "Mostrar",
  "editor.hideTitle": "Ocultar",
  "editor.copyTitle": "Copiar",
  "editor.removeTitle": "Quitar",
  "editor.attachments": "Adjuntos",
  "editor.attachHint": "(máx. 1 MB, cifrados en la caja)",
  "editor.attach": "+ Adjuntar",
  "editor.save": "Guardar",
  "editor.attachTooBig": "Adjunto demasiado grande (máx. 1 MB)",
  "editor.attachSaved": "Adjunto guardado",
  "editor.history": "Historial de contraseñas ({n})",
  "editor.oldPassword": "Contraseña anterior",
  "editor.restore": "Restaurar",
  "editor.deleteConfirm": "¿Eliminar para siempre? No se puede deshacer.",
  "editor.deleteForever": "Eliminar para siempre",
  "editor.toTrash": "🗑 Mover a la papelera",
  "editor.fieldLabel": "Campo",
  "editor.code": "Código",

  "gen.password": "Contraseña",
  "gen.passphrase": "Frase-contraseña",
  "gen.regenTitle": "Generar otra",
  "gen.use": "Usar",
  "gen.length": "Longitud: {n}",
  "gen.words": "Palabras: {n}",
  "gen.capitalize": "Mayúsculas",
  "gen.number": "Número",

  "strength.0": "Muy débil",
  "strength.1": "Débil",
  "strength.2": "Aceptable",
  "strength.3": "Buena",
  "strength.4": "Fuerte",

  "totp.invalid": "clave TOTP inválida (base32)",
  "totp.label": "Código TOTP",
  "totp.copyTitle": "Copiar código",

  "ie.title": "Importar / Exportar",
  "ie.sub":
    "Importa de Bitwarden (JSON), Chrome/Edge, LastPass, 1Password (CSV) o KeePass (.kdbx).",
  "ie.importFile": "📥 Importar desde un archivo…",
  "ie.exportVault": "📤 Exportar mi caja…",
  "ie.kdbxTitle": "Abrir KeePass (.kdbx)",
  "ie.kdbxSub": "Escribe la contraseña maestra de la base KeePass.",
  "ie.kdbxPlaceholder": "contraseña del .kdbx",
  "ie.import": "Importar",
  "ie.bwTitle": "Importar Bitwarden (cifrado)",
  "ie.bwWarnPre": "⚠️",
  "ie.bwWarnStrong": "Experimental:",
  "ie.bwWarnMid":
    " el descifrado del export cifrado de Bitwarden aún no se ha probado con un archivo real. Si falla, exporta de Bitwarden como JSON",
  "ie.bwWarnNot": "no",
  "ie.bwWarnPost": " cifrado e impórtalo por ahí.",
  "ie.bwPlaceholder": "contraseña del export",
  "ie.exportTitle": "Exportar caja",
  "ie.exportWarnPre": "⚠️ El archivo exportado queda",
  "ie.exportWarnStrong": "en claro",
  "ie.exportWarnPost":
    " (¡sin contraseña!). Cualquiera que lo abra ve todas tus contraseñas. Úsalo solo para migrar y bórralo después.",
  "ie.fmtJson": "JSON (todos los campos)",
  "ie.fmtCsv": "CSV (hoja de cálculo)",
  "ie.exportAnyway": "Exportar en claro de todos modos",
  "ie.done": "✅ Importado",
  "ie.doneWarnPre": "⚠️ El archivo",
  "ie.doneWarnMid": "está",
  "ie.doneWarnClear": "en claro",
  "ie.doneWarnPost": ", con todas las contraseñas que acabas de importar.",
  "ie.doneWarnDelete": "Bórralo",
  "ie.doneWarnEnd": "después de comprobar que llegó todo.",
  "ie.openFolder": "📂 Abrir la carpeta del archivo",
  "ie.processing": "Procesando…",
  "ie.close": "Cerrar",
  "ie.noItems": "Ningún elemento reconocido en el archivo.",
  "ie.noKdbx": "No se encontró ninguna entrada en el .kdbx.",
  "ie.noBw": "Nada reconocido en el archivo.",
  "ie.exportedToast": "Exportado en claro — protege/borra el archivo después",

  "report.title": "🛡️ Informe de seguridad",
  "report.sub": "Hecho 100% local — nada se envía a ningún lado.",
  "report.reused": "Contraseñas repetidas",
  "report.reusedNone": "Ninguna contraseña repetida. 👍",
  "report.sameCount": "{n}× la misma contraseña:",
  "report.weak": "Contraseñas débiles",
  "report.analyzing": "Analizando…",
  "report.weakNone": "Ninguna contraseña débil. 👍",

  "toast.quickOn": "Desbloqueo rápido activado en este equipo",
  "toast.quickOff": "Desbloqueo rápido desactivado",
  "toast.typing": "Escribiendo en 3 s — haz clic en el campo de destino",
  "toast.copiedDefault": "Copiado",
  "toast.copiedNoHist": "{label} — fuera del historial, se borra en 30 s",
  "toast.copiedClipboard": "{label} — se borra en 30 s",
  "toast.importedOne": "{n} elemento importado",
  "toast.importedMany": "{n} elementos importados",

  "lang.title": "Idioma",
};

const DICTS: Record<Locale, Record<MessageKey, string>> = { pt, en, es };

/** Palpite de locale pelo idioma do sistema (só no 1º uso). */
export function detectLocale(): Locale {
  const l = (typeof navigator !== "undefined" ? navigator.language : "pt").toLowerCase();
  if (l.startsWith("en")) return "en";
  if (l.startsWith("es")) return "es";
  return "pt";
}

function loadLocale(): Locale {
  const v = typeof localStorage !== "undefined" ? localStorage.getItem(LOCALE_KEY) : null;
  return v === "pt" || v === "en" || v === "es" ? v : detectLocale();
}

let current: Locale = loadLocale();
const listeners = new Set<() => void>();

export function getLocale(): Locale {
  return current;
}

export function setLocale(locale: Locale) {
  if (locale === current) return;
  current = locale;
  try {
    localStorage.setItem(LOCALE_KEY, locale);
  } catch {
    /* localStorage indisponível */
  }
  for (const l of listeners) l();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Inscreve o componente nas trocas de locale. */
export function useLocale(): Locale {
  return useSyncExternalStore(subscribe, getLocale);
}

/** Traduz uma chave, interpolando placeholders `{param}`. */
export function t(key: MessageKey, params?: Record<string, string | number>): string {
  let msg: string = DICTS[current][key] ?? pt[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      msg = msg.split(`{${k}}`).join(String(v));
    }
  }
  return msg;
}
