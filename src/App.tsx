import { useEffect, useState } from "react";
import { api } from "./api";
import { DEFAULT_AUTOLOCK_MS, useStore } from "./store";
import { UnlockScreen } from "./components/UnlockScreen";
import { VaultScreen } from "./components/VaultScreen";

export default function App() {
  const locked = useStore((s) => s.locked);
  const toast = useStore((s) => s.toast);
  const [startupFile, setStartupFile] = useState<string | null>(null);

  // Arquivo passado no "Abrir com" (uma vez, no boot).
  useEffect(() => {
    api.startupFile().then(setStartupFile).catch(() => {});
  }, []);

  // Auto-lock: inatividade (default 5 min) e ao ocultar/minimizar a janela.
  useEffect(() => {
    const bump = () => useStore.getState().markActivity();
    const events = ["mousemove", "keydown", "mousedown", "wheel", "touchstart"];
    events.forEach((e) => window.addEventListener(e, bump, { passive: true }));

    const onHidden = () => {
      if (document.visibilityState === "hidden") {
        const st = useStore.getState();
        if (!st.locked) st.lock();
      }
    };
    document.addEventListener("visibilitychange", onHidden);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        const st = useStore.getState();
        if (!st.locked) st.lock();
      }
    };
    window.addEventListener("keydown", onKey);

    const timer = window.setInterval(() => {
      const st = useStore.getState();
      if (!st.locked && Date.now() - st.lastActivity > DEFAULT_AUTOLOCK_MS) {
        st.lock();
      }
    }, 15_000);

    return () => {
      events.forEach((e) => window.removeEventListener(e, bump));
      document.removeEventListener("visibilitychange", onHidden);
      window.removeEventListener("keydown", onKey);
      window.clearInterval(timer);
    };
  }, []);

  return (
    <>
      {locked ? <UnlockScreen startupFile={startupFile} /> : <VaultScreen />}
      {toast && (
        <div className="toast" key={toast.id}>
          {toast.text}
        </div>
      )}
    </>
  );
}
