// Preferências não-sensíveis de UI (localStorage). Nada de segredo aqui — só
// coisas como "a última pasta que você usou", pra não caçar o arquivo toda vez.

const LAST_DIR_KEY = "localkeys.lastDir";
const LAST_VAULT_KEY = "localkeys.lastVault";

/** Caminho do último cofre aberto — pra oferecer desbloqueio rápido. */
export function getLastVault(): string | null {
  try {
    return localStorage.getItem(LAST_VAULT_KEY);
  } catch {
    return null;
  }
}

export function setLastVault(path: string) {
  try {
    localStorage.setItem(LAST_VAULT_KEY, path);
  } catch {
    /* sem problema */
  }
}

export function getLastDir(): string | null {
  try {
    return localStorage.getItem(LAST_DIR_KEY);
  } catch {
    return null;
  }
}

export function setLastDir(dir: string) {
  try {
    localStorage.setItem(LAST_DIR_KEY, dir);
  } catch {
    /* localStorage pode estar indisponível — sem problema */
  }
}

/** Diretório de um caminho de arquivo (lida com `/` e `\`). */
export function dirOf(filePath: string): string {
  const idx = Math.max(filePath.lastIndexOf("/"), filePath.lastIndexOf("\\"));
  return idx >= 0 ? filePath.slice(0, idx) : "";
}

/** Guarda a pasta de um arquivo recém-escolhido. */
export function rememberDir(filePath: string) {
  const d = dirOf(filePath);
  if (d) setLastDir(d);
}

/** Junta pasta + nome de arquivo preservando o separador da plataforma. */
export function joinDir(dir: string, file: string): string {
  const sep = dir.includes("\\") ? "\\" : "/";
  return dir.endsWith(sep) ? dir + file : dir + sep + file;
}
