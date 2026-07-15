// Export do vault em claro (JSON ou CSV). SEM cifra — use só para migrar para
// outro app; a UI mostra um aviso forte antes de gravar.

import type { Vault } from "./types";

export function exportJson(vault: Vault): string {
  // Só os itens vivos (fora da lixeira).
  const items = vault.items.filter((i) => !i.deletedAt);
  return JSON.stringify({ ...vault, items }, null, 2);
}

function csvEscape(v: string): string {
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function exportCsv(vault: Vault): string {
  const headers = ["name", "type", "username", "password", "url", "totp", "notes", "favorite"];
  const lines = [headers.join(",")];
  for (const it of vault.items) {
    if (it.deletedAt) continue;
    const row = [
      it.name,
      it.kind,
      it.login?.username ?? it.card?.cardholder ?? "",
      it.login?.password ?? it.card?.number ?? it.card?.code ?? "",
      it.login?.uris?.[0] ?? "",
      it.login?.totp ?? "",
      it.notes ?? "",
      it.favorite ? "1" : "0",
    ].map((v) => csvEscape(String(v ?? "")));
    lines.push(row.join(","));
  }
  return lines.join("\r\n");
}
