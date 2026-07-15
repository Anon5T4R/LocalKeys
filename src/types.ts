// Schema do vault (dentro do blob cifrado). O back-end trata isto como bytes
// opacos; a estrutura vive aqui no front. `version` permite migrar depois.

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
}

export const KIND_LABEL: Record<ItemKind, string> = {
  login: "Login",
  note: "Nota segura",
  card: "Cartão",
  identity: "Identidade",
};

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
