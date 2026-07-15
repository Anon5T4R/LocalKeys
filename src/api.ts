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
  startupFile: () => invoke<string | null>("get_startup_file"),

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
