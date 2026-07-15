import { useEffect, useMemo, useState } from "react";
import { useStore } from "../store";
import { emptyItem, KIND_LABEL, type Item, type ItemKind } from "../types";
import { Generator } from "./Generator";
import { StrengthMeter } from "./StrengthMeter";
import { TotpDisplay } from "./TotpDisplay";
import { ImportExport } from "./ImportExport";

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
  const lock = useStore((s) => s.lock);

  const [filter, setFilter] = useState<Filter>("all");
  const [showTools, setShowTools] = useState(false);

  const items = vault?.items ?? [];
  const selected = items.find((i) => i.id === selectedId) ?? null;

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items
      .filter((i) => (filter === "trash" ? i.deletedAt : !i.deletedAt))
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
          <button className="lock-btn" onClick={() => lock()} title="Trancar (Esc)">
            🔒 Trancar
          </button>
        </div>

        <input
          className="search"
          placeholder="Buscar…"
          value={search}
          autoFocus
          onChange={(e) => setSearch(e.target.value)}
        />

        <nav className="filters">
          {(
            [
              ["all", "Todos"],
              ["fav", "★ Favoritos"],
              ["login", "🔑 Logins"],
              ["note", "📝 Notas"],
              ["card", "💳 Cartões"],
              ["identity", "🪪 Identidades"],
              ["trash", "🗑 Lixeira"],
            ] as [Filter, string][]
          ).map(([f, label]) => (
            <button
              key={f}
              className={filter === f ? "active" : ""}
              onClick={() => {
                setFilter(f);
                select(null);
              }}
            >
              {label}
            </button>
          ))}
        </nav>

        <div className="new-item">
          <span>Novo:</span>
          {(["login", "note", "card", "identity"] as ItemKind[]).map((k) => (
            <button key={k} title={KIND_LABEL[k]} onClick={() => create(k)}>
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
              <span className="nm">{i.name || "(sem nome)"}</span>
              {i.favorite && <span className="fav">★</span>}
            </li>
          ))}
          {visible.length === 0 && <li className="empty">Nada aqui.</li>}
        </ul>

        <button className="tools-btn" onClick={() => setShowTools(true)}>
          ⇄ Importar / Exportar
        </button>
      </aside>

      <main className="detail">
        {selected ? (
          <ItemEditor key={selected.id} item={selected} />
        ) : (
          <div className="placeholder">
            <p>Selecione um item ou crie um novo.</p>
          </div>
        )}
      </main>

      {showTools && <ImportExport onClose={() => setShowTools(false)} />}
    </div>
  );
}

