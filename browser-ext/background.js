// LocalKeys — background (service worker / event page).
//
// Único ponto que fala com o host nativo `com.localkeys.bridge`. O navegador
// lança o binário `localkeys-bridge`, que se conecta no socket do app desktop;
// aqui a gente só posta/recebe JSON.
//
// Segurança: o cache de logins (com senhas) vive SÓ nesta memória de worker. Se
// o worker morrer (MV3 faz isso por inatividade) ou o app desconectar, o cache
// some — e o próximo `status` re-busca do app (que continua destrancado), sem
// pedir a master de novo.

"use strict";

// Chrome não tem o namespace `browser`; Firefox tem. As APIs usadas aqui são
// promise-based nas duas plataformas (MV3).
const api = globalThis.browser ?? globalThis.chrome;

const HOST_NAME = "com.localkeys.bridge";
const SEND_TIMEOUT_MS = 30000;

let port = null;
let nextId = 1;
const pending = new Map(); // id -> { resolve, reject }
let logins = null; // cache em memória: [{ id, name, username, password, uris, totp, ... }]

function connect() {
  if (port) return;
  try {
    port = api.runtime.connectNative(HOST_NAME);
  } catch {
    port = null;
    return;
  }
  port.onMessage.addListener((msg) => {
    if (!msg || msg.id === undefined) return;
    const job = pending.get(msg.id);
    if (!job) return;
    pending.delete(msg.id);
    if (msg.ok) job.resolve(msg);
    else job.reject(new Error(msg.error || "erro do LocalKeys"));
  });
  port.onDisconnect.addListener(() => {
    port = null;
    logins = null;
    for (const [, job] of pending) job.reject(new Error("desconectado do LocalKeys"));
    pending.clear();
    // O app pode ter sido aberto/reativado no meio tempo; tenta de novo daqui a pouco.
    setTimeout(connect, 1000);
  });
}

function send(op, payload = {}) {
  return new Promise((resolve, reject) => {
    if (!port) connect();
    if (!port) {
      reject(new Error("LocalKeys não está instalado — instale o app para usar a extensão"));
      return;
    }
    const id = nextId++;
    pending.set(id, { resolve, reject });
    try {
      port.postMessage({ id, op, ...payload });
    } catch (e) {
      pending.delete(id);
      reject(new Error("falha ao enviar ao LocalKeys: " + (e && e.message ? e.message : e)));
      return;
    }
    setTimeout(() => {
      if (!pending.has(id)) return;
      pending.delete(id);
      reject(new Error("LocalKeys não respondeu — o app está aberto?"));
    }, SEND_TIMEOUT_MS);
  });
}

// ── roteador (popup -> background -> host nativo) ───────────────────────────

api.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  handleMessage(msg)
    .then((res) => sendResponse({ ok: true, ...res }))
    .catch((e) => sendResponse({ ok: false, error: e.message }));
  return true; // resposta assíncrona
});

async function handleMessage(msg) {
  switch (msg.type) {
    case "status":
      return status();
    case "unlock":
      return unlock(msg.path, msg.password);
    case "lock":
      await send("lock");
      logins = null;
      return {};
    case "totp":
      return { ...(await send("totp", { secret: msg.secret })) };
    case "copy":
      return copySecret(msg.field, msg.itemId);
    case "fill":
      return fill(msg.itemId);
    default:
      throw new Error("pedido desconhecido: " + msg.type);
  }
}

async function status() {
  const s = await send("status");
  if (s.unlocked && !logins) {
    try {
      const v = await send("vault");
      logins = v.logins;
    } catch {
      // cache continua vazio; a popup re-tenta no próximo pedido
    }
  }
  return { unlocked: s.unlocked, lastVaultPath: s.lastVaultPath, logins };
}

async function unlock(path, password) {
  if (!path || !password) throw new Error("caminho e master password são obrigatórios");
  await send("unlock", { path, password });
  const v = await send("vault");
  logins = v.logins;
  return { unlocked: true, lastVaultPath: path, logins };
}

function findLogin(id) {
  const item = (logins || []).find((l) => l.id === id);
  if (!item) throw new Error("item não encontrado — destranque novamente");
  return item;
}

async function copySecret(field, itemId) {
  const item = findLogin(itemId);
  const text = field === "password" ? item.password : item.username;
  if (!text) throw new Error("campo vazio");
  try {
    // Preferência: passa pelo app (no Windows o clipboard exclui o histórico
    // Win+V e a nuvem e limpa em 30 s).
    await send("copy", { text });
    return { via: "native" };
  } catch {
    // Fallback: a popup tenta o clipboard do navegador (ex.: Linux).
    return { via: "browser", text };
  }
}

async function fill(itemId) {
  const item = findLogin(itemId);
  const [tab] = await api.tabs.query({ active: true, currentWindow: true });
  if (!tab || tab.id === undefined) throw new Error("nenhuma aba ativa");
  const res = await api.tabs.sendMessage(tab.id, {
    type: "fill",
    username: item.username,
    password: item.password,
  });
  if (!res || !res.ok) throw new Error("a página não tem campos de login visíveis");
  return {};
}
