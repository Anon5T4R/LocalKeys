import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { useStore } from "../store";
import { t } from "../lib/i18n";
import { findReused, loginsWithPassword } from "../report";
import type { Item } from "../types";

export function SecurityReport({ onClose }: { onClose: () => void }) {
  const vault = useStore((s) => s.vault);
  const select = useStore((s) => s.select);
  const [weak, setWeak] = useState<Item[] | null>(null);

  const reused = useMemo(() => (vault ? findReused(vault) : []), [vault]);

  useEffect(() => {
    if (!vault) return;
    let alive = true;
    (async () => {
      const logins = loginsWithPassword(vault);
      const cache = new Map<string, number>();
      const weakItems: Item[] = [];
      for (const it of logins) {
        const pw = it.login!.password;
        let score = cache.get(pw);
        if (score === undefined) {
          try {
            score = (await api.strength(pw, [it.name, it.login!.username])).score;
          } catch {
            score = 0;
          }
          cache.set(pw, score);
        }
        if (score < 3) weakItems.push(it);
      }
      if (alive) setWeak(weakItems);
    })();
    return () => {
      alive = false;
    };
  }, [vault]);

  function go(it: Item) {
    select(it.id);
    onClose();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal report" onClick={(e) => e.stopPropagation()}>
        <h2>{t("report.title")}</h2>
        <p className="muted">{t("report.sub")}</p>

        <section className="report-section">
          <h3>{t("report.reused")}{reused.length ? ` (${reused.length})` : ""}</h3>
          {reused.length === 0 ? (
            <p className="ok">{t("report.reusedNone")}</p>
          ) : (
            reused.map((g, i) => (
              <div key={i} className="report-group">
                <span className="report-count">
                  {t("report.sameCount", { n: g.items.length })}
                </span>
                {g.items.map((it) => (
                  <button key={it.id} className="report-item" onClick={() => go(it)}>
                    {it.name || t("vault.noName")}
                  </button>
                ))}
              </div>
            ))
          )}
        </section>

        <section className="report-section">
          <h3>{t("report.weak")}{weak ? ` (${weak.length})` : ""}</h3>
          {weak === null ? (
            <p className="muted">{t("report.analyzing")}</p>
          ) : weak.length === 0 ? (
            <p className="ok">{t("report.weakNone")}</p>
          ) : (
            <div className="report-group">
              {weak.map((it) => (
                <button key={it.id} className="report-item" onClick={() => go(it)}>
                  {it.name || t("vault.noName")}
                </button>
              ))}
            </div>
          )}
        </section>

        <button className="link" onClick={onClose}>
          {t("ie.close")}
        </button>
      </div>
    </div>
  );
}
