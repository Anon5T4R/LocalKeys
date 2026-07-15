import { useEffect, useState } from "react";
import { api } from "../api";
import { getLastVault } from "../prefs";
import { useStore } from "../store";
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
        useStore.setState({ error: "as senhas não coincidem" });
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
          <p className="tagline">Seu cofre de senhas — 100% local, sem nuvem.</p>
        </div>

        <div className="tabs">
          <button
            className={tab === "open" ? "active" : ""}
            onClick={() => setTab("open")}
          >
            Abrir cofre
          </button>
          <button
            className={tab === "create" ? "active" : ""}
            onClick={() => setTab("create")}
          >
            Criar cofre
          </button>
        </div>

        {startupFile && tab === "open" && (
          <p className="hint">
            Abrindo: <code>{startupFile}</code>
          </p>
        )}

        <form onSubmit={submit}>
          <label>
            Master password
            <input
              type="password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="sua senha mestra"
            />
          </label>

          {tab === "create" && (
            <>
              <StrengthMeter password={password} />
              <label>
                Confirmar
                <input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="repita a senha mestra"
                />
              </label>
              <p className="warn">
                ⚠️ Não há recuperação. Se você esquecer esta senha, o cofre é
                irrecuperável — é o que mantém ele seguro.
              </p>
            </>
          )}

          {error && <p className="error">{error}</p>}

          <button type="submit" className="primary big" disabled={busy || !password}>
            {busy
              ? "Processando…"
              : tab === "create"
                ? "Criar e destrancar"
                : "Destrancar"}
          </button>
        </form>

        {quickAvailable && tab === "open" && (
          <button
            className="big quick-btn"
            disabled={busy}
            onClick={() => quickUnlock()}
          >
            🔓 Desbloqueio rápido (sem senha)
          </button>
        )}
      </div>
    </div>
  );
}
