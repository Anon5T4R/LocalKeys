import { useEffect, useState } from "react";
import { api } from "../api";
import { getLastVault } from "../prefs";
import { useStore } from "../store";
import { LocalePicker } from "./LocalePicker";
import { ThemePicker } from "./ThemePicker";
import { t } from "../lib/i18n";
import { StrengthMeter } from "./StrengthMeter";

export function UnlockScreen({ startupFile }: { startupFile: string | null }) {
  const [tab, setTab] = useState<"open" | "create">(startupFile ? "open" : "open");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const openVault = useStore((s) => s.openVault);
  const createVault = useStore((s) => s.createVault);
  const quickUnlock = useStore((s) => s.quickUnlock);
  const busy = useStore((s) => s.busy);
  const error = useStore((s) => s.error);
  const clearError = useStore((s) => s.clearError);
  const [quickAvailable, setQuickAvailable] = useState(false);

  useEffect(() => {
    const p = getLastVault();
    if (!p) return;
    api
      .hasQuickUnlock(p)
      .then(setQuickAvailable)
      .catch(() => {});
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    clearError();
    if (tab === "create") {
      if (password !== confirm) {
        useStore.setState({ error: t("unlock.mismatch") });
        return;
      }
      await createVault(password);
    } else {
      await openVault(password, startupFile ?? undefined);
    }
    setPassword("");
    setConfirm("");
  }

  return (
    <div className="unlock">
      <div className="unlock-card">
        <div className="brand">
          <div className="brand-mark">🔐</div>
          <h1>LocalKeys</h1>
          <p className="tagline">{t("unlock.tagline")}</p>
        </div>

        <div className="tabs">
          <button
            className={tab === "open" ? "active" : ""}
            onClick={() => setTab("open")}
          >
            {t("unlock.tabOpen")}
          </button>
          <button
            className={tab === "create" ? "active" : ""}
            onClick={() => setTab("create")}
          >
            {t("unlock.tabCreate")}
          </button>
        </div>

        {startupFile && tab === "open" && (
          <p className="hint">
            {t("unlock.opening")} <code>{startupFile}</code>
          </p>
        )}

        <form onSubmit={submit}>
          <label>
            {t("unlock.master")}
            <input
              type="password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t("unlock.masterPlaceholder")}
            />
          </label>

          {tab === "create" && (
            <>
              <StrengthMeter password={password} />
              <label>
                {t("unlock.confirm")}
                <input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder={t("unlock.confirmPlaceholder")}
                />
              </label>
              <p className="warn">{t("unlock.warn")}</p>
            </>
          )}

          {error && <p className="error">{error}</p>}

          <button type="submit" className="primary big" disabled={busy || !password}>
            {busy
              ? t("unlock.processing")
              : tab === "create"
                ? t("unlock.createBtn")
                : t("unlock.openBtn")}
          </button>
        </form>

        {quickAvailable && tab === "open" && (
          <button
            className="big quick-btn"
            disabled={busy}
            onClick={() => quickUnlock()}
          >
            {t("unlock.quick")}
          </button>
        )}

        <LocalePicker className="unlock-lang" />
        <ThemePicker className="unlock-lang" />
      </div>
    </div>
  );
}
