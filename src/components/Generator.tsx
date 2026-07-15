import { useEffect, useState } from "react";
import { api, type PasswordOptions, type PassphraseOptions } from "../api";

type Mode = "password" | "passphrase";

export function Generator({ onUse }: { onUse?: (value: string) => void }) {
  const [mode, setMode] = useState<Mode>("password");
  const [value, setValue] = useState("");
  const [pw, setPw] = useState<PasswordOptions>({
    length: 20,
    lowercase: true,
    uppercase: true,
    digits: true,
    symbols: true,
  });
  const [pp, setPp] = useState<PassphraseOptions>({
    words: 5,
    separator: "-",
    capitalize: false,
    includeNumber: true,
  });

  async function regen() {
    try {
      const v =
        mode === "password"
          ? await api.generatePassword(pw)
          : await api.generatePassphrase(pp);
      setValue(v);
    } catch (e) {
      setValue(String(e));
    }
  }

  useEffect(() => {
    regen();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, pw, pp]);

  return (
    <div className="generator">
      <div className="gen-tabs">
        <button
          className={mode === "password" ? "active" : ""}
          onClick={() => setMode("password")}
        >
          Senha
        </button>
        <button
          className={mode === "passphrase" ? "active" : ""}
          onClick={() => setMode("passphrase")}
        >
          Frase-senha
        </button>
      </div>

      <div className="gen-output">
        <code>{value}</code>
        <div className="gen-actions">
          <button title="Gerar outra" onClick={regen}>
            ↻
          </button>
          {onUse && (
            <button className="primary" onClick={() => onUse(value)}>
              Usar
            </button>
          )}
        </div>
      </div>

      {mode === "password" ? (
        <div className="gen-opts">
          <label className="range">
            Comprimento: {pw.length}
            <input
              type="range"
              min={8}
              max={64}
              value={pw.length}
              onChange={(e) => setPw({ ...pw, length: Number(e.target.value) })}
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked={pw.uppercase}
              onChange={(e) => setPw({ ...pw, uppercase: e.target.checked })}
            />
            A-Z
          </label>
          <label>
            <input
              type="checkbox"
              checked={pw.lowercase}
              onChange={(e) => setPw({ ...pw, lowercase: e.target.checked })}
            />
            a-z
          </label>
          <label>
            <input
              type="checkbox"
              checked={pw.digits}
              onChange={(e) => setPw({ ...pw, digits: e.target.checked })}
            />
            0-9
          </label>
          <label>
            <input
              type="checkbox"
              checked={pw.symbols}
              onChange={(e) => setPw({ ...pw, symbols: e.target.checked })}
            />
            !@#
          </label>
        </div>
      ) : (
        <div className="gen-opts">
          <label className="range">
            Palavras: {pp.words}
            <input
              type="range"
              min={3}
              max={10}
              value={pp.words}
              onChange={(e) => setPp({ ...pp, words: Number(e.target.value) })}
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked={pp.capitalize}
              onChange={(e) => setPp({ ...pp, capitalize: e.target.checked })}
            />
            Maiúsculas
          </label>
          <label>
            <input
              type="checkbox"
              checked={pp.includeNumber}
              onChange={(e) => setPp({ ...pp, includeNumber: e.target.checked })}
            />
            Número
          </label>
        </div>
      )}
    </div>
  );
}
