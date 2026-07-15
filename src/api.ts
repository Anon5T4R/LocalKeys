// Ponte com o back-end Rust. Toda cripto acontece lá; aqui só passamos caminho,
// senha (uma vez) e o JSON do vault. A chave nunca vem para cá.

import { invoke } from "@tauri-apps/api/core";
import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";

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
  startupFile: () => invoke<string | null>("get_startup_file"),

  pickFileOpen: () => openDialog({ multiple: false }) as Promise<string | null>,
  pickFileSave: (name: string) =>
    saveDialog({ defaultPath: name }) as Promise<string | null>,

  pickImport: () =>
    openDialog({
      multiple: false,
      filters: [
        { name: "Exportações", extensions: ["json", "csv", "kdbx"] },
        { name: "Todos", extensions: ["*"] },
      ],
    }) as Promise<string | null>,
  pickExportPath: (ext: "json" | "csv") =>
    saveDialog({
      defaultPath: `localkeys-export.${ext}`,
      filters: [{ name: ext.toUpperCase(), extensions: [ext] }],
    }) as Promise<string | null>,

  pickOpen: () =>
    openDialog({
      multiple: false,
      filters: [{ name: "Vault LocalKeys", extensions: ["tkeys"] }],
    }) as Promise<string | null>,
  pickSave: () =>
    saveDialog({
      defaultPath: "meu-cofre.tkeys",
      filters: [{ name: "Vault LocalKeys", extensions: ["tkeys"] }],
    }) as Promise<string | null>,
};
