// Schema do vault (dentro do blob cifrado). O back-end trata isto como bytes
// opacos; a estrutura vive aqui no front. `version` permite migrar depois.

import { t, type MessageKey } from "./lib/i18n";

export type ItemKind = "login" | "note" | "card" | "identity";

export interface Vault {
  version: number;
  folders: Folder[];
  items: Item[];
}

export interface Folder {
  id: string;
  name: string;
}

export interface Login {
  username: string;
  password: string;
  uris: string[];
  totp: string;
}

export interface Card {
  cardholder: string;
  brand: string;
  number: string;
  exp: string; // MM/AA
  code: string;
}

export interface Identity {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
}

export interface PasswordHistoryEntry {
  password: string;
  at: number;
}

export interface CustomField {
  id: string;
  name: string;
  value: string;
  hidden: boolean; // true => mostrar como senha (oculto)
}

export interface Attachment {
  id: string;
  name: string;
  size: number; // bytes do conteúdo original
  mime: string;
  dataB64: string; // conteúdo em base64, dentro do blob cifrado
}

export interface Item {
  id: string;
  kind: ItemKind;
  name: string;
  favorite: boolean;
  folderId: string | null;
  notes: string;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null; // != null => na lixeira
  login?: Login;
  card?: Card;
  identity?: Identity;
  passwordHistory?: PasswordHistoryEntry[];
  customFields?: CustomField[];
  attachments?: Attachment[];
}

/** Limite por anexo — o blob inteiro é recifrado a cada save, então nada de arquivos grandes. */
export const MAX_ATTACHMENT_BYTES = 1024 * 1024; // 1 MiB

export const KIND_LABEL: Record<ItemKind, string> = {
  login: "Login",
  note: "Nota segura",
  card: "Cartão",
  identity: "Identidade",
};

// Rótulo localizado do tipo de item (usado na UI). O KIND_LABEL acima fica como
// mapa fixo pt (fallback / referência de teste).
const KIND_LABEL_KEY: Record<ItemKind, MessageKey> = {
  login: "kind.login",
  note: "kind.note",
  card: "kind.card",
  identity: "kind.identity",
};

export function kindLabel(kind: ItemKind): string {
  return t(KIND_LABEL_KEY[kind]);
}

export function emptyItem(kind: ItemKind): Item {
  const now = Date.now();
  const base: Item = {
    id: crypto.randomUUID(),
    kind,
    name: "",
    favorite: false,
    folderId: null,
    notes: "",
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
  if (kind === "login")
    base.login = { username: "", password: "", uris: [""], totp: "" };
  if (kind === "card")
    base.card = { cardholder: "", brand: "", number: "", exp: "", code: "" };
  if (kind === "identity")
    base.identity = {
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      address: "",
    };
  return base;
}
