import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { useStore } from "../store";
import {
  emptyItem,
  kindLabel,
  MAX_ATTACHMENT_BYTES,
  type Attachment,
  type Item,
  type ItemKind,
} from "../types";
import { getLocale, t } from "../lib/i18n";
import { Generator } from "./Generator";
import { LocalePicker } from "./LocalePicker";
import { StrengthMeter } from "./StrengthMeter";
import { TotpDisplay } from "./TotpDisplay";
import { ImportExport } from "./ImportExport";
import { SecurityReport } from "./SecurityReport";

type Filter = "all" | "fav" | ItemKind | "trash";

const KIND_ICON: Record<ItemKind, string> = {
  login: "🔑",
  note: "📝",
  card: "💳",
  identity: "🪪",
};

export function VaultScreen() {
  const vault = useStore((s) => s.vault);
  const path = useStore((s) => s.path);
  const selectedId = useStore((s) => s.selectedId);
  const search = useStore((s) => s.search);
  const setSearch = useStore((s) => s.setSearch);
  const select = useStore((s) => s.select);
  const addItem = useStore((s) => s.addItem);
  const addFolder = useStore((s) => s.addFolder);
  const removeFolder = useStore((s) => s.removeFolder);
  const enableQuickUnlock = useStore((s) => s.enableQuickUnlock);
  const disableQuickUnlock = useStore((s) => s.disableQuickUnlock);
  const lock = useStore((s) => s.lock);

  const [quickOn, setQuickOn] = useState(false);
  useEffect(() => {
    if (path) api.hasQuickUnlock(path).then(setQuickOn).catch(() => {});
  }, [path]);

  const [filter, setFilter] = useState<Filter>("all");
  const [folderFilter, setFolderFilter] = useState<string | null>(null);
  const [newFolder, setNewFolder] = useState<string | null>(null); // null = input escondido
  const [showTools, setShowTools] = useState(false);
  const [showReport, setShowReport] = useState(false);

  const items = vault?.items ?? [];
  const folders = vault?.folders ?? [];
  const selected = items.find((i) => i.id === selectedId) ?? null;

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items
      .filter((i) => (filter === "trash" ? i.deletedAt : !i.deletedAt))
      .filter((i) => (folderFilter ? i.folderId === folderFilter : true))
      .filter((i) => {
        if (filter === "fav") return i.favorite;
        if (filter === "all" || filter === "trash") return true;
        return i.kind === filter;
      })
      .filter((i) => {
        if (!q) return true;
        const hay = [i.name, i.login?.username, ...(i.login?.uris ?? [])]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      })
      .sort(
        (a, b) =>
          Number(b.favorite) - Number(a.favorite) ||
          a.name.localeCompare(b.name),
      );
  }, [items, filter, search]);

  async function create(kind: ItemKind) {
    await addItem(emptyItem(kind));
    setFilter("all");
  }

  const fileName = path?.split(/[\\/]/).pop() ?? "cofre";

  return (
    <div className="vault">
      <aside className="sidebar">
        <div className="sidebar-head">
          <strong title={path ?? ""}>{fileName}</strong>
          <button className="lock-btn" onClick={() => lock()} title={t("vault.lockTitle")}>
            {t("vault.lock")}
          </button>
        </div>

        <input
          className="search"
          placeholder={t("vault.search")}
          value={search}
          autoFocus
          onChange={(e) => setSearch(e.target.value)}
        />

        <nav className="filters">
          {(
            [
              ["all", t("vault.filterAll")],
              ["fav", t("vault.filterFav")],
              ["login", t("vault.filterLogin")],
              ["note", t("vault.filterNote")],
              ["card", t("vault.filterCard")],
              ["identity", t("vault.filterIdentity")],
              ["trash", t("vault.filterTrash")],
            ] as [Filter, string][]
          ).map(([f, label]) => (
            <button
              key={f}
              className={filter === f && !folderFilter ? "active" : ""}
              onClick={() => {
                setFilter(f);
                setFolderFilter(null);
                select(null);
              }}
            >
              {label}
            </button>
          ))}
        </nav>

        <div className="folders">
          <div className="folders-head">
            <span>{t("vault.folders")}</span>
            <button onClick={() => setNewFolder(newFolder === null ? "" : null)}>
              {t("vault.addFolder")}
            </button>
          </div>
          {newFolder !== null && (
            <input
              className="folder-input"
              autoFocus
              placeholder={t("vault.folderPlaceholder")}
              value={newFolder}
              onChange={(e) => setNewFolder(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newFolder.trim()) {
                  addFolder(newFolder);
                  setNewFolder(null);
                } else if (e.key === "Escape") {
                  setNewFolder(null);
                }
              }}
            />
          )}
          {folders.map((f) => {
            const count = items.filter((i) => !i.deletedAt && i.folderId === f.id).length;
            return (
              <div
                key={f.id}
                className={`folder-row ${folderFilter === f.id ? "active" : ""}`}
              >
                <button
                  className="folder-name"
                  onClick={() => {
                    setFolderFilter(f.id);
                    setFilter("all");
                    select(null);
                  }}
                >
                  📁 {f.name} <span className="muted">{count}</span>
                </button>
                <button
                  className="folder-del"
                  title={t("vault.delFolderTitle")}
                  onClick={() => {
                    removeFolder(f.id);
                    if (folderFilter === f.id) setFolderFilter(null);
                  }}
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>

        <div className="new-item">
          <span>{t("vault.new")}</span>
          {(["login", "note", "card", "identity"] as ItemKind[]).map((k) => (
            <button key={k} title={kindLabel(k)} onClick={() => create(k)}>
              {KIND_ICON[k]}
            </button>
          ))}
        </div>

        <ul className="item-list">
          {visible.map((i) => (
            <li
              key={i.id}
              className={i.id === selectedId ? "active" : ""}
              onClick={() => select(i.id)}
            >
              <span className="ic">{KIND_ICON[i.kind]}</span>
              <span className="nm">{i.name || t("vault.noName")}</span>
              {i.favorite && <span className="fav">★</span>}
            </li>
          ))}
          {visible.length === 0 && <li className="empty">{t("vault.empty")}</li>}
        </ul>

        <div className="sidebar-foot">
          <button className="tools-btn" onClick={() => setShowReport(true)}>
            {t("vault.report")}
          </button>
          <button className="tools-btn" onClick={() => setShowTools(true)}>
            {t("vault.importExport")}
          </button>
          <button
            className="tools-btn"
            title={t("vault.quickTitle")}
            onClick={async () => {
              if (quickOn) {
                await disableQuickUnlock();
                setQuickOn(false);
              } else {
                await enableQuickUnlock();
                setQuickOn(true);
              }
            }}
          >
            {quickOn ? t("vault.quickOn") : t("vault.quickOff")}
          </button>
          <LocalePicker className="sidebar-lang" />
        </div>
      </aside>

      <main className="detail">
        {selected ? (
          <ItemEditor key={selected.id} item={selected} />
        ) : (
          <div className="placeholder">
            <p>{t("vault.placeholder")}</p>
          </div>
        )}
      </main>

      {showTools && <ImportExport onClose={() => setShowTools(false)} />}
      {showReport && <SecurityReport onClose={() => setShowReport(false)} />}
    </div>
  );
}

function ItemEditor({ item }: { item: Item }) {
  const updateItem = useStore((s) => s.updateItem);
  const trashItem = useStore((s) => s.trashItem);
  const restoreItem = useStore((s) => s.restoreItem);
  const deleteForever = useStore((s) => s.deleteForever);
  const copySecret = useStore((s) => s.copySecret);
  const autoType = useStore((s) => s.autoType);
  const showToast = useStore((s) => s.showToast);
  const folders = useStore((s) => s.vault?.folders ?? []);

  const [draft, setDraft] = useState<Item>(item);
  const [showPw, setShowPw] = useState(false);
  const [showGen, setShowGen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => setDraft(item), [item]);

  function commit(next: Item) {
    setDraft(next);
    updateItem(next);
  }
  const patch = (p: Partial<Item>) => commit({ ...draft, ...p });
  const patchLogin = (p: Partial<NonNullable<Item["login"]>>) =>
    commit({ ...draft, login: { ...draft.login!, ...p } });

  // --- campos personalizados ---
  const fields = draft.customFields ?? [];
  const addField = () =>
    commit({
      ...draft,
      customFields: [...fields, { id: crypto.randomUUID(), name: "", value: "", hidden: false }],
    });
  const setField = (id: string, p: Partial<(typeof fields)[number]>) =>
    setDraft({
      ...draft,
      customFields: fields.map((f) => (f.id === id ? { ...f, ...p } : f)),
    });
  const commitFields = () => updateItem(draft);
  const toggleFieldHidden = (id: string) =>
    commit({
      ...draft,
      customFields: fields.map((f) => (f.id === id ? { ...f, hidden: !f.hidden } : f)),
    });
  const removeField = (id: string) =>
    commit({ ...draft, customFields: fields.filter((f) => f.id !== id) });

  // --- anexos (guardados base64 no blob) ---
  const attachments = draft.attachments ?? [];
  async function addAttachment() {
    const path = await api.pickFileOpen();
    if (!path) return;
    try {
      const data = await api.readFileB64(path);
      if (data.size > MAX_ATTACHMENT_BYTES) {
        showToast("Anexo grande demais (máx. 1 MB)");
        return;
      }
      const att: Attachment = {
        id: crypto.randomUUID(),
        name: data.name,
        size: data.size,
        mime: "",
        dataB64: data.dataB64,
      };
      commit({ ...draft, attachments: [...attachments, att] });
    } catch (e) {
      showToast(String(e));
    }
  }
  async function saveAttachment(att: Attachment) {
    const path = await api.pickFileSave(att.name);
    if (!path) return;
    try {
      await api.writeFileB64(path, att.dataB64);
      showToast("Anexo salvo");
    } catch (e) {
      showToast(String(e));
    }
  }
  const removeAttachment = (id: string) =>
    commit({ ...draft, attachments: attachments.filter((a) => a.id !== id) });

  const history = draft.passwordHistory ?? [];
  const inTrash = draft.deletedAt != null;

  return (
    <div className="editor">
      <div className="editor-head">
        <span className="big-ic">{KIND_ICON[draft.kind]}</span>
        <input
          className="title"
          placeholder={t("editor.namePlaceholder", {
            kind: kindLabel(draft.kind).toLowerCase(),
          })}
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          onBlur={() => updateItem(draft)}
        />
        <button
          className={`star ${draft.favorite ? "on" : ""}`}
          title={t("editor.favorite")}
          onClick={() => patch({ favorite: !draft.favorite })}
        >
          ★
        </button>
      </div>

      <div className="folder-select">
        <select
          value={draft.folderId ?? ""}
          onChange={(e) => patch({ folderId: e.target.value || null })}
        >
          <option value="">{t("editor.noFolder")}</option>
          {folders.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      </div>

      {draft.kind === "login" && draft.login && (
        <>
          <Field label={t("editor.username")}>
            <input
              value={draft.login.username}
              onChange={(e) => setDraft({ ...draft, login: { ...draft.login!, username: e.target.value } })}
              onBlur={() => updateItem(draft)}
            />
            <button onClick={() => copySecret(draft.login!.username, t("editor.username"))}>{t("editor.copy")}</button>
            <button title={t("editor.typeTitle")} onClick={() => autoType(draft.login!.username)}>
              ⌨
            </button>
          </Field>

          <Field label={t("editor.password")}>
            <input
              type={showPw ? "text" : "password"}
              value={draft.login.password}
              onChange={(e) => setDraft({ ...draft, login: { ...draft.login!, password: e.target.value } })}
              onBlur={() => updateItem(draft)}
            />
            <button onClick={() => setShowPw((v) => !v)}>{showPw ? t("editor.hide") : t("editor.show")}</button>
            <button onClick={() => copySecret(draft.login!.password, t("editor.password"))}>{t("editor.copy")}</button>
            <button title={t("editor.typeTitle")} onClick={() => autoType(draft.login!.password)}>
              ⌨
            </button>
            <button onClick={() => setShowGen((v) => !v)}>{t("editor.generate")}</button>
          </Field>
          <div className="under-field">
            <StrengthMeter
              password={draft.login.password}
              userInputs={[draft.name, draft.login.username]}
            />
          </div>
          {showGen && (
            <Generator
              onUse={(v) => {
                patchLogin({ password: v });
                setShowGen(false);
                setShowPw(true);
              }}
            />
          )}

          <Field label={t("editor.url")}>
            <input
              value={draft.login.uris[0] ?? ""}
              onChange={(e) =>
                setDraft({ ...draft, login: { ...draft.login!, uris: [e.target.value] } })
              }
              onBlur={() => updateItem(draft)}
            />
          </Field>

          <Field label={t("editor.totpKey")}>
            <input
              placeholder={t("editor.totpPlaceholder")}
              value={draft.login.totp}
              onChange={(e) => setDraft({ ...draft, login: { ...draft.login!, totp: e.target.value } })}
              onBlur={() => updateItem(draft)}
            />
          </Field>
          {draft.login.totp.trim() && <TotpDisplay secret={draft.login.totp} />}
        </>
      )}

      {draft.kind === "card" && draft.card && (
        <>
          <Field label={t("editor.cardholder")}>
            <input value={draft.card.cardholder} onChange={(e) => setDraft({ ...draft, card: { ...draft.card!, cardholder: e.target.value } })} onBlur={() => updateItem(draft)} />
          </Field>
          <Field label={t("editor.number")}>
            <input value={draft.card.number} onChange={(e) => setDraft({ ...draft, card: { ...draft.card!, number: e.target.value } })} onBlur={() => updateItem(draft)} />
            <button onClick={() => copySecret(draft.card!.number, t("editor.number"))}>{t("editor.copy")}</button>
          </Field>
          <Field label={t("editor.exp")}>
            <input placeholder={t("editor.expPlaceholder")} value={draft.card.exp} onChange={(e) => setDraft({ ...draft, card: { ...draft.card!, exp: e.target.value } })} onBlur={() => updateItem(draft)} />
          </Field>
          <Field label={t("editor.cvv")}>
            <input value={draft.card.code} onChange={(e) => setDraft({ ...draft, card: { ...draft.card!, code: e.target.value } })} onBlur={() => updateItem(draft)} />
            <button onClick={() => copySecret(draft.card!.code, t("editor.cvv"))}>{t("editor.copy")}</button>
          </Field>
        </>
      )}

      {draft.kind === "identity" && draft.identity && (
        <>
          <Field label={t("editor.firstName")}>
            <input value={draft.identity.firstName} onChange={(e) => setDraft({ ...draft, identity: { ...draft.identity!, firstName: e.target.value } })} onBlur={() => updateItem(draft)} />
          </Field>
          <Field label={t("editor.lastName")}>
            <input value={draft.identity.lastName} onChange={(e) => setDraft({ ...draft, identity: { ...draft.identity!, lastName: e.target.value } })} onBlur={() => updateItem(draft)} />
          </Field>
          <Field label={t("editor.email")}>
            <input value={draft.identity.email} onChange={(e) => setDraft({ ...draft, identity: { ...draft.identity!, email: e.target.value } })} onBlur={() => updateItem(draft)} />
          </Field>
          <Field label={t("editor.phone")}>
            <input value={draft.identity.phone} onChange={(e) => setDraft({ ...draft, identity: { ...draft.identity!, phone: e.target.value } })} onBlur={() => updateItem(draft)} />
          </Field>
          <Field label={t("editor.address")}>
            <input value={draft.identity.address} onChange={(e) => setDraft({ ...draft, identity: { ...draft.identity!, address: e.target.value } })} onBlur={() => updateItem(draft)} />
          </Field>
        </>
      )}

      <Field label={t("editor.notes")}>
        <textarea
          value={draft.notes}
          rows={draft.kind === "note" ? 12 : 4}
          onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
          onBlur={() => updateItem(draft)}
        />
      </Field>

      {/* Campos personalizados */}
      <div className="section">
        <div className="section-head">
          <span>{t("editor.customFields")}</span>
          <button onClick={addField}>{t("editor.add")}</button>
        </div>
        {fields.map((f) => (
          <div key={f.id} className="cf-row">
            <input
              className="cf-name"
              placeholder={t("editor.cfName")}
              value={f.name}
              onChange={(e) => setField(f.id, { name: e.target.value })}
              onBlur={commitFields}
            />
            <input
              className="cf-value"
              type={f.hidden ? "password" : "text"}
              placeholder={t("editor.cfValue")}
              value={f.value}
              onChange={(e) => setField(f.id, { value: e.target.value })}
              onBlur={commitFields}
            />
            <button title={f.hidden ? t("editor.showTitle") : t("editor.hideTitle")} onClick={() => toggleFieldHidden(f.id)}>
              {f.hidden ? "🙈" : "👁"}
            </button>
            <button title={t("editor.copyTitle")} onClick={() => copySecret(f.value, f.name || t("editor.fieldLabel"))}>
              ⧉
            </button>
            <button title={t("editor.removeTitle")} onClick={() => removeField(f.id)}>
              ✕
            </button>
          </div>
        ))}
      </div>

      {/* Anexos */}
      <div className="section">
        <div className="section-head">
          <span>{t("editor.attachments")} <span className="muted">{t("editor.attachHint")}</span></span>
          <button onClick={addAttachment}>{t("editor.attach")}</button>
        </div>
        {attachments.map((a) => (
          <div key={a.id} className="att-row">
            <span className="att-name">📎 {a.name}</span>
            <span className="att-size">{Math.max(1, Math.round(a.size / 1024))} KB</span>
            <button onClick={() => saveAttachment(a)}>{t("editor.save")}</button>
            <button title={t("editor.removeTitle")} onClick={() => removeAttachment(a.id)}>
              ✕
            </button>
          </div>
        ))}
      </div>

      {/* Histórico de senhas (login) */}
      {draft.kind === "login" && history.length > 0 && (
        <div className="section">
          <button className="section-toggle" onClick={() => setShowHistory((v) => !v)}>
            {showHistory ? "▾" : "▸"} {t("editor.history", { n: history.length })}
          </button>
          {showHistory &&
            history.map((h, i) => (
              <div key={i} className="hist-row">
                <code>{h.password}</code>
                <span className="muted">{new Date(h.at).toLocaleDateString(getLocale())}</span>
                <button onClick={() => copySecret(h.password, t("editor.oldPassword"))}>{t("editor.copy")}</button>
              </div>
            ))}
        </div>
      )}

      <div className="editor-foot">
        {inTrash ? (
          <>
            <button onClick={() => restoreItem(draft.id)}>{t("editor.restore")}</button>
            <button
              className="danger"
              onClick={() => {
                if (confirm(t("editor.deleteConfirm"))) deleteForever(draft.id);
              }}
            >
              {t("editor.deleteForever")}
            </button>
          </>
        ) : (
          <button className="danger" onClick={() => trashItem(draft.id)}>
            {t("editor.toTrash")}
          </button>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <div className="field-row">{children}</div>
    </label>
  );
}
