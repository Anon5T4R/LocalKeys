import { useState } from "react";
import { api } from "../api";
import { useStore } from "../store";
import { detectFormat, kdbxToItems, parseText } from "../import";
import { exportCsv, exportJson } from "../export";

type Phase = "menu" | "kdbx" | "export" | "busy" | "done";

export function ImportExport({ onClose }: { onClose: () => void }) {
  const vault = useStore((s) => s.vault);
  const importItems = useStore((s) => s.importItems);
  const showToast = useStore((s) => s.showToast);

  const [phase, setPhase] = useState<Phase>("menu");
  const [kdbxPath, setKdbxPath] = useState("");
  const [kdbxPass, setKdbxPass] = useState("");
  const [fmt, setFmt] = useState<"json" | "csv">("json");
  const [msg, setMsg] = useState("");
  const [donePath, setDonePath] = useState("");
  const [doneCount, setDoneCount] = useState(0);

  async function pickAndImport() {
    setMsg("");
    const path = await api.pickImport();
    if (!path) return;
    if (detectFormat(path) === "kdbx") {
      setKdbxPath(path);
      setPhase("kdbx");
      return;
    }
    setPhase("busy");
    try {
      const content = await api.readTextFile(path);
      const { items } = parseText(path, content);
      if (!items.length) {
        setMsg("Nenhum item reconhecido no arquivo.");
        setPhase("menu");
        return;
      }
      const n = await importItems(items);
      setDonePath(path);
      setDoneCount(n);
      setPhase("done");
    } catch (e) {
      setMsg(String(e));
      setPhase("menu");
    }
  }

  async function importKdbx() {
    setMsg("");
    setPhase("busy");
    try {
      const entries = await api.importKdbx(kdbxPath, kdbxPass);
      const items = kdbxToItems(entries);
      if (!items.length) {
        setMsg("Nenhuma entrada encontrada no .kdbx.");
        setPhase("kdbx");
        return;
      }
      await importItems(items);
      onClose();
    } catch (e) {
      setMsg(String(e));
      setPhase("kdbx");
    }
  }

  async function doExport() {
    if (!vault) return;
    setMsg("");
    const path = await api.pickExportPath(fmt);
    if (!path) return;
    setPhase("busy");
    try {
      const content = fmt === "json" ? exportJson(vault) : exportCsv(vault);
      await api.writeTextFile(path, content);
      showToast("Exportado em claro — proteja/apague o arquivo depois");
      onClose();
    } catch (e) {
      setMsg(String(e));
      setPhase("export");
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        {phase === "menu" && (
          <>
            <h2>Importar / Exportar</h2>
            <p className="muted">
              Importe de Bitwarden (JSON), Chrome/Edge, LastPass, 1Password (CSV) ou
              KeePass (.kdbx).
            </p>
            <button className="primary big" onClick={pickAndImport}>
              📥 Importar de um arquivo…
            </button>
            <button className="big" onClick={() => setPhase("export")}>
              📤 Exportar meu cofre…
            </button>
          </>
        )}

        {phase === "kdbx" && (
          <>
            <h2>Abrir KeePass (.kdbx)</h2>
            <p className="muted">Digite a senha mestra do banco KeePass.</p>
            <input
              type="password"
              autoFocus
              placeholder="senha do .kdbx"
              value={kdbxPass}
              onChange={(e) => setKdbxPass(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && importKdbx()}
            />
            <button className="primary big" onClick={importKdbx} disabled={!kdbxPass}>
              Importar
            </button>
          </>
        )}

        {phase === "export" && (
          <>
            <h2>Exportar cofre</h2>
            <p className="warn">
              ⚠️ O arquivo exportado fica <strong>em claro</strong> (sem senha!).
              Qualquer um que o abrir vê todas as suas senhas. Use só para migrar e
              apague depois.
            </p>
            <div className="radio-row">
              <label>
                <input
                  type="radio"
                  checked={fmt === "json"}
                  onChange={() => setFmt("json")}
                />
                JSON (todos os campos)
              </label>
              <label>
                <input
                  type="radio"
                  checked={fmt === "csv"}
                  onChange={() => setFmt("csv")}
                />
                CSV (planilha)
              </label>
            </div>
            <button className="danger big" onClick={doExport}>
              Exportar em claro mesmo assim
            </button>
          </>
        )}

        {phase === "done" && (
          <>
            <h2>✅ Importado</h2>
            <p>
              {doneCount} {doneCount === 1 ? "item importado" : "itens importados"}.
            </p>
            <p className="warn">
              ⚠️ O arquivo <code>{donePath.split(/[\\/]/).pop()}</code> está{" "}
              <strong>em claro</strong>, com todas as senhas que você acabou de
              importar. <strong>Apague-o</strong> depois de conferir que veio tudo.
            </p>
            <button
              className="big"
              onClick={() => api.revealFile(donePath).catch(() => {})}
            >
              📂 Abrir a pasta do arquivo
            </button>
          </>
        )}

        {phase === "busy" && <p>Processando…</p>}

        {msg && <p className="error">{msg}</p>}
        <button className="link" onClick={onClose}>
          Fechar
        </button>
      </div>
    </div>
  );
}
