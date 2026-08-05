// LocalKeys — popup. Fala com o background (bridge live OU cache autônomo).

"use strict";

const api = globalThis.browser ?? globalThis.chrome;

const $ = (id) => document.getElementById(id);
const setHidden = (el, hidden) => el.classList.toggle("hidden", hidden);

const unlockView = $("unlock-view");
const mainView = $("main-view");
const statusDot = $("status-dot");
const lockBtn = $("lock-btn");
const syncBtn = $("sync-btn");
const settingsBtn = $("settings-btn");
const search = $("search");
const list = $("list");
const emptyMsg = $("empty");
const footer = $("footer");
const unlockForm = $("unlock-form");
const unlockPath = $("unlock-path");
const unlockPassword = $("unlock-password");
const unlockError = $("unlock-error");
const standaloneForm = $("standalone-form");
const standalonePassword = $("standalone-password");
const activateBtn = $("activate-btn");
const useCacheBtn = $("use-cache-btn");
const panelMaster = $("panel-master");
const enableStandaloneBtn = $("enable-standalone-btn");
const syncNowBtn = $("sync-now-btn");

let state = {
  unlocked: false,
  mode: "offline-none",
  logins: [],
  lastVaultPath: null,
  cache: { present: false, importedAt: null },
  standaloneActive: false,
  host: null,
};
let query = "";
let totpTimer = null;
const totps = new Map(); // itemId -> { code, expiresAt }

function send(msg) {
  return api.runtime.sendMessage(msg).then((res) => {
    if (!res.ok) throw new Error(res.error || "erro do LocalKeys");
    return res;
  });
}

// ── render geral ─────────────────────────────────────────────────────────────

function renderStatus(s) {
  state.unlocked = !!s.unlocked;
  state.mode = s.mode || "offline-none";
  state.lastVaultPath = s.lastVaultPath || null;
  state.logins = s.logins || [];
  state.cache = s.cache || { present: false, importedAt: null };
  state.standaloneActive = !!s.standaloneActive;

  statusDot.classList.toggle("on", s.unlocked);
  setHidden(lockBtn, !s.unlocked);
  setHidden(syncBtn, !s.unlocked);
  setHidden(settingsBtn, !s.unlocked);
  setHidden(unlockView, s.unlocked);
  setHidden(mainView, !s.unlocked);

  renderSource();
  renderSettings();

  if (!s.unlocked) {
    stopTotp();
    totps.clear();
    configureUnlock(s);
  } else {
    renderList();
    renderSuggestion(state.host);
    startTotp();
  }
}

function renderSource() {
  const banner = $("source");
  if (!state.unlocked) {
    setHidden(banner, true);
    return;
  }
  setHidden(banner, false);
  const lbl = document.createElement("span");
  lbl.className = "lbl" + (state.mode === "standalone" ? " standalone" : "");
  lbl.textContent =
    state.mode === "standalone" ? "Modo autônomo" : "Conectado ao app";
  const sub = document.createElement("span");
  sub.textContent =
    state.mode === "standalone" ? "· app fechado, dados do cache local" : "· cofre do app";
  banner.replaceChildren(lbl, sub);
}

function configureUnlock(s) {
  const hint = $("unlock-hint");
  const activateHidden = true;
  unlockError.textContent = "";
  setHidden(unlockForm, true);
  setHidden(standaloneForm, true);
  setHidden(activateBtn, activateHidden);
  setHidden(useCacheBtn, true);

  if (s.mode === "app-locked") {
    hint.textContent =
      "O cofre está trancado no app. Digite a master para a extensão ver os logins.";
    setHidden(unlockForm, false);
    unlockPath.value = s.lastVaultPath || "";
    setHidden(useCacheBtn, !(s.cache && s.cache.present));
    unlockPassword.focus();
  } else if (s.mode === "offline-locked") {
    hint.textContent =
      "O app está fechado. Digite a master para decifrar o cache local (modo autônomo).";
    setHidden(standaloneForm, false);
    setHidden(activateBtn, false);
    standalonePassword.focus();
  } else {
    hint.textContent =
      "O LocalKeys está fechado. Abra o app para importar ou usar os logins.";
    setHidden(activateBtn, false);
  }
}

// ── site atual (sugestão) ───────────────────────────────────────────────────

