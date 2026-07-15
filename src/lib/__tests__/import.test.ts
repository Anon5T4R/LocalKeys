import { describe, expect, it } from "vitest";
import {
  parseCsv,
  parseCsvItems,
  parseBitwardenJson,
  detectFormat,
} from "../../import";

describe("parseCsv", () => {
  it("lida com aspas, vírgulas e quebras dentro do campo", () => {
    const rows = parseCsv('a,b,c\n"x,y","li\nnha","ele disse ""oi"""');
    expect(rows).toEqual([
      ["a", "b", "c"],
      ["x,y", "li\nnha", 'ele disse "oi"'],
    ]);
  });
});

describe("parseCsvItems (Chrome/LastPass/genérico)", () => {
  it("mapeia colunas do Chrome", () => {
    const csv = "name,url,username,password\nGmail,https://gmail.com,joe,s3nha";
    const items = parseCsvItems(csv);
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe("Gmail");
    expect(items[0].login).toMatchObject({
      username: "joe",
      password: "s3nha",
      uris: ["https://gmail.com"],
    });
  });

  it("extrai o segredo TOTP de um otpauth do LastPass", () => {
    const csv =
      "url,username,password,totp,name\n" +
      "https://x.com,joe,pw,otpauth://totp/x?secret=JBSWY3DP&period=30,X";
    const items = parseCsvItems(csv);
    expect(items[0].login?.totp).toBe("JBSWY3DP");
  });
});

describe("parseCsvItems — robustez (ProtonPass/Firefox)", () => {
  it("ProtonPass: usuário vazio cai pro email, ruído (type) é ignorado", () => {
    const csv =
      "type,name,url,email,username,password,note,totp\n" +
      "login,Site,https://s.com,me@x.com,,segredo,minha nota,JBSWY3DP";
    const [it0] = parseCsvItems(csv);
    expect(it0.name).toBe("Site");
    expect(it0.login?.username).toBe("me@x.com");
    expect(it0.login?.password).toBe("segredo");
    expect(it0.login?.totp).toBe("JBSWY3DP");
    expect(it0.notes).toBe("minha nota");
    expect(it0.customFields ?? []).toHaveLength(0);
  });

  it("mantém email como campo quando há usuário separado", () => {
    const [it0] = parseCsvItems("name,username,email,password\nSite,joe,joe@x.com,pw");
    expect(it0.login?.username).toBe("joe");
    expect(it0.customFields?.find((f) => f.name === "email")?.value).toBe("joe@x.com");
  });

  it("detecta delimitador ponto-e-vírgula", () => {
    const [it0] = parseCsvItems("name;username;password\nSite;joe;pw");
    expect(it0.login?.username).toBe("joe");
    expect(it0.login?.password).toBe("pw");
  });

  it("coluna desconhecida vira campo personalizado (segredo fica oculto)", () => {
    const [it0] = parseCsvItems("name,username,password,pin\nSite,joe,pw,1234");
    const pin = it0.customFields?.find((f) => f.name.toLowerCase() === "pin");
    expect(pin?.value).toBe("1234");
    expect(pin?.hidden).toBe(true);
  });
});

describe("parseBitwardenJson", () => {
  it("mapeia login, cartão e identidade", () => {
    const json = JSON.stringify({
      items: [
        {
          type: 1,
          name: "Site",
          favorite: true,
          login: { username: "u", password: "p", uris: [{ uri: "https://s" }], totp: "ABC" },
        },
        { type: 3, name: "Visa", card: { number: "4111", code: "123", expMonth: "05", expYear: "30" } },
        { type: 4, name: "Eu", identity: { firstName: "Jo", lastName: "Fe", email: "j@x" } },
      ],
    });
    const items = parseBitwardenJson(json);
    expect(items).toHaveLength(3);
    expect(items[0].kind).toBe("login");
    expect(items[0].favorite).toBe(true);
    expect(items[1].card?.number).toBe("4111");
    expect(items[1].card?.exp).toBe("05/30");
    expect(items[2].identity?.email).toBe("j@x");
  });
});

describe("detectFormat", () => {
  it("reconhece por extensão e conteúdo", () => {
    expect(detectFormat("x.kdbx")).toBe("kdbx");
    expect(detectFormat("x.json")).toBe("bitwarden-json");
    expect(detectFormat("x.csv")).toBe("csv");
    expect(detectFormat("blob", '{"items":[]}')).toBe("bitwarden-json");
    expect(detectFormat("blob", "a,b,c")).toBe("csv");
  });
});
