import { LOCALE_LABELS, setLocale, t, useLocale, type Locale } from "../lib/i18n";

/** Seletor de idioma (EN/PT/ES) — reusado no unlock e na sidebar do cofre. */
export function LocalePicker({ className = "" }: { className?: string }) {
  const locale = useLocale();
  return (
    <label className={`lang-picker ${className}`.trim()} title={t("lang.title")}>
      <span aria-hidden>🌐</span>
      <select
        value={locale}
        onChange={(e) => setLocale(e.target.value as Locale)}
        aria-label={t("lang.title")}
      >
        {(Object.keys(LOCALE_LABELS) as Locale[]).map((l) => (
          <option key={l} value={l}>
            {LOCALE_LABELS[l]}
          </option>
        ))}
      </select>
    </label>
  );
}
