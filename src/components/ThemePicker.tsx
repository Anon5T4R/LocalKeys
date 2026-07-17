import { t } from "../lib/i18n";
import { setTheme, THEMES, useTheme, type Theme } from "../lib/theme";

/** Rótulo i18n de cada tema (as chaves existem nos 3 dicionários). */
const LABEL_KEY: Record<Theme, "theme.auto" | "theme.light" | "theme.dark" | "theme.nature" | "theme.darkblue" | "theme.calmgreen" | "theme.pastelpink" | "theme.punkprincess"> = {
  auto: "theme.auto",
  light: "theme.light",
  dark: "theme.dark",
  nature: "theme.nature",
  darkblue: "theme.darkblue",
  calmgreen: "theme.calmgreen",
  pastelpink: "theme.pastelpink",
  punkprincess: "theme.punkprincess",
};

/** Seletor de tema — espelha o LocalePicker (mesma classe/estilo). */
export function ThemePicker({ className = "" }: { className?: string }) {
  const theme = useTheme();
  return (
    <label className={`lang-picker ${className}`.trim()} title={t("theme.title")}>
      <span aria-hidden>🎨</span>
      <select
        value={theme}
        onChange={(e) => setTheme(e.target.value as Theme)}
        aria-label={t("theme.title")}
      >
        {THEMES.map((th) => (
          <option key={th} value={th}>
            {t(LABEL_KEY[th])}
          </option>
        ))}
      </select>
    </label>
  );
}
