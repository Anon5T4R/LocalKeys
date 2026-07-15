import { create } from "zustand";
import { api } from "./api";
import type { Item, Vault } from "./types";

const CLIPBOARD_CLEAR_MS = 30_000;
export const DEFAULT_AUTOLOCK_MS = 5 * 60_000;

interface Toast {
  text: string;
  id: number;
}

interface AppState {
  path: string | null;
  vault: Vault | null;
  locked: boolean;
  selectedId: string | null;
  search: string;
  showTrash: boolean;
  busy: boolean;
  error: string | null;
  toast: Toast | null;
  lastActivity: number;

  createVault: (password: string) => Promise<void>;
  openVault: (password: string, path?: string) => Promise<void>;
  lock: () => Promise<void>;
  select: (id: string | null) => void;
  setSearch: (s: string) => void;
  setShowTrash: (v: boolean) => void;
  addItem: (item: Item) => Promise<void>;
  importItems: (items: Item[]) => Promise<number>;
  updateItem: (item: Item) => Promise<void>;
  trashItem: (id: string) => Promise<void>;
  restoreItem: (id: string) => Promise<void>;
  deleteForever: (id: string) => Promise<void>;
  copySecret: (text: string, label?: string) => Promise<void>;
  markActivity: () => void;
  showToast: (text: string) => void;
  clearError: () => void;
}

async function persist(path: string | null, vault: Vault | null) {
  if (!path || !vault) return;
  await api.saveVault(path, JSON.stringify(vault));
}

export const useStore = create<AppState>((set, get) => ({
  path: null,
  vault: null,
  locked: true,
  selectedId: null,
  search: "",
  showTrash: false,
  busy: false,
  error: null,
  toast: null,
  lastActivity: Date.now(),

  createVault: async (password) => {
    set({ busy: true, error: null });
    try {
      const path = await api.pickSave();
      if (!path) return;
      const { vault } = await api.createVault(path, password);
      set({ path, vault: JSON.parse(vault), locked: false, lastActivity: Date.now() });
    } catch (e) {
      set({ error: String(e) });
    } finally {
      set({ busy: false });
    }
  },

  openVault: async (password, presetPath) => {
    set({ busy: true, error: null });
    try {
      const path = presetPath ?? (await api.pickOpen());
      if (!path) return;
      const { vault } = await api.openVault(path, password);
      set({ path, vault: JSON.parse(vault), locked: false, lastActivity: Date.now() });
    } catch (e) {
      set({ error: String(e) });
    } finally {
      set({ busy: false });
    }
  },

  lock: async () => {
    try {
      await api.lock();
    } finally {
      // Zera tudo que é sensível do lado do front também.
      set({ vault: null, locked: true, selectedId: null, search: "", showTrash: false });
    }
  },

  select: (id) => set({ selectedId: id }),
  setSearch: (search) => set({ search }),
  setShowTrash: (showTrash) => set({ showTrash, selectedId: null }),

  addItem: async (item) => {
    const { vault, path } = get();
    if (!vault) return;
    const next = { ...vault, items: [...vault.items, item] };
    set({ vault: next, selectedId: item.id });
    await persist(path, next);
  },

  importItems: async (incoming) => {
    const { vault, path } = get();
    if (!vault || incoming.length === 0) return 0;
    const next = { ...vault, items: [...vault.items, ...incoming] };
    set({ vault: next });
    await persist(path, next);
    get().showToast(`${incoming.length} ${incoming.length === 1 ? "item importado" : "itens importados"}`);
    return incoming.length;
  },

  updateItem: async (item) => {
    const { vault, path } = get();
    if (!vault) return;
    const updated = { ...item, updatedAt: Date.now() };
    const next = {
      ...vault,
      items: vault.items.map((i) => (i.id === item.id ? updated : i)),
    };
    set({ vault: next });
    await persist(path, next);
  },

  trashItem: async (id) => {
    const { vault, path } = get();
    if (!vault) return;
    const next = {
      ...vault,
      items: vault.items.map((i) =>
        i.id === id ? { ...i, deletedAt: Date.now() } : i,
      ),
    };
    set({ vault: next, selectedId: null });
    await persist(path, next);
  },

  restoreItem: async (id) => {
    const { vault, path } = get();
    if (!vault) return;
    const next = {
      ...vault,
      items: vault.items.map((i) => (i.id === id ? { ...i, deletedAt: null } : i)),
    };
    set({ vault: next });
    await persist(path, next);
  },

  deleteForever: async (id) => {
    const { vault, path } = get();
    if (!vault) return;
    const next = { ...vault, items: vault.items.filter((i) => i.id !== id) };
    set({ vault: next, selectedId: null });
    await persist(path, next);
  },

  copySecret: async (text, label) => {
    await navigator.clipboard.writeText(text);
    get().showToast(`${label ?? "Copiado"} — limpa em 30 s`);
    // Limpa só se o clipboard ainda contém o que copiamos (não pisa em algo novo).
    window.setTimeout(async () => {
      try {
        const cur = await navigator.clipboard.readText();
        if (cur === text) await navigator.clipboard.writeText("");
      } catch {
        // readText pode ser negado; tenta limpar mesmo assim.
        try {
          await navigator.clipboard.writeText("");
        } catch {
          /* nada a fazer */
        }
      }
    }, CLIPBOARD_CLEAR_MS);
  },

  markActivity: () => set({ lastActivity: Date.now() }),
  showToast: (text) => set({ toast: { text, id: Date.now() } }),
  clearError: () => set({ error: null }),
}));
