<div align="center">

# 🔐 LocalKeys

**Gerenciador de senhas 100% local e offline.**
Sem nuvem, sem conta, sem telemetria. Seus segredos ficam num único arquivo
cifrado (`.tkeys`) no seu computador — e só você tem a chave.

</div>

---

## Por quê

Faz parte da suíte **Local**: aplicativos de desktop que fazem o trabalho de
ferramentas de nuvem, mas rodando inteiros na sua máquina. O LocalKeys é o cofre
de senhas dela.

- **Nada sai do seu computador.** Zero rede — nem para checar atualização (quem
  atualiza é o [TaylorHub](https://github.com/Anon5T4R/TaylorHub)).
- **Criptografia séria, sem improviso.** XChaCha20-Poly1305 para cifrar + Argon2id
  para derivar a chave da sua master password, usando só crates auditados do
  RustCrypto. A chave nunca sai do back-end. Detalhes e modelo de ameaça em
  [`SECURITY.md`](SECURITY.md).
- **Você no controle.** O arquivo `.tkeys` é seu — coloque na pasta do
  Syncthing/OneDrive que preferir; o formato de blob único torna conflitos
  detectáveis.

## Funciona assim

1. **Crie um cofre** com uma master password forte (o app mede a força).
2. Guarde **logins, notas seguras, cartões e identidades**; organize com favoritos.
3. **Gere** senhas fortes ou frases-senha (diceware, wordlist EFF).
4. **Copie** usuário/senha — a área de transferência se limpa em 30 s.
5. O cofre **tranca sozinho** por inatividade e ao ocultar a janela.

> **Não há recuperação.** Esqueceu a master password → o cofre é irrecuperável.
> É intencional: uma porta dos fundos para você seria uma para um atacante.
> **Faça backup do seu `.tkeys`.**

## Instalação

Baixe a última versão em **[Releases](https://github.com/Anon5T4R/LocalKeys/releases)**
(ou pelo TaylorHub):

- **Windows:** instalador `*-setup.exe`
- **Linux:** `*.AppImage` (dê permissão de execução e rode)

## Desenvolvimento

```bash
npm install
npm run tauri dev      # app em desenvolvimento (porta 1456)
npm test               # testes do front (vitest)
cd src-tauri && cargo test   # testes da cripto e do gerador
```

Requisitos: Node 22+, Rust estável, e as dependências de sistema do Tauri v2.

## Roadmap

- **v0.1:** cofre + CRUD dos 4 tipos, busca, favoritos, lixeira, gerador, força,
  auto-lock.
- **v0.2:** **TOTP** com contagem regressiva; **importadores** (Bitwarden JSON,
  Chrome/Edge, LastPass, 1Password CSV, KeePass `.kdbx`); **export** JSON/CSV.
- **v0.3 (atual):** **histórico de senhas** por login; **campos personalizados**
  (texto/oculto); **anexos** pequenos cifrados no cofre (máx. 1 MB); **relatório**
  local de senhas fracas/repetidas; **gravação atômica** (rename).
- **v0.4+:** import do JSON cifrado do Bitwarden, auto-type, desbloqueio por
  Windows Hello (keyring), limpeza de clipboard movida pro Rust.

## Licença

[GPL-3.0-or-later](LICENSE). Reaproveita ideias e (na v0.2) importadores do
[`bitwarden/clients`](https://github.com/bitwarden/clients) (GPL-3).
