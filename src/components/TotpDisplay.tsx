import { useEffect, useState } from "react";
import { api } from "../api";
import { useStore } from "../store";

/** Mostra o código TOTP atual de uma chave base32, com contagem regressiva. */
export function TotpDisplay({ secret }: { secret: string }) {
  const [code, setCode] = useState("");
  const [remaining, setRemaining] = useState(30);
  const [period, setPeriod] = useState(30);
  const [error, setError] = useState(false);
  const copySecret = useStore((s) => s.copySecret);

  useEffect(() => {
    const s = secret.trim();
    if (!s) return;
    let alive = true;
    const refresh = async () => {
      try {
        const r = await api.totpNow(s);
        if (!alive) return;
        setCode(r.code);
        setRemaining(r.secondsRemaining);
        setPeriod(r.period);
        setError(false);
      } catch {
        if (alive) setError(true);
      }
    };
    refresh();
    const t = window.setInterval(() => {
      setRemaining((v) => {
        if (v <= 1) {
          refresh();
          return period;
        }
        return v - 1;
      });
    }, 1000);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, [secret, period]);

  if (!secret.trim()) return null;
  if (error) return <div className="totp err">chave TOTP inválida (base32)</div>;

  const pct = Math.max(0, Math.min(100, (remaining / period) * 100));
  const low = remaining <= 5;

  return (
    <div className="totp">
      <span className="totp-label">Código TOTP</span>
      <code
        className="totp-code"
        title="Copiar código"
        onClick={() => copySecret(code, "Código")}
      >
        {code.slice(0, 3)} {code.slice(3)}
      </code>
      <div className={`totp-ring ${low ? "low" : ""}`} title={`${remaining}s`}>
        <svg viewBox="0 0 36 36">
          <circle className="ring-bg" cx="18" cy="18" r="16" />
          <circle
            className="ring-fg"
            cx="18"
            cy="18"
            r="16"
            strokeDasharray={`${pct} 100`}
          />
        </svg>
        <span>{remaining}</span>
      </div>
    </div>
  );
}
