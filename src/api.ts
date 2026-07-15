// Ponte com o back-end Rust. Toda cripto acontece lá; aqui só passamos caminho,
// senha (uma vez) e o JSON do vault. A chave nunca vem para cá.

import { invoke } from "@tauri-apps/api/core";
import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { getLastDir, joinDir, rememberDir } from "./prefs";

/** Abre um diálogo de abrir arquivo começando na última pasta usada. */
async function openInLastDir(
  filters?: { name: string; extensions: string[] }[],
): Promise<string | null> {
  const dir = getLastDir();
  const p = (await openDialog({
    multiple: false,
    defaultPath: dir ?? undefined,
    filters,
  })) as string | null;
  if (p) rememberDir(p);
  return p;
}

/** Abre um diálogo de salvar já na última pasta, sugerindo `name`. */
async function saveInLastDir(
  name: string,
  filters?: { name: string; extensions: string[] }[],
): Promise<string | null> {
  const dir = getLastDir();
  const p = (await saveDialog({
    defaultPath: dir ? joinDir(dir, name) : name,
    filters,
  })) as string | null;
  if (p) rememberDir(p);
  return p;
}

export interface PasswordOptions {
  length: number;
  lowercase: boolean;
  uppercase: boolean;
  digits: boolean;
  symbols: boolean;
}

export interface PassphraseOptions {
  words: number;
  separator: string;
  capitalize: boolean;
  includeNumber: boolean;
}

export interface Strength {
  score: number; // 0..4
  guessesLog10: number;
}

export interface TotpCode {
  code: string;
  period: number;
  secondsRemaining: number;
}

export interface KdbxEntry {
  name: string;
  username: string;
  password: string;
  url: string;
  totp: string;
  notes: string;
}

export interface AttachmentData {
  name: string;
  size: number;
  dataB64: string;
}

export const api = {
  createVault: (path: string, password: string) =>
    invoke<{ vault: string }>("create_vault", { path, password }),
  openVault: (path: string, password: string) =>
    invoke<{ vault: string }>("open_vault", { path, password }),
  saveVault: (path: string, vault: string) =>
    invoke<void>("save_vault", { path, vault }),
  lock: () => invoke<void>("lock_vault"),
  isUnlocked: () => invoke<boolean>("is_unlocked"),
  changeMaster: (path: string, oldPassword: string, newPassword: string) =>
    invoke<void>("change_master_password", { path, oldPassword, newPassword }),
  generatePassword: (opts: PasswordOptions) =>
    invoke<string>("generate_password", { opts }),
  generatePassphrase: (opts: PassphraseOptions) =>
    invoke<string>("generate_passphrase", { opts }),
  strength: (password: string, userInputs: string[]) =>
    invoke<Strength>("password_strength", { password, userInputs }),
  totpNow: (secret: string) => invoke<TotpCode>("totp_now", { secret }),
  importKdbx: (path: string, password: string) =>
    invoke<KdbxEntry[]>("import_kdbx", { path, password }),
  readTextFile: (path: string) => invoke<string>("read_text_file", { path }),
  writeTextFile: (path: string, content: string) =>
    invoke<void>("write_text_file", { path, content }),
  readFileB64: (path: string) => invoke<AttachmentData>("read_file_b64", { path }),
  writeFileB64: (path: string, dataB64: string) =>
    invoke<void>("write_file_b64", { path, dataB64 }),
  /** Copia um segredo protegendo do histórico do Windows (só no Windows). */
  copySecretNative: (text: string) => invoke<void>("copy_secret", { text }),
  /** Auto-type: digita o texto no campo que estiver com foco. */
  typeText: (text: string) => invoke<void>("type_text", { text }),
  /** Import do export CIFRADO do Bitwarden → devolve o JSON claro (experimental). */
  importBitwardenEncrypted: (path: string, password: string) =>
    invoke<string>("import_bitwarden_encrypted", { path, password }),
  enableQuickUnlock: (path: string) => invoke<void>("enable_quick_unlock", { path }),
  disableQuickUnlock: (path: string) => invoke<void>("disable_quick_unlock", { path }),
  hasQuickUnlock: (path: string) => invoke<boolean>("has_quick_unlock", { path }),
  quickUnlock: (path: string) => invoke<{ vault: string }>("quick_unlock", { path }),
  startupFile: () => invoke<string | null>("get_startup_file"),

  /** Abre o gerenciador de arquivos destacando este arquivo (ex.: o CSV a apagar). */
  revealFile: (path: string) => revealItemInDir(path),

  pickFileOpen: () => openInLastDir(),
  pickFileSave: (name: string) => saveInLastDir(name),

  pickImport: () =>
    openInLastDir([
      { name: "Exportações", extensions: ["json", "csv", "kdbx"] },
      { name: "Todos", extensions: ["*"] },
    ]),
  pickExportPath: (ext: "json" | "csv") =>
    saveInLastDir(`localkeys-export.${ext}`, [{ name: ext.toUpperCase(), extensions: [ext] }]),

  pickOpen: () =>
    openInLastDir([{ name: "Vault LocalKeys", extensions: ["tkeys"] }]),
  pickSave: () =>
    saveInLastDir("meu-cofre.tkeys", [{ name: "Vault LocalKeys", extensions: ["tkeys"] }]),
};
