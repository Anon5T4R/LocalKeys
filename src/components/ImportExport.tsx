import { useState } from "react";
import { api } from "../api";
import { useStore } from "../store";
import { t } from "../lib/i18n";
import { detectFormat, kdbxToItems, parseBitwardenJson, parseText } from "../import";
import { exportCsv, exportJson } from "../export";

type Phase = "menu" | "kdbx" | "bw" | "export" | "busy" | "done";

export function ImportExport({ onClose }: { onClose: () => void }) {
  const vault = useStore((s) => s.vault);
  const importItems = useStore((s) => s.importItems);
  const showToast = useStore((s) => s.showToast);

  const [phase, setPhase] = useState<Phase>("menu");
  const [kdbxPath, setKdbxPath] = useState("");
  const [kdbxPass, setKdbxPass] = useState("");
  const [bwPath, setBwPath] = useState("");
  const [bwPass, setBwPass] = useState("");
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
      // Export cifrado do Bitwarden? Precisa da senha (fluxo separado).
      if (/"(encrypted|passwordProtected)"\s*:\s*true/.test(content)) {
        setBwPath(path);
        setPhase("bw");
        return;
      }
      const { items } = parseText(path, content);
      if (!items.length) {
        setMsg(t("ie.noItems"));
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
        setMsg(t("ie.noKdbx"));
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

  async function importBw() {
    setMsg("");
    setPhase("busy");
    try {
      const json = await api.importBitwardenEncrypted(bwPath, bwPass);
      const items = parseBitwardenJson(json);
      if (!items.length) {
        setMsg(t("ie.noBw"));
        setPhase("bw");
        return;
      }
      await importItems(items);
      onClose();
    } catch (e) {
      setMsg(String(e));
      setPhase("bw");
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
      showToast(t("ie.exportedToast"));
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
            <h2>{t("ie.title")}</h2>
            <p className="muted">{t("ie.sub")}</p>
            <button className="primary big" onClick={pickAndImport}>
              {t("ie.importFile")}
            </button>
            <button className="big" onClick={() => setPhase("export")}>
              {t("ie.exportVault")}
            </button>
          </>
        )}

        {phase === "kdbx" && (
          <>
            <h2>{t("ie.kdbxTitle")}</h2>
            <p className="muted">{t("ie.kdbxSub")}</p>
            <input
              type="password"
              autoFocus
              placeholder={t("ie.kdbxPlaceholder")}
              value={kdbxPass}
              onChange={(e) => setKdbxPass(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && importKdbx()}
            />
            <button className="primary big" onClick={importKdbx} disabled={!kdbxPass}>
              {t("ie.import")}
            </button>
          </>
        )}

        {phase === "bw" && (
          <>
            <h2>{t("ie.bwTitle")}</h2>
            <p className="warn">
              {t("ie.bwWarnPre")} <strong>{t("ie.bwWarnStrong")}</strong>
              {t("ie.bwWarnMid")} <strong>{t("ie.bwWarnNot")}</strong>
              {t("ie.bwWarnPost")}
            </p>
            <input
              type="password"
              autoFocus
              placeholder={t("ie.bwPlaceholder")}
              value={bwPass}
              onChange={(e) => setBwPass(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && importBw()}
            />
            <button className="primary big" onClick={importBw} disabled={!bwPass}>
              {t("ie.import")}
            </button>
          </>
        )}

        {phase === "export" && (
          <>
            <h2>{t("ie.exportTitle")}</h2>
            <p className="warn">
              {t("ie.exportWarnPre")} <strong>{t("ie.exportWarnStrong")}</strong>
              {t("ie.exportWarnPost")}
            </p>
            <div className="radio-row">
              <label>
                <input
                  type="radio"
                  checked={fmt === "json"}
                  onChange={() => setFmt("json")}
                />
                {t("ie.fmtJson")}
              </label>
              <label>
                <input
                  type="radio"
                  checked={fmt === "csv"}
                  onChange={() => setFmt("csv")}
                />
                {t("ie.fmtCsv")}
              </label>
            </div>
            <button className="danger big" onClick={doExport}>
              {t("ie.exportAnyway")}
            </button>
          </>
        )}

        {phase === "done" && (
          <>
            <h2>{t("ie.done")}</h2>
            <p>
              {t(doneCount === 1 ? "toast.importedOne" : "toast.importedMany", {
                n: doneCount,
              })}
              .
            </p>
            <p className="warn">
              {t("ie.doneWarnPre")} <code>{donePath.split(/[\\/]/).pop()}</code>{" "}
              {t("ie.doneWarnMid")} <strong>{t("ie.doneWarnClear")}</strong>
              {t("ie.doneWarnPost")} <strong>{t("ie.doneWarnDelete")}</strong>{" "}
              {t("ie.doneWarnEnd")}
            </p>
            <button
              className="big"
              onClick={() => api.revealFile(donePath).catch(() => {})}
            >
              {t("ie.openFolder")}
            </button>
          </>
        )}

        {phase === "busy" && <p>{t("ie.processing")}</p>}

        {msg && <p className="error">{msg}</p>}
        <button className="link" onClick={onClose}>
          {t("ie.close")}
        </button>
      </div>
    </div>
  );
}
