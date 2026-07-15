// Importadores de outros gerenciadores → Item[] do LocalKeys.
//
// - Bitwarden JSON (export não-cifrado): mapeia os 4 tipos.
// - CSV: Chrome/Edge, LastPass, 1Password e genérico, por mapeamento de colunas.
// - KeePass .kdbx: a leitura/decifragem é feita no Rust; aqui só mapeamos.

import { emptyItem, type Item, type ItemKind } from "./types";
import type { KdbxEntry } from "./api";

export type ImportFormat = "bitwarden-json" | "csv" | "kdbx" | "unknown";

export function detectFormat(filename: string, content?: string): ImportFormat {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".kdbx")) return "kdbx";
  if (lower.endsWith(".json")) return "bitwarden-json";
  if (lower.endsWith(".csv")) return "csv";
  if (content) {
    const t = content.trimStart();
    if (t.startsWith("{") || t.startsWith("[")) return "bitwarden-json";
    return "csv";
  }
  return "unknown";
}

/** Extrai só o segredo base32 de um campo TOTP que pode vir como `otpauth://…?secret=X`. */
function extractSecret(raw: string): string {
  const r = (raw ?? "").trim();
  for (const m of ["secret=", "key="]) {
    const idx = r.toLowerCase().indexOf(m);
    if (idx >= 0) {
      const rest = r.slice(idx + m.length);
      const end = rest.indexOf("&");
      return end >= 0 ? rest.slice(0, end) : rest;
    }
  }
  return r;
}

// ---------- CSV ----------

/** Parser de CSV tolerante a aspas, vírgulas e quebras de linha dentro de campo. */
export function parseCsv(text: string): string[][] {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // BOM
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i++;
    } else if (c === ",") {
      row.push(field);
      field = "";
      i++;
    } else if (c === "\r") {
      i++;
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i++;
    } else {
      field += c;
      i++;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim() !== ""));
}

const COLS = {
  name: ["name", "title", "account", "item name"],
  username: ["username", "user", "login_username", "user name", "login", "email"],
  password: ["password", "pass", "login_password"],
  url: ["url", "uri", "website", "login_uri", "web site"],
  totp: ["totp", "otpauth", "otp", "one-time password", "verification code", "otp secret"],
  notes: ["notes", "note", "extra", "comment", "comments"],
};

function findCol(headers: string[], keys: string[]): number {
  const norm = headers.map((h) => h.trim().toLowerCase());
  for (const k of keys) {
    const idx = norm.indexOf(k);
    if (idx >= 0) return idx;
  }
  for (let i = 0; i < norm.length; i++) {
    if (keys.some((k) => norm[i].includes(k))) return i;
  }
  return -1;
}

export function parseCsvItems(text: string): Item[] {
  const rows = parseCsv(text);
  if (rows.length < 2) return [];
  const headers = rows[0];
  const ci = {
    name: findCol(headers, COLS.name),
    username: findCol(headers, COLS.username),
    password: findCol(headers, COLS.password),
    url: findCol(headers, COLS.url),
    totp: findCol(headers, COLS.totp),
    notes: findCol(headers, COLS.notes),
  };
  const cell = (row: string[], idx: number) => (idx >= 0 ? (row[idx] ?? "").trim() : "");
  const items: Item[] = [];
  for (const row of rows.slice(1)) {
    const it = emptyItem("login");
    it.name =
      cell(row, ci.name) || cell(row, ci.url) || cell(row, ci.username) || "(sem nome)";
    it.notes = cell(row, ci.notes);
    const uris = [cell(row, ci.url)].filter(Boolean);
    it.login = {
      username: cell(row, ci.username),
      password: cell(row, ci.password),
      uris: uris.length ? uris : [""],
      totp: extractSecret(cell(row, ci.totp)),
    };
    items.push(it);
  }
  return items;
}

// ---------- Bitwarden JSON ----------

function bwKind(t: number): ItemKind {
  switch (t) {
    case 2:
      return "note";
    case 3:
      return "card";
    case 4:
      return "identity";
    default:
      return "login";
  }
}

export function parseBitwardenJson(text: string): Item[] {
  const data = JSON.parse(text);
  const arr: any[] = Array.isArray(data) ? data : (data.items ?? []);
  const items: Item[] = [];
  for (const b of arr) {
    const kind = bwKind(b.type);
    const it = emptyItem(kind);
    it.name = b.name ?? "(sem nome)";
    it.notes = b.notes ?? "";
    it.favorite = !!b.favorite;
    if (kind === "login" && b.login) {
      const uris = (b.login.uris ?? []).map((u: any) => u?.uri ?? "").filter(Boolean);
      it.login = {
        username: b.login.username ?? "",
        password: b.login.password ?? "",
        uris: uris.length ? uris : [""],
        totp: extractSecret(b.login.totp ?? ""),
      };
    } else if (kind === "card" && b.card) {
      it.card = {
        cardholder: b.card.cardholderName ?? "",
        brand: b.card.brand ?? "",
        number: b.card.number ?? "",
        exp: [b.card.expMonth, b.card.expYear].filter(Boolean).join("/"),
        code: b.card.code ?? "",
      };
    } else if (kind === "identity" && b.identity) {
      const id = b.identity;
      it.identity = {
        firstName: id.firstName ?? "",
        lastName: id.lastName ?? "",
        email: id.email ?? "",
        phone: id.phone ?? "",
        address: [id.address1, id.city, id.state, id.postalCode, id.country]
          .filter(Boolean)
          .join(", "),
      };
    }
    items.push(it);
  }
  return items;
}

// ---------- KeePass (.kdbx) — vem do Rust ----------

export function kdbxToItems(entries: KdbxEntry[]): Item[] {
  return entries.map((e) => {
    const it = emptyItem("login");
    it.name = e.name || e.url || e.username || "(sem nome)";
    it.notes = e.notes;
    it.login = {
      username: e.username,
      password: e.password,
      uris: e.url ? [e.url] : [""],
      totp: e.totp,
    };
    return it;
  });
}

/** Import de texto (JSON/CSV). Para `.kdbx` use `api.importKdbx` + `kdbxToItems`. */
export function parseText(filename: string, content: string): { items: Item[]; format: ImportFormat } {
  const fmt = detectFormat(filename, content);
  if (fmt === "bitwarden-json") {
    return { items: parseBitwardenJson(content), format: "bitwarden-json" };
  }
  return { items: parseCsvItems(content), format: "csv" };
}
