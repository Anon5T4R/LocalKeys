# Segurança do LocalKeys

O LocalKeys é um gerenciador de senhas **100% local**: seus segredos ficam num
único arquivo cifrado (`.tkeys`) no seu computador. Não há servidor, conta, nuvem,
sincronização própria, telemetria nem qualquer acesso à rede — nem para checar
atualização (quem atualiza é o TaylorHub).

Este documento é o **modelo de ameaça**: o que o app protege, o que ele **não**
protege, e como a criptografia funciona. Leia antes de confiar dados reais a ele.

## O que o LocalKeys protege

- **Seu arquivo `.tkeys` roubado (dados em repouso).** Se alguém copiar o arquivo
  — de um backup, de um pen drive, da sua pasta do Syncthing/OneDrive — não
  consegue ler nada sem a master password. O conteúdo é um blob cifrado com
  autenticação; sem a chave é indistinguível de ruído.
- **Adulteração do arquivo.** Qualquer bit trocado no arquivo (inclusive nos
  parâmetros do cabeçalho) é detectado na abertura: o vault se recusa a abrir em
  vez de devolver dados corrompidos ou forjados.

## O que o LocalKeys **NÃO** protege

- **Uma máquina comprometida.** Keylogger, malware, ou alguém com acesso ao seu
  usuário logado captura a master password quando você a digita, ou lê os segredos
  da memória **enquanto o vault está destrancado**. Nenhum gerenciador local
  resolve isso — mantenha o sistema limpo e atualizado.
- **Histórico de área de transferência.** Ao copiar uma senha, o app limpa a área
  de transferência após 30 s, mas o **histórico de clipboard do Windows**
  (`Win+V`), se ligado, guarda uma cópia. **Desligue-o** em
  *Configurações → Sistema → Área de transferência*.
- **Master password fraca ou esquecida.** A força do vault é a força da sua senha
  mestra. E **não há recuperação**: esqueceu, perdeu o vault. Isso é intencional —
  uma porta dos fundos para você seria uma porta dos fundos para um atacante.
- **Observação de tela / ombro.** Mostrar a senha em claro na tela é responsabilidade
  do ambiente.

## Como a criptografia funciona

Regra absoluta: **nenhuma primitiva criptográfica feita em casa.** Só compomos
crates auditados do [RustCrypto](https://github.com/RustCrypto), que trazem os
vetores de teste oficiais (IETF/RFC) nas próprias suítes.

- **Derivação da chave (KDF):** [Argon2id](https://en.wikipedia.org/wiki/Argon2)
  (crate `argon2`) transforma a master password + um salt aleatório de 128 bits
  numa chave de 256 bits. Parâmetros default: **64 MiB de memória, 3 iterações,
  1 lane** — bem acima do recomendado pelo OWASP para uso interativo, calibrados
  para ~250–500 ms. Os parâmetros ficam no cabeçalho **em claro**, então um vault
  antigo continua abrindo se mudarmos o default.
- **Cifra do vault:** [XChaCha20-Poly1305](https://en.wikipedia.org/wiki/ChaCha20-Poly1305)
  (crate `chacha20poly1305`), um AEAD com nonce de **192 bits** — largo o
  suficiente para gerar nonce aleatório a cada gravação sem risco prático de
  colisão. O **cabeçalho inteiro entra como dado autenticado (AAD)**, então trocar
  os parâmetros do KDF, o salt ou o nonce invalida a autenticação.
- **A chave nunca sai do back-end (Rust).** A master password é enviada uma única
  vez (criar/abrir), vira a chave de sessão que vive **só no processo Rust** e é
  apagada da memória (`zeroize`) ao trancar. O front-end (WebView) nunca vê a
  master password nem a chave — só o conteúdo já decifrado, para renderizar.
- **Salvar não repede a senha:** recifra com a chave de sessão e um **nonce novo**
  (nonce único por chave é o que o XChaCha20-Poly1305 exige) — sem re-rodar o
  Argon2 e sem guardar a senha em lugar nenhum.

### Formato do arquivo `.tkeys`

```
  "TKEYS\0" (6)  | version (1) | kdf_id (1)
  | m_cost (4) | t_cost (4) | p_cost (4)   ← parâmetros Argon2id (little-endian)
  | salt (16) | nonce (24)                  ─┘ tudo acima = cabeçalho em claro (AAD)
  | ciphertext + tag Poly1305 (n)           ← XChaCha20-Poly1305(JSON do vault)
```

## Higiene operacional

- **Auto-lock:** o vault tranca sozinho por inatividade (default 5 min) e ao
  minimizar/ocultar a janela. `Esc` tranca na hora.
- **Backup:** o app mantém um `.tkeys.bak` do último estado bom. Faça também
  backups seus — o formato de blob único torna conflitos de sync detectáveis.
- **Rede:** o app roda com uma Content-Security-Policy restritiva (`default-src
  'self'`) e não faz nenhuma requisição externa.

## Dependências

O `ci.yml` roda [`cargo audit`](https://github.com/rustsec/rustsec) a cada push,
falhando o build se alguma dependência tiver vulnerabilidade conhecida (RustSec).

## Reportar uma vulnerabilidade

Abra uma issue **sem detalhes sensíveis** pedindo um canal privado, ou descreva o
problema de forma responsável. Este é um projeto pessoal da suíte Local; correções
de segurança têm prioridade sobre qualquer feature.

## Limitações conhecidas (v0.2)

- A limpeza da área de transferência é feita pelo front-end (WebView); mover o
  timer para o Rust (crate `arboard`) é um endurecimento previsto para a v0.3.
- A gravação ainda não é atômica (escreve por cima, com `.bak` como rede de
  segurança); rename atômico previsto para a v0.3.
- **Export gera arquivo em claro** (sem cifra) — é o único jeito de migrar para
  outro app; a UI avisa em vermelho. Apague o arquivo depois de usar.
- O import de `.kdbx` lê os campos padrão (título, usuário, senha, URL, TOTP,
  notas); anexos e campos customizados do KeePass não são trazidos.
