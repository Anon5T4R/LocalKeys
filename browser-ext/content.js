// LocalKeys — content script. Preenche usuário/senha na página quando o
// background pedir (o usuário clica num item na popup).

"use strict";

const api = globalThis.browser ?? globalThis.chrome;

api.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === "fill") {
    const done = doFill(msg.username, msg.password);
    sendResponse({ ok: done });
  }
});

function visible(el) {
  if (!el || !el.isConnected) return false;
  const r = el.getClientRects();
  return r.length > 0 && r[0].width > 0 && r[0].height > 0;
}

function passwordInput() {
  return Array.from(document.querySelectorAll("input[type=password]")).find(visible);
}

function usernameInput() {
  const selectors = [
    "input[autocomplete=username]",
    "input[autocomplete=email]",
    "input[autocomplete=tel]",
    "input[name*=user i]",
    "input[name*=login i]",
    "input[id*=user i]",
    "input[id*=email i]",
    "input[type=email]",
  ];
  for (const sel of selectors) {
    const el = Array.from(document.querySelectorAll(sel)).find(visible);
    if (el) return el;
  }
  // Último recurso: o primeiro campo de texto antes do campo de senha.
  const pw = passwordInput();
  const all = Array.from(document.querySelectorAll("input")).filter(visible);
  const idx = all.indexOf(pw);
  if (idx > 0) {
    for (let i = idx - 1; i >= 0; i--) {
      const t = (all[i].type || "text").toLowerCase();
      if (t === "text" || t === "email" || t === "tel") return all[i];
    }
  }
  return null;
}

// Seta o valor de um jeito que frameworks (React etc.) enxerguem: escreve pelo
// setter nativo e dispara input/change.
function setValue(el, value) {
  const proto =
    el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

function doFill(username, password) {
  if ((!username && !password) || !passwordInput()) return false;
  if (username) {
    const un = usernameInput();
    if (un) setValue(un, username);
  }
  const pw = passwordInput();
  if (!pw) return false;
  setValue(pw, password);
  try {
    pw.focus();
  } catch {
    /* sem problema */
  }
  return true;
}
