// LocalKeys — TOTP local (RFC 6238), espelho do totp.rs do app: SHA-1, 6
// dígitos, passo 30 s. Usa WebCrypto (HMAC-SHA1) — nada sai da página.
//
// API: `LKTotp.code(secretB32)` -> Promise<{ code, period, secondsRemaining }>

"use strict";

const LKTotp = (() => {
  const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const PERIOD = 30;
  const DIGITS = 6;

  // RFC 4648 base32 (decodifica ignorando espaços, hífens e "=" de padding).
  function b32decode(s) {
    const clean = s.trim().replace(/[\s\-=]/g, "").toUpperCase();
    if (!clean) throw new Error("chave TOTP vazia");
    let bits = "";
    for (const ch of clean) {
      const v = B32.indexOf(ch);
      if (v < 0) throw new Error("chave TOTP inválida (não é base32)");
      bits += v.toString(2).padStart(5, "0");
    }
    const bytes = new Uint8Array(Math.floor(bits.length / 8));
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(bits.substr(i * 8, 8), 2);
    }
    return bytes;
  }

  async function hmacSha1(key, msg) {
    const k = await crypto.subtle.importKey(
      "raw", key, { name: "HMAC", hash: "SHA-1" }, false, ["sign"]
    );
    return new Uint8Array(await crypto.subtle.sign("HMAC", k, msg));
  }

  async function code(secretB32, nowSec = Math.floor(Date.now() / 1000)) {
    const key = b32decode(secretB32);
    const counter = Math.floor(nowSec / PERIOD);
    const msg = new Uint8Array(8);
    new DataView(msg.buffer).setUint32(4, counter >>> 0);
    const h = await hmacSha1(key, msg);
    const off = h[h.length - 1] & 0x0f;
    const bin =
      ((h[off] & 0x7f) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];
    return {
      code: String(bin % 10 ** DIGITS).padStart(DIGITS, "0"),
      period: PERIOD,
      secondsRemaining: PERIOD - (nowSec % PERIOD),
    };
  }

  return { code };
})();
