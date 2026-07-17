import { useSyncExternalStore } from "react";

/**
 * Tema da UI — só aparência. Mesmo padrão de store externo do i18n.ts (não
 * React), pra poder aplicar o tema antes da árvore montar.
 *
 * O tema vive num atributo `data-theme` no <html>; o CSS (App.css) faz o resto.
 * "auto" REMOVE o atributo — aí o bloco `@media (prefers-color-scheme: dark)`
 * com `:root:not([data-theme])` volta a valer e seguimos o sistema.
 *
 * Nada aqui toca cofre/cripto: é preferência de UI em localStorage, como o locale.
 */

export type Theme =
  | "auto"
  | "light"
  | "dark"
  | "nature"
  | "darkblue"
  | "calmgreen"
  | "pastelpink"
  | "punkprincess";

export const THEMES: readonly Theme[] = [
  "auto",
  "light",
  "dark",
  "nature",
  "darkblue",
  "calmgreen",
  "pastelpink",
  "punkprincess",
] as const;

const THEME_KEY = "localkeys.theme";

function isTheme(v: unknown): v is Theme {
  return typeof v === "string" && (THEMES as readonly string[]).includes(v);
}

function loadTheme(): Theme {
  try {
    const v = typeof localStorage !== "undefined" ? localStorage.getItem(THEME_KEY) : null;
    return isTheme(v) ? v : "auto";
  } catch {
    return "auto";
  }
}

/** Escreve (ou tira, no "auto") o `data-theme` no <html>. */
export function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (theme === "auto") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
}

let current: Theme = loadTheme();
const listeners = new Set<() => void>();

export function getTheme(): Theme {
  return current;
}

export function setTheme(theme: Theme) {
  if (theme === current) return;
  current = theme;
  applyTheme(theme);
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* localStorage indisponível — o tema ainda vale nesta sessão */
  }
  for (const l of listeners) l();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Inscreve o componente nas trocas de tema. */
export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, getTheme);
}

/** Aplica o tema salvo no boot (chamado pelo main.tsx). */
export function initTheme() {
  applyTheme(current);
}
