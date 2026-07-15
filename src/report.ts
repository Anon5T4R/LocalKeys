// Análise local de segurança do vault (nada sai daqui). Helpers puros; a força
// (zxcvbn) é assíncrona e fica no componente.

import type { Item, Vault } from "./types";

export interface ReuseGroup {
  password: string;
  items: Item[];
}

/** Grupos de logins vivos que compartilham a mesma senha (2 ou mais). */
export function findReused(vault: Vault): ReuseGroup[] {
  const map = new Map<string, Item[]>();
  for (const it of vault.items) {
    if (it.deletedAt || it.kind !== "login") continue;
    const pw = it.login?.password ?? "";
    if (!pw) continue;
    const list = map.get(pw) ?? [];
    list.push(it);
    map.set(pw, list);
  }
  return [...map.entries()]
    .filter(([, items]) => items.length > 1)
    .map(([password, items]) => ({ password, items }))
    .sort((a, b) => b.items.length - a.items.length);
}

/** Logins vivos com senha preenchida — base para o teste de força. */
export function loginsWithPassword(vault: Vault): Item[] {
  return vault.items.filter(
    (i) => !i.deletedAt && i.kind === "login" && (i.login?.password ?? "") !== "",
  );
}
