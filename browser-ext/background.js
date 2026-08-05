// LocalKeys — background (service worker / event page).
//
// Fala com o host nativo `com.localkeys.bridge` (modo live) OU usa o cache
// local cifrado (modo autônomo). A escolha é automática no `status`:
//
//  - live: o app está aberto; os logins vêm do bridge (socket -> app). A
//    master fica no app; aqui ela não entra.
//  - standalone: o app pode estar fechado; os logins vêm de um cache local
//    CIFRADO (XChaCha20-Poly1305), decifrado com chave derivada da master
//    (Argon2id via libsodium/WASM) e mantida SÓ na sessão do navegador.
//
// A chave de sessão vive em `chrome.storage.session` (memória; some quando o
// navegador fecha). O blob cifrado (salt+nonce+ciphertext) vive em
// `chrome.storage.local`. As senhas em claro só existem nesta variável
// efêmera do worker — que o MV3 derruba por inatividade, e aí a popup
// recarrega da fonte (live ou cache decifrado).

"use strict";

const api = globalThis.browser ?? globalThis.chrome;

// libsodium (build single-file com o WASM embutido). Após o importScripts, o
// objeto `sodium` existe no escopo com `.ready` (promise de inicialização).
importScripts("libsodium/sodium.js");
const sodium = globalThis.sodium;

const HOST_NAME = "com.localkeys.bridge";
const SEND_TIMEOUT_MS = 30000;

// Argon2id com os mesmos parâmetros do app (m=64 MiB, t=3, p=1).
const PWHASH_OPSLIMIT = 3;
const PWHASH_MEMLIMIT = 64 * 1024 * 1024;
const CACHE_STORAGE_KEY = "lkCache"; // { salt, nonce, ct, importedAt }
const SESSION_KEY_STORAGE_KEY = "lkKey"; // base64 da chave de sessão

let port = null;
let nextId = 1;
const pending = new Map(); // id -> { resolve, reject }
let logins = null; // cache em memória (efêmero, do modo que estiver ativo)

// ── storage (blob cifrado + chave de sessão) ────────────────────────────────

async function getCache() {
  const o = await api.storage.local.get(CACHE_STORAGE_KEY);
  return o[CACHE_STORAGE_KEY] || null;
}
async function setCache(cache) {
  await api.storage.local.set({ [CACHE_STORAGE_KEY]: cache });
}
async function clearCache() {
  await api.storage.local.remove(CACHE_STORAGE_KEY);
}
async function getSessionKeyB64() {
  const o = await api.storage.session.get(SESSION_KEY_STORAGE_KEY);
  return o[SESSION_KEY_STORAGE_KEY] || null;
}
async function setSessionKeyB64(b64) {
  await api.storage.session.set({ [SESSION_KEY_STORAGE_KEY]: b64 });
}
async function clearSessionKey() {
  await api.storage.session.remove(SESSION_KEY_STORAGE_KEY);
}

// ── libsodium ────────────────────────────────────────────────────────────────

async function sodiumReady() {
  await sodium.ready;
}
function b64(u8) {
  return sodium.to_base64(u8, sodium.base64_variants.ORIGINAL);
}
function unb64(s) {
  return sodium.from_base64(s, sodium.base64_variants.ORIGINAL);
}
async function deriveKey(master, salt) {
  // Chave de 32 B derivada da master (só vive em memória).
  return sodium.crypto_pwhash(
    32,
    master,
    salt,
    PWHASH_OPSLIMIT,
    PWHASH_MEMLIMIT,
    sodium.crypto_pwhash_ALG_ARGON2ID13
  );
}
function encryptLogins(plain, key, salt) {
  const msg = sodium.from_string(JSON.stringify(plain));
  const nonce = sodium.randombytes_buf(sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);
  const ct = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(msg, null, null, null, nonce, key);
  return { salt: b64(salt), nonce: b64(nonce), ct: b64(ct), importedAt: Date.now() };
}
function decryptLogins(cache, key) {
  const msg = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
    null, unb64(cache.ct), null, unb64(cache.nonce), key
  );
  return JSON.parse(sodium.to_string(msg));
}

// ── bridge (native messaging) ────────────────────────────────────────────────

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
    for (const [, job] of pending) job.reject(new Error("LocalKeys não respondeu"));
    pending.clear();
    // Reconexão preguiçosa: no próximo send(). Não fica spawnando processos
    // do bridge à toa com o app fechado.
  });
}

function send(op, payload = {}) {
  return new Promise((resolve, reject) => {
    connect();
    if (!port) {
      reject(new Error("LocalKeys não está instalado"));
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
      reject(new Error("LocalKeys não respondeu"));
    }, SEND_TIMEOUT_MS);
  });
}

// ── estado / roteador ────────────────────────────────────────────────────────

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
    case "liveProbe":
      return liveProbe();
    case "unlock":
      return unlockViaApp(msg.path, msg.password);
    case "standaloneUnlock":
      return standaloneUnlock(msg.master);
    case "enableStandalone":
      return enableStandalone(msg.master);
    case "syncCache":
      return syncCache();
    case "disableStandalone":
      return disableStandalone();
    case "activate":
      return activate();
    case "lock":
      return lock();
    case "copy":
      return copySecret(msg.field, msg.itemId);
    case "fill":
      return fill(msg.itemId);
    default:
      throw new Error("pedido desconhecido: " + msg.type);
  }
}

// ── modos ────────────────────────────────────────────────────────────────────

