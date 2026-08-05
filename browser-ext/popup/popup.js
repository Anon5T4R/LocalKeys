// LocalKeys — popup. Fala com o background (que fala com o app desktop).

"use strict";

const api = globalThis.browser ?? globalThis.chrome;

const $ = (id) => document.getElementById(id);
const unlockView = $("unlock-view");
const mainView = $("main-view");
const statusDot = $("status-dot");
const lockBtn = $("lock-btn");
const search = $("search");
const list = $("list");
const emptyMsg = $("empty");
const footer = $("footer");
const unlockForm = $("unlock-form");
const unlockPath = $("unlock-path");
const unlockPassword = $("unlock-password");
const unlockError = $("unlock-error");

let state = { unlocked: false, logins: [], lastVaultPath: null };
let query = "";
let totpTimer = null;
const totps = new Map(); // itemId -> { code, expiresAt }

function send(msg) {
  return api.runtime.sendMessage(msg).then((res) => {
    if (!res.ok) throw new Error(res.error || "erro do LocalKeys");
    return res;
  });
}

function renderStatus(s) {
  state.unlocked = s.unlocked;
  state.lastVaultPath = s.lastVaultPath || null;
  state.logins = s.logins || [];
  statusDot.classList.toggle("on", s.unlocked);
  lockBtn.hidden = !s.unlocked;
  unlockView.classList.toggle("hidden", s.unlocked);
  mainView.classList.toggle("hidden", !s.unlocked);
  if (!s.unlocked) {
    stopTotp();
    totps.clear();
    unlockPath.value = state.lastVaultPath || "";
    unlockPassword.focus();
  } else {
    renderList();
    startTotp();
  }
}

// ── lista ──────────────────────────────────────────────────────────────────

function matches(item) {
  if (!query) return true;
  const hay = [item.name, item.username, ...(item.uris || [])].join(" ").toLowerCase();
  return hay.includes(query);
}

function renderItem(item) {
  const li = document.createElement("li");
  li.className = "item";
  li.dataset.id = item.id;

  const info = document.createElement("div");
  info.className = "info";
  const name = document.createElement("div");
  name.className = "name";
  name.textContent = item.name || "(sem nome)";
  const meta = document.createElement("div");
  meta.className = "meta";
  meta.textContent = item.username || "";
  info.append(name, meta);

  const totp = document.createElement("div");
  totp.className = "totp";
  totp.dataset.id = item.id;

  const actions = document.createElement("div");
  actions.className = "actions";

  const fill = document.createElement("button");
  fill.className = "btn fill";
  fill.textContent = "Preencher";
  fill.addEventListener("click", () => onFill(item.id, fill));

  const copyUser = document.createElement("button");
  copyUser.className = "btn";
  copyUser.textContent = "Usuário";
  copyUser.addEventListener("click", () => onCopy("username", item.id, copyUser));

  const copyPass = document.createElement("button");
  copyPass.className = "btn";
  copyPass.textContent = "Senha";
  copyPass.addEventListener("click", () => onCopy("password", item.id, copyPass));

  actions.append(fill, copyUser, copyPass);
  li.append(info, totp, actions);
  return li;
}

function renderList() {
  const items = state.logins.filter(matches);
  emptyMsg.classList.toggle("hidden", items.length > 0);
  list.replaceChildren(...items.map(renderItem));
  paintTotp();
}

async function onFill(itemId, btn) {
  try {
    await send({ type: "fill", itemId });
    flash(btn, "Preenchido");
    window.close();
  } catch (e) {
    footer.textContent = e.message;
  }
}

async function onCopy(field, itemId, btn) {
  try {
    const res = await send({ type: "copy", field, itemId });
    if (res.via === "browser") {
      await navigator.clipboard.writeText(res.text);
    }
    flash(btn, "Copiado");
  } catch (e) {
    footer.textContent = e.message;
  }
}

function flash(btn, text) {
  const prev = btn.textContent;
  btn.textContent = text;
  btn.classList.add("ok");
  setTimeout(() => {
    btn.textContent = prev;
    btn.classList.remove("ok");
  }, 900);
}

// ── TOTP (contagem local, 1 pedido por item a cada 30 s) ───────────────────

function startTotp() {
  stopTotp();
  const items = state.logins.filter((l) => l.totp);
  if (!items.length) return;
  for (const it of items) {
    if (!totps.has(it.id)) requestTotp(it.id);
  }
  totpTimer = setInterval(tickTotp, 1000);
}

function stopTotp() {
  if (totpTimer) {
    clearInterval(totpTimer);
    totpTimer = null;
  }
}

function requestTotp(id) {
  const item = state.logins.find((l) => l.id === id);
  if (!item || !item.totp) return;
  send({ type: "totp", secret: item.totp })
    .then((r) => {
      totps.set(id, { code: r.code, expiresAt: Date.now() + r.secondsRemaining * 1000 });
      paintTotp();
    })
    .catch(() => {});
}

function tickTotp() {
  const now = Date.now();
  for (const [id, t] of totps) {
    if (now >= t.expiresAt - 800) requestTotp(id);
  }
  paintTotp();
}

function paintTotp() {
  const now = Date.now();
  for (const el of document.querySelectorAll(".totp")) {
    const t = totps.get(el.dataset.id);
    if (!t) {
      el.textContent = "";
      continue;
    }
    const left = Math.max(0, Math.ceil((t.expiresAt - now) / 1000));
    el.textContent = t.code + " · " + left + "s";
  }
}

// ── eventos ────────────────────────────────────────────────────────────────

unlockForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  unlockError.textContent = "";
  const path = unlockPath.value.trim() || state.lastVaultPath;
  const password = unlockPassword.value;
  if (!path || !password) {
    unlockError.textContent = "Informe o caminho do cofre e a master password.";
    return;
  }
  try {
    const res = await send({ type: "unlock", path, password });
    unlockPassword.value = "";
    renderStatus({ unlocked: true, lastVaultPath: res.lastVaultPath, logins: res.logins });
  } catch (err) {
    unlockError.textContent = err.message;
  }
});

lockBtn.addEventListener("click", async () => {
  try {
    await send({ type: "lock" });
  } catch {
    /* segue mesmo sem resposta */
  }
  stopTotp();
  totps.clear();
  renderStatus(await send({ type: "status" }));
});

search.addEventListener("input", () => {
  query = search.value.trim().toLowerCase();
  renderList();
});

// ── abertura ───────────────────────────────────────────────────────────────

(async function init() {
  footer.textContent = "Conectando ao LocalKeys…";
  try {
    const s = await send({ type: "status" });
    footer.textContent = "";
    renderStatus(s);
  } catch (e) {
    footer.textContent = e.message;
  }
})();
