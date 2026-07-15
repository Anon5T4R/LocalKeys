import { describe, expect, it } from "vitest";
import { findReused, loginsWithPassword } from "../../report";
import { emptyItem, type Item, type Vault } from "../../types";

function login(name: string, password: string, deleted = false): Item {
  const it = emptyItem("login");
  it.name = name;
  it.login = { username: name, password, uris: [""], totp: "" };
  if (deleted) it.deletedAt = Date.now();
  return it;
}

function vault(items: Item[]): Vault {
  return { version: 1, folders: [], items };
}

describe("findReused", () => {
  it("agrupa logins com a mesma senha e ignora senhas únicas/vazias/lixeira", () => {
    const v = vault([
      login("a", "repetida"),
      login("b", "repetida"),
      login("c", "unica"),
      login("d", ""), // vazia — ignora
      login("e", "repetida", true), // na lixeira — ignora
    ]);
    const groups = findReused(v);
    expect(groups).toHaveLength(1);
    expect(groups[0].password).toBe("repetida");
    expect(groups[0].items.map((i) => i.name).sort()).toEqual(["a", "b"]);
  });

  it("retorna vazio quando não há repetição", () => {
    expect(findReused(vault([login("a", "x"), login("b", "y")]))).toEqual([]);
  });
});

describe("loginsWithPassword", () => {
  it("traz só logins vivos com senha", () => {
    const v = vault([login("a", "x"), login("b", ""), login("c", "z", true)]);
    expect(loginsWithPassword(v).map((i) => i.name)).toEqual(["a"]);
  });
});