function ItemEditor({ item }: { item: Item }) {
  const updateItem = useStore((s) => s.updateItem);
  const trashItem = useStore((s) => s.trashItem);
  const restoreItem = useStore((s) => s.restoreItem);
  const deleteForever = useStore((s) => s.deleteForever);
  const copySecret = useStore((s) => s.copySecret);

  const [draft, setDraft] = useState<Item>(item);
  const [showPw, setShowPw] = useState(false);
  const [showGen, setShowGen] = useState(false);

  useEffect(() => setDraft(item), [item]);

  function commit(next: Item) {
    setDraft(next);
    updateItem(next);
  }
  const patch = (p: Partial<Item>) => commit({ ...draft, ...p });
  const patchLogin = (p: Partial<NonNullable<Item["login"]>>) =>
    commit({ ...draft, login: { ...draft.login!, ...p } });

  const inTrash = draft.deletedAt != null;

  return (
    <div className="editor">
      <div className="editor-head">
        <span className="big-ic">{KIND_ICON[draft.kind]}</span>
        <input
          className="title"
          placeholder={`Nome do ${KIND_LABEL[draft.kind].toLowerCase()}`}
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          onBlur={() => updateItem(draft)}
        />
        <button
          className={`star ${draft.favorite ? "on" : ""}`}
          title="Favorito"
          onClick={() => patch({ favorite: !draft.favorite })}
        >
          ★
        </button>
      </div>

      {draft.kind === "login" && draft.login && (
        <>
          <Field label="Usuário">
            <input
              value={draft.login.username}
              onChange={(e) => setDraft({ ...draft, login: { ...draft.login!, username: e.target.value } })}
              onBlur={() => updateItem(draft)}
            />
            <button onClick={() => copySecret(draft.login!.username, "Usuário")}>Copiar</button>
          </Field>

          <Field label="Senha">
            <input
              type={showPw ? "text" : "password"}
              value={draft.login.password}
              onChange={(e) => setDraft({ ...draft, login: { ...draft.login!, password: e.target.value } })}
              onBlur={() => updateItem(draft)}
            />
            <button onClick={() => setShowPw((v) => !v)}>{showPw ? "Ocultar" : "Ver"}</button>
            <button onClick={() => copySecret(draft.login!.password, "Senha")}>Copiar</button>
            <button onClick={() => setShowGen((v) => !v)}>Gerar</button>
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

          <Field label="URL">
            <input
              value={draft.login.uris[0] ?? ""}
              onChange={(e) =>
                setDraft({ ...draft, login: { ...draft.login!, uris: [e.target.value] } })
              }
              onBlur={() => updateItem(draft)}
            />
          </Field>

          <Field label="TOTP (chave base32)">
            <input
              placeholder="ex.: JBSWY3DPEHPK3PXP"
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
          <Field label="Titular">
            <input value={draft.card.cardholder} onChange={(e) => setDraft({ ...draft, card: { ...draft.card!, cardholder: e.target.value } })} onBlur={() => updateItem(draft)} />
          </Field>
          <Field label="Número">
            <input value={draft.card.number} onChange={(e) => setDraft({ ...draft, card: { ...draft.card!, number: e.target.value } })} onBlur={() => updateItem(draft)} />
            <button onClick={() => copySecret(draft.card!.number, "Número")}>Copiar</button>
          </Field>
          <Field label="Validade">
            <input placeholder="MM/AA" value={draft.card.exp} onChange={(e) => setDraft({ ...draft, card: { ...draft.card!, exp: e.target.value } })} onBlur={() => updateItem(draft)} />
          </Field>
          <Field label="CVV">
            <input value={draft.card.code} onChange={(e) => setDraft({ ...draft, card: { ...draft.card!, code: e.target.value } })} onBlur={() => updateItem(draft)} />
            <button onClick={() => copySecret(draft.card!.code, "CVV")}>Copiar</button>
          </Field>
        </>
      )}

      {draft.kind === "identity" && draft.identity && (
        <>
          <Field label="Nome">
            <input value={draft.identity.firstName} onChange={(e) => setDraft({ ...draft, identity: { ...draft.identity!, firstName: e.target.value } })} onBlur={() => updateItem(draft)} />
          </Field>
          <Field label="Sobrenome">
            <input value={draft.identity.lastName} onChange={(e) => setDraft({ ...draft, identity: { ...draft.identity!, lastName: e.target.value } })} onBlur={() => updateItem(draft)} />
          </Field>
          <Field label="E-mail">
            <input value={draft.identity.email} onChange={(e) => setDraft({ ...draft, identity: { ...draft.identity!, email: e.target.value } })} onBlur={() => updateItem(draft)} />
          </Field>
          <Field label="Telefone">
            <input value={draft.identity.phone} onChange={(e) => setDraft({ ...draft, identity: { ...draft.identity!, phone: e.target.value } })} onBlur={() => updateItem(draft)} />
          </Field>
          <Field label="Endereço">
            <input value={draft.identity.address} onChange={(e) => setDraft({ ...draft, identity: { ...draft.identity!, address: e.target.value } })} onBlur={() => updateItem(draft)} />
          </Field>
        </>
      )}

      <Field label="Notas">
        <textarea
          value={draft.notes}
          rows={draft.kind === "note" ? 12 : 4}
          onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
          onBlur={() => updateItem(draft)}
        />
      </Field>

      <div className="editor-foot">
        {inTrash ? (
          <>
            <button onClick={() => restoreItem(draft.id)}>Restaurar</button>
            <button
              className="danger"
              onClick={() => {
                if (confirm("Excluir para sempre? Não dá para desfazer.")) deleteForever(draft.id);
              }}
            >
              Excluir para sempre
            </button>
          </>
        ) : (
          <button className="danger" onClick={() => trashItem(draft.id)}>
            🗑 Mover para a lixeira
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
