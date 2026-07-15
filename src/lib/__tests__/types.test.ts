import { describe, expect, it } from "vitest";
import { emptyItem, KIND_LABEL } from "../../types";

describe("emptyItem", () => {
  it("cria um login com os subcampos e sem os outros tipos", () => {
    const it0 = emptyItem("login");
    expect(it0.kind).toBe("login");
    expect(it0.login).toEqual({ username: "", password: "", uris: [""], totp: "" });
    expect(it0.card).toBeUndefined();
    expect(it0.identity).toBeUndefined();
    expect(it0.deletedAt).toBeNull();
    expect(it0.id).toMatch(/[0-9a-f-]{36}/);
  });

  it("cria cartão e identidade com os respectivos subobjetos", () => {
    expect(emptyItem("card").card).toBeDefined();
    expect(emptyItem("identity").identity).toBeDefined();
    expect(emptyItem("note").login).toBeUndefined();
  });

  it("tem rótulo em pt-BR para todos os tipos", () => {
    expect(Object.keys(KIND_LABEL)).toEqual(["login", "note", "card", "identity"]);
  });
});
