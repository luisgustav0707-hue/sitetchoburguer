# Tcho Burguer Impressão — app de bandeja

Imprime os cupons sozinho assim que o pedido chega, **sem ninguém clicar e sem
depender de nenhum navegador aberto**. É o comportamento do iFood com aceite
automático.

A especificação completa da arquitetura está em
[`../docs/app-impressao-automatica.md`](../docs/app-impressao-automatica.md).

## Como funciona

```
pedido novo em pedidos/{id}
   └─ Cloud Function enfileirarImpressao   (functions/index.js)
        monta o HTML do cupom               (functions/cupons-srv.js)
        grava em impressoes/{pedidoId}
             └─ este app (engine.js escuta a fila)
                  └─ main.js imprime        (webContents.print, silent)
                       └─ marca status:'impresso' e pedidos/{id}.impresso
```

O app **nunca monta o cupom**. Ele recebe HTML pronto e manda pra impressora —
é o que garante que o cupom do app e o do navegador nunca divirjam.

A chave que liga tudo é `config/operacao.impressaoModo`:

| valor | quem imprime |
|---|---|
| `'navegador'` (padrão) | a aba do admin, como sempre foi |
| `'app'` | este app; a aba para de imprimir pra não sair cupom em dobro |

## Desenvolvimento

```bash
npm install
npm start          # roda o app direto, sem instalar
npm run icones     # regenera os ícones a partir de ../logo/logo.png
```

Se o `npm install` avisar que bloqueou scripts de instalação, o binário do
Electron não foi baixado. Libere com `npm approve-scripts electron` e rode
`node node_modules/electron/install.js`.

## Build e publicação

```bash
npm run release    # gera o .exe e copia pra ../download/ com nome fixo
```

O instalador sai como `Tcho-Impressao-Setup-<versão>.exe` em `dist/` e é
publicado como `download/Tcho-Impressao.exe` — **nome fixo de propósito**, pra o
link do painel não quebrar a cada versão. Quem informa a versão é o
`download/app-impressao.json`, que o painel lê pra montar o botão. O `.exe`
(~90 MB) não vai pro git.

Suba a versão em `package.json` antes de cada release.

### Se o build falhar em "Cannot create symbolic link"

O `electron-builder` baixa o pacote `winCodeSign`, que tem symlinks de macOS
dentro, e o Windows só cria symlink com o Modo de Desenvolvedor ligado. Extraia
na mão, sem a pasta `darwin`:

```bash
CACHE="$LOCALAPPDATA/electron-builder/Cache/winCodeSign"
./node_modules/7zip-bin/win/x64/7za.exe x -y "$CACHE/<o .7z baixado>" "-o$CACHE/winCodeSign-2.6.0" "-xr!darwin"
```

### SmartScreen

O instalador não é assinado, então o Windows mostra "editor desconhecido" e o
Defender às vezes manda pra quarentena. **Não é falso-positivo de vírus, é falta
de reputação.** A solução real é assinar o executável (Azure Trusted Signing é
hoje o caminho mais barato; desde 2023 a chave precisa ficar em hardware/HSM,
não basta mais um `.pfx`). Até lá, o painel traz o passo a passo do que clicar.

## Quando algo dá errado no PC da loja

O app nasceu com diagnóstico porque, quando falha na casa do cliente, não sobra
rastro nenhum:

- **Log**: `%APPDATA%\Tcho Burguer Impressão\log.txt` — também pelo menu da
  bandeja em *Ver log de erros*.
- **Configuração local** (impressora de cada via): `config.json`, na mesma pasta.
- **"Testar conexão"** na janela de pareamento bate no endpoint com o `https`
  cru do Node, sem passar pelo Firebase: se responder qualquer coisa, a máquina
  alcança o servidor; se não, é firewall ou antivírus local.
- **Ping/pong** entre o processo principal e o motor separa "o app está quebrado
  por dentro" de "a internet não deixa falar com o servidor" — os dois davam
  exatamente a mesma tela de timeout.

## Onde isto diverge da especificação

A spec (`../docs/app-impressao-automatica.md`) descreve o pareamento com
`createCustomToken`, que é como o PedidoEasy faz. No `tcho-burguer-app` isso não
funciona: assinar um custom token exige a permissão `iam.serviceAccounts.signBlob`
na conta de serviço das functions de 2ª geração, e concedê-la é um passo manual
no IAM que não pegou nem depois de aplicado.

Aqui a `pareiarImpressora` gera **e-mail e senha aleatórios por computador** e o
app entra com `signInWithEmailAndPassword`. O resto é idêntico: um usuário do
Auth por PC, claim `perfil:'impressora'`, revogação individual com `deleteUser`.
O e-mail usa um domínio inexistente (`@impressora.tchoburguer.invalid`) — é
identidade de máquina, ninguém recebe nada — e a senha trafega uma única vez na
resposta HTTPS; o app não a guarda, quem mantém a sessão é o IndexedDB.

## Cuidados ao mexer

Cada um destes já custou horas. Os comentários no código explicam o porquê —
não desfaça achando que é código estranho:

1. O Firebase vem dos `<script>` UMD em `engine.html`, **nunca** de `require()`.
2. A altura do cupom é `document.body.getBoundingClientRect().height`, **nunca**
   `documentElement.scrollHeight`.
3. Os ícones da bandeja são `.ico` e ficam em `icones/` com `asarUnpack`.
4. `partition: 'persist:tcho-impressao'` é o que faz a sessão sobreviver ao
   reinício do PC.
5. Entre uma via e outra, 1200ms — senão a fila do driver embaralha.