async function currentSite() {
  try {
    const [tab] = await api.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url) return null;
    const u = new URL(tab.url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

function hostOf(uri) {
  try {
    return new URL(uri).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

function matchesSite(item, host) {
  return (item.uris || []).some((uri) => {
    const h = hostOf(uri);
    if (!h) return false;
    return h === host || h.endsWith("." + host) || host.endsWith("." + h);
  });
}

const AVATAR_COLORS = [
  "#4f8cff", "#8b5cf6", "#0ea5e9", "#46b469",
  "#d9a53e", "#e5484d", "#e8853b", "#06b6d4", "#a3a3e0",
];
function colorFor(seed) {
  let h = 0;
  for (const ch of String(seed || "?")) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
function initialFor(item) {
  const s = String(item.name || item.username || "?").trim();
  return (s[0] || "?").toUpperCase();
}

// ── lista ──────────────────────────────────────────────────────────────────

function matches(item) {
  if (!query) return true;
  const hay = [item.name, item.username, ...(item.uris || [])].join(" ").toLowerCase();
  return hay.includes(query);
}

function makeActions(item) {
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
  return actions;
}

function renderItem(item) {
  const li = document.createElement("li");
  li.className = "item";
  li.dataset.id = item.id;

  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.style.background = colorFor(item.name || (item.uris || [])[0]);
  avatar.textContent = initialFor(item);

  const info = document.createElement("div");
  info.className = "info";
  const name = document.createElement("div");
  name.className = "name";
  name.textContent = item.name || "(sem nome)";
  const metaText = [item.username, hostOf((item.uris || [])[0])]
    .filter(Boolean)
    .join(" · ");
  const meta = document.createElement("div");
  meta.className = "meta";
  meta.textContent = metaText;
  info.append(name, meta);

  const totp = document.createElement("div");
  totp.className = "totp";
  totp.dataset.id = item.id;

  li.append(avatar, info, totp, makeActions(item));
  return li;
}

function renderList() {
  const items = state.logins.filter(matches);
  setHidden(emptyMsg, items.length > 0);
  list.replaceChildren(...items.map(renderItem));
  paintTotp();
}

// ── card de sugestão do site atual ──────────────────────────────────────────

function renderSuggestion(host) {
  const box = $("suggestion");
  box.replaceChildren();
  setHidden(box, true);
  if (!host || !state.logins.length) return;

  const matches = state.logins.filter((l) => matchesSite(l, host));
  const head = document.createElement("div");
  head.className = "suggest-head";
  if (!matches.length) {
    head.classList.add("empty");
    head.textContent = "Nenhum login salvo para " + host;
    box.append(head);
    setHidden(box, false);
    return;
  }

  head.textContent =
    matches.length === 1 ? "1 login para este site" : matches.length + " logins para este site";
  box.append(head);

  const sorted = [...matches].sort(
    (a, b) => Number(!!b.favorite) - Number(!!a.favorite)
  );
  for (const item of sorted.slice(0, 3)) {
    const card = document.createElement("div");
    card.className = "card";

    const avatar = document.createElement("div");
    avatar.className = "avatar";
    avatar.style.background = colorFor(item.name || (item.uris || [])[0]);
    avatar.textContent = initialFor(item);

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

    card.append(avatar, info, totp, makeActions(item));
    box.append(card);
  }
  setHidden(box, false);
}

// ── ações ───────────────────────────────────────────────────────────────────

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

// ── TOTP local (WebCrypto, espelho do app: SHA-1, 6 dígitos, 30 s) ─────────

function startTotp() {
  stopTotp();
  const items = state.logins.filter((l) => l.totp);
  for (const it of items) {
    if (!totps.has(it.id)) refreshTotp(it.id);
  }
  totpTimer = setInterval(tickTotp, 1000);
}

function stopTotp() {
  if (totpTimer) {
    clearInterval(totpTimer);
    totpTimer = null;
  }
}

async function refreshTotp(id) {
  const item = state.logins.find((l) => l.id === id);
  if (!item || !item.totp) return;
  try {
    const r = await LKTotp.code(item.totp);
    totps.set(id, { code: r.code, expiresAt: Date.now() + r.secondsRemaining * 1000 });
  } catch {
    totps.delete(id);
  }
  paintTotp();
}

function tickTotp() {
  const now = Date.now();
  for (const id of [...totps.keys()]) {
    const t = totps.get(id);
    if (t && now >= t.expiresAt - 800) refreshTotp(id);
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

// ── opções (modo autônomo / sincronizar / esquecer) ────────────────────────

function renderSettings() {
  const panel = $("settings-panel");
  if (panel.classList.contains("hidden")) return;
  const cacheStatus = $("cache-status");
  const setup = $("standalone-setup");
  const hasCache = state.cache && state.cache.present;
  const active = state.standaloneActive;

  if (hasCache) {
    const d = state.cache.importedAt ? new Date(state.cache.importedAt) : null;
    cacheStatus.textContent =
      "Cache local: " +
      (d ? d.toLocaleString("pt-BR") : "importado") +
      (active ? " · modo autônomo ativo nesta sessão" : " · sessão bloqueada");
  } else {
    cacheStatus.textContent = "Cache local: ainda não importado.";
  }

  setHidden(syncNowBtn, !(hasCache && active));
  setHidden(setup, hasCache && active);
  enableStandaloneBtn.textContent = hasCache ? "Desbloquear cache" : "Ativar modo autônomo";
}

function refreshAfterChange() {
  return send({ type: "status" }).catch(() => ({
    mode: "offline-none",
    unlocked: false,
    cache: state.cache,
    standaloneActive: false,
  }));
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
    renderStatus({
      unlocked: true,
      mode: "live",
      lastVaultPath: res.lastVaultPath,
      logins: res.logins,
      cache: state.cache,
      standaloneActive: state.standaloneActive,
    });
    if (state.cache && state.cache.present && state.standaloneActive) {
      send({ type: "syncCache" }).catch(() => {});
    }
  } catch (err) {
    unlockError.textContent = err.message;
  }
});

standaloneForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  unlockError.textContent = "";
  try {
    const res = await send({ type: "standaloneUnlock", master: standalonePassword.value });
    standalonePassword.value = "";
    renderStatus(res);
  } catch (err) {
    unlockError.textContent = err.message;
  }
});

useCacheBtn.addEventListener("click", async () => {
  const master = unlockPassword.value || standalonePassword.value;
  unlockError.textContent = "";
  try {
    const res = await send({ type: "standaloneUnlock", master });
    standalonePassword.value = "";
    unlockPassword.value = "";
    renderStatus(res);
  } catch (err) {
    unlockError.textContent = err.message;
  }
});

activateBtn.addEventListener("click", async () => {
  try {
    await send({ type: "activate" });
  } catch {
    /* segue */
  }
  window.close();
});

lockBtn.addEventListener("click", async () => {
  try {
    await send({ type: "lock" });
  } catch {
    /* segue mesmo sem resposta */
  }
  stopTotp();
  totps.clear();
  renderStatus(await refreshAfterChange());
});

search.addEventListener("input", () => {
  query = search.value.trim().toLowerCase();
  renderList();
});

settingsBtn.addEventListener("click", () => {
  $("settings-panel").classList.toggle("hidden");
  renderSettings();
});

enableStandaloneBtn.addEventListener("click", async () => {
  const master = panelMaster.value;
  unlockError.textContent = "";
  if (!master) {
    unlockError.textContent = "Digite a master password.";
    return;
  }
  try {
    const res =
      state.cache && state.cache.present
        ? await send({ type: "standaloneUnlock", master })
        : await send({ type: "enableStandalone", master });
    panelMaster.value = "";
    renderStatus(res);
    window.close();
  } catch (err) {
    unlockError.textContent = err.message;
  }
});

syncNowBtn.addEventListener("click", async () => {
  try {
    const res = await send({ type: "syncCache" });
    footer.textContent =
      "Cache sincronizado em " + new Date(res.importedAt).toLocaleTimeString("pt-BR");
  } catch (e) {
    footer.textContent = e.message;
  }
});

syncBtn.addEventListener("click", async () => {
  try {
    const res = await send({ type: "syncCache" });
    footer.textContent =
      "Sincronizado em " + new Date(res.importedAt).toLocaleTimeString("pt-BR");
  } catch (e) {
    footer.textContent = e.message;
    $("settings-panel").classList.remove("hidden");
    renderSettings();
    if (!state.standaloneActive) panelMaster.focus();
  }
});

$("forget-cache-btn").addEventListener("click", async () => {
  await send({ type: "disableStandalone" }).catch(() => {});
  stopTotp();
  totps.clear();
  renderStatus(await refreshAfterChange());
});

// ── abertura ────────────────────────────────────────────────────────────────

async function liveProbe() {
  return send({ type: "liveProbe" });
}

(async function init() {
  state.host = await currentSite();
  footer.textContent = "";
  let s;
  try {
    s = await send({ type: "status" });
  } catch (e) {
    footer.textContent = e.message;
    s = {
      mode: "offline-none",
      unlocked: false,
      cache: { present: false, importedAt: null },
      standaloneActive: false,
    };
  }
  renderStatus(s);

  // Abriu em modo autônomo: sonda o app em paralelo (sem travar o render). Se
  // ele estiver de pé, sobe para live e re-sincroniza o cache.
  if (s.unlocked && s.mode === "standalone") {
    liveProbe()
      .then((probe) => {
        if (!probe || !probe.live) return;
        renderStatus({
          ...s,
          mode: "live",
          unlocked: true,
          logins: probe.logins,
          lastVaultPath: probe.lastVaultPath,
        });
        send({ type: "syncCache" }).catch(() => {});
      })
      .catch(() => {});
  }
})();
