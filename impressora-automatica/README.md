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

## O motor de impressão

O app **não** usa `webContents.print` do Electron. Foi a primeira tentativa e
não funciona com todo driver térmico: na Goldsky 80mm (driver POS-80) sai folha
em branco, porque o driver só expõe papéis fixos (80x210, 80x297, 80x3276, todos
com 71,9mm de área útil) e recusa o formulário de tamanho livre que o Chromium
monta pra cortar o cupom na altura exata.

O que funciona — e é o que o `servidor-impressao/server.js` sempre fez — é
gravar o HTML num arquivo e abrir no **Chrome (ou Edge) com `--kiosk-printing`**.
Três detalhes que não são óbvios:

1. `--kiosk-printing` **não imprime sozinho**: ele só faz o `window.print()` da
   página sair sem diálogo. Como o HTML da fila vem sem script (a Cloud Function
   remove de propósito), é o app que injeta `window.print()` + `window.close()`.
   Sem o `close()`, o Chrome acumula uma janela por pedido.
2. `--user-data-dir` com perfil próprio é obrigatório: se o dono estiver com o
   Chrome aberto, o comando vira só mais uma aba na janela dele e o
   `--kiosk-printing` é ignorado — o diálogo de impressão volta a aparecer.
3. `--window-position=-32000,-32000` mantém a janela fora da tela, pra não
   piscar nada no balcão a cada pedido.

Duas consequências, ambas aceitas de propósito:

- **Sai sempre na impressora padrão do Windows.** Não há como escolher a
  impressora pela linha de comando, então o menu da bandeja só liga/desliga cada
  via e mostra qual é a padrão.
- **O corte é o do driver**, não mais calculado pela altura do conteúdo. Medir a
  altura só faz sentido com driver que aceita página de tamanho livre.

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
2. O `box-sizing:border-box` no CSS do cupom: sem ele o padding soma por fora e
   `width:80mm; padding:3mm` vira 86mm numa página de 80mm — sai em duas folhas
   em branco.
3. Os ícones da bandeja são `.ico` e ficam em `icones/` com `asarUnpack`.
4. `partition: 'persist:tcho-impressao'` é o que faz a sessão sobreviver ao
   reinício do PC.
5. Entre uma via e outra, 2s — senão a fila do driver embaralha.
6. O `window.print()` injetado e o `--user-data-dir`: ver a seção do motor de
   impressão acima antes de simplificar qualquer um dos dois.