async function status() {
  const cache = await getCache();
  const sessionKeyB64 = await getSessionKeyB64();

  // 1) Modo autônomo ativo: responde na hora com o cache decifrado, sem sondar
  //    o bridge (o app pode estar fechado — sonda custaria ~2,5 s + processo).
  if (cache && sessionKeyB64) {
    try {
      logins = decryptLogins(cache, unb64(sessionKeyB64));
      return {
        mode: "standalone",
        unlocked: true,
        logins,
        lastVaultPath: null,
        cache: { present: true, importedAt: cache.importedAt || null },
        standaloneActive: true,
      };
    } catch {
      await clearSessionKey(); // chave corrompida; volta a pedir a master
    }
  }

  // 2) Sem modo autônomo: sonda o bridge (sonda não abre o app).
  let app = { reachable: false, unlocked: false, lastVaultPath: null };
  try {
    const s = await send("status");
    app = { reachable: true, unlocked: s.unlocked, lastVaultPath: s.lastVaultPath || null };
  } catch {
    /* app fechado */
  }

  if (app.reachable && app.unlocked) {
    try {
      const v = await send("vault");
      logins = v.logins;
    } catch {
      /* mantém o que houver */
    }
    return {
      mode: "live",
      unlocked: true,
      logins,
      lastVaultPath: app.lastVaultPath,
      cache: { present: !!cache, importedAt: (cache && cache.importedAt) || null },
      standaloneActive: !!sessionKeyB64,
    };
  }

  logins = null;
  const mode = app.reachable ? "app-locked" : cache ? "offline-locked" : "offline-none";
  return {
    mode,
    unlocked: false,
    lastVaultPath: app.reachable ? app.lastVaultPath : null,
    cache: { present: !!cache, importedAt: (cache && cache.importedAt) || null },
    standaloneActive: !!sessionKeyB64,
  };
}

/// Sonda rápida do app já aberto (usada pela popup para subir de standalone →
/// live sem travar o render inicial).
async function liveProbe() {
  let s;
  try {
    s = await send("status");
  } catch {
    return { live: false };
  }
  if (!s.unlocked) return { live: false, locked: true };
  const v = await send("vault");
  logins = v.logins;
  return { live: true, logins, lastVaultPath: s.lastVaultPath };
}

// ── ações ────────────────────────────────────────────────────────────────────

async function unlockViaApp(path, password) {
  if (!path || !password) throw new Error("caminho e master password são obrigatórios");
  const res = await send("unlock", { path, password });
  logins = res.logins;
  return {
    mode: "live",
    unlocked: true,
    logins,
    lastVaultPath: res.lastVaultPath,
    cache: (await getCache()) ? { present: true } : { present: false },
  };
}

/// Decifra o cache local com a master (app fechado / sessão perdida).
async function standaloneUnlock(master) {
  if (!master) throw new Error("digite a master password");
  const cache = await getCache();
  if (!cache) throw new Error("sem cache local — abra o LocalKeys e ative o modo autônomo antes");
  await sodiumReady();
  const key = await deriveKey(master, unb64(cache.salt));
  let plain;
  try {
    plain = decryptLogins(cache, key);
  } catch {
    throw new Error("master password incorreta");
  }
  await setSessionKeyB64(b64(key));
  logins = plain;
  return {
    mode: "standalone",
    unlocked: true,
    logins,
    cache: { present: true, importedAt: cache.importedAt || null },
    standaloneActive: true,
  };
}

/// Importa os logins do app (precisa dele aberto e destrancado) e ativa o modo
/// autônomo. "Primeiro import" do fluxo do João.
async function enableStandalone(master) {
  if (!master) throw new Error("digite a master password");
  const v = await send("vault"); // falha rápido se o app estiver fechado/trancado
  if (!v || !v.logins) throw new Error("o cofre está trancado no app — destranque para importar");
  await sodiumReady();
  const salt = sodium.randombytes_buf(16);
  const key = await deriveKey(master, salt);
  const cache = encryptLogins(v.logins, key, salt);
  await setCache(cache);
  await setSessionKeyB64(b64(key));
  logins = v.logins;
  return {
    mode: "live",
    unlocked: true,
    logins,
    cache: { present: true, importedAt: cache.importedAt },
    standaloneActive: true,
  };
}

/// Re-sincroniza o blob cifrado com o vault atual do app (mesma chave: mantém
/// o salt para a master continuar derivando a mesma chave).
async function syncCache() {
  const sessionKeyB64 = await getSessionKeyB64();
  const cache = await getCache();
  if (!sessionKeyB64 || !cache) {
    throw new Error("modo autônomo não ativado — ative digitando a master");
  }
  const v = await send("vault");
  if (!v || !v.logins) throw new Error("o cofre está trancado no app — destranque para sincronizar");
  await sodiumReady();
  const key = unb64(sessionKeyB64);
  const updated = encryptLogins(v.logins, key, unb64(cache.salt));
  await setCache(updated);
  logins = v.logins;
  return { importedAt: updated.importedAt };
}

async function disableStandalone() {
  await clearCache();
  await clearSessionKey();
  logins = null;
  return {};
}

async function lock() {
  try {
    await send("lock");
  } catch {
    /* app pode estar fechado */
  }
  logins = null;
  await clearSessionKey();
  return {};
}

async function activate() {
  const r = await send("activate"); // o bridge abre o app (se fechado) e responde já
  return { spawned: !!r.spawned };
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
    // Preferência: clipboard nativo do app (no Windows exclui o histórico Win+V
    // e a nuvem e limpa em 30 s).
    await send("copy", { text });
    return { via: "native" };
  } catch {
    // Fallback (app fechado / Linux): clipboard do navegador.
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
