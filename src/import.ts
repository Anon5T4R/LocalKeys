// Importadores de outros gerenciadores → Item[] do LocalKeys.
//
// - Bitwarden JSON (export não-cifrado): mapeia os 4 tipos.
// - CSV: Chrome/Edge, LastPass, 1Password e genérico, por mapeamento de colunas.
// - KeePass .kdbx: a leitura/decifragem é feita no Rust; aqui só mapeamos.

import { emptyItem, type CustomField, type Item, type ItemKind } from "./types";
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

/** Detecta o separador do CSV (vírgula, ponto-e-vírgula ou tab) pela 1ª linha. */
function detectDelimiter(text: string): string {
  const nl = text.indexOf("\n");
  const first = nl >= 0 ? text.slice(0, nl) : text;
  const counts: Record<string, number> = { ",": 0, ";": 0, "\t": 0 };
  for (const c of first) if (c in counts) counts[c]++;
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

/** Parser de CSV tolerante a aspas, separador variável e quebras dentro de campo. */
export function parseCsv(text: string, delim = ","): string[][] {
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
    } else if (c === delim) {
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
  username: ["username", "user", "login_username", "user name", "login", "usuário", "usuario"],
  email: ["email", "e-mail", "e mail"],
  password: ["password", "pass", "login_password", "senha"],
  url: ["url", "uri", "website", "login_uri", "web site", "site", "endereço"],
  totp: ["totp", "otpauth", "otp", "one-time password", "verification code", "otp secret", "2fa"],
  notes: ["notes", "note", "extra", "comment", "comments", "nota", "observações"],
};

/** Cabeçalhos de metadados que NÃO viram campo personalizado (só ruído). */
const IGNORE = new Set([
  "type",
  "vault",
  "guid",
  "grouping",
  "fav",
  "favorite",
  "httprealm",
  "formactionorigin",
  "timecreated",
  "timelastused",
  "timepasswordchanged",
  "created",
  "modified",
  "reprompt",
  "android_app",
]);

function field(name: string, value: string, hidden = false): CustomField {
  return { id: crypto.randomUUID(), name, value, hidden };
}

export function parseCsvItems(text: string): Item[] {
  const rows = parseCsv(text, detectDelimiter(text));
  if (rows.length < 2) return [];
  const headers = rows[0];
  const norm = headers.map((h) => h.trim().toLowerCase());
  const consumed = new Set<number>();

  const exact = (keys: string[]): number => {
    for (const k of keys) {
      const i = norm.indexOf(k);
      if (i >= 0 && !consumed.has(i)) {
        consumed.add(i);
        return i;
      }
    }
    return -1;
  };
  const partial = (keys: string[]): number => {
    for (let i = 0; i < norm.length; i++) {
      if (!consumed.has(i) && keys.some((k) => norm[i].includes(k))) {
        consumed.add(i);
        return i;
      }
    }
    return -1;
  };
  // 1ª rodada exata (evita "name" casar com "username"); 2ª rodada parcial.
  const ci = {
    name: exact(COLS.name),
    email: exact(COLS.email),
    username: exact(COLS.username),
    password: exact(COLS.password),
    url: exact(COLS.url),
    totp: exact(COLS.totp),
    notes: exact(COLS.notes),
  };
  ci.name = ci.name >= 0 ? ci.name : partial(COLS.name);
  ci.username = ci.username >= 0 ? ci.username : partial(COLS.username);
  ci.password = ci.password >= 0 ? ci.password : partial(COLS.password);
  ci.url = ci.url >= 0 ? ci.url : partial(COLS.url);
  ci.totp = ci.totp >= 0 ? ci.totp : partial(COLS.totp);
  ci.notes = ci.notes >= 0 ? ci.notes : partial(COLS.notes);

  const cell = (row: string[], idx: number) => (idx >= 0 ? (row[idx] ?? "").trim() : "");
  const items: Item[] = [];
  for (const row of rows.slice(1)) {
    const it = emptyItem("login");
    const email = cell(row, ci.email);
    const username = cell(row, ci.username) || email; // usuário cai pro email
    const url = cell(row, ci.url);
    it.name = cell(row, ci.name) || url || username || "(sem nome)";
    it.notes = cell(row, ci.notes);
    it.login = {
      username,
      password: cell(row, ci.password),
      uris: url ? [url] : [""],
      totp: extractSecret(cell(row, ci.totp)),
    };

    // Nada se perde: email (se não virou usuário) + colunas não mapeadas/não-ruído
    // viram campos personalizados; segredos ficam ocultos.
    const extras: CustomField[] = [];
    if (email && email !== username) extras.push(field("email", email));
    for (let i = 0; i < headers.length; i++) {
      if (consumed.has(i) || IGNORE.has(norm[i])) continue;
      const v = cell(row, i);
      if (!v) continue;
      const secret = /pass|senha|secret|otp|totp|2fa|key|cvv|pin|seed/.test(norm[i]);
      extras.push(field(headers[i].trim() || `campo ${i + 1}`, v, secret));
    }
    if (extras.length) it.customFields = extras;
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
