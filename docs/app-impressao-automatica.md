# App de impressão automática — Tcho Burguer

Especificação de arquitetura (fornecida pelo dono do projeto, validada em um
white label de delivery já em produção: Firebase + painel admin em HTML/JS puro).

Objetivo: um **app de bandeja para Windows que imprime os cupons de pedido
sozinho**, assim que o pedido cai — sem ninguém clicar em nada, sem diálogo de
impressão do Windows e **sem depender do navegador estar aberto** na tela do
admin. Mesmo comportamento do iFood com aceite automático.

## Antes de escrever código

Levantamento obrigatório no projeto, porque a adaptação depende dele:

1. Como os pedidos chegam e onde ficam (Firestore? qual coleção? tem campo
   `status` e `impresso`?).
2. Onde hoje se gera o HTML do cupom (procurar por `cupomCozinha`,
   `cupomEntrega`, `window.open` + `print()`, ou um `fetch` para
   `http://localhost:3333/imprimir`). Esse HTML é o insumo do app — **não
   reescrever o layout do cupom**, reaproveitar exatamente o que já sai hoje.
3. O projeto tem **Cloud Functions** habilitadas (plano Blaze)? Isso decide qual
   das duas rotas abaixo usar.
4. Como o admin autentica hoje (Firebase Auth com e-mail/senha? login fixo?) e
   como estão as regras do Firestore.

Depois de responder isso, **apresentar o plano** (qual rota, quais arquivos)
antes de sair implementando.

## Arquitetura

Três peças:

```
  [pedido novo]  ->  [fila de impressão no Firestore]  ->  [app de bandeja imprime]
                        coleção impressoes/{id}            Electron, webContents.print
```

O app **nunca decide o layout do cupom**. Ele só lê HTML pronto da fila e manda
para a impressora. Isso é importante: se o app montasse o cupom por conta
própria, qualquer mudança no layout do painel teria que ser replicada em dois
lugares e os cupons iam divergir.

### Peça 1 — a fila no Firestore

Uma coleção `impressoes`. Cada documento é **um trabalho de impressão**:

```js
{
  pedidoId: "abc123",           // pra marcar o pedido como impresso depois; null em avulsos
  cozinha:  "<html>…</html>",   // uma chave por FINALIDADE (via)
  entrega:  "<html>…</html>",
  caixa:    "<html>…</html>",   // ex.: conta da mesa — opcional
  status:   "pendente",
  criadoEm: serverTimestamp(),
}
```

As chaves `cozinha` / `entrega` / `caixa` são **finalidades**, não impressoras.
É o que permite o pedido sair na térmica da cozinha e a conta sair na do caixa.
Só incluir a chave da via que deve sair; o app ignora as ausentes.

### Peça 2 — quem enfileira

**Rota A (tem Cloud Functions):** um trigger `onDocumentCreated` na coleção de
pedidos. Ele monta o HTML dos cupons no servidor e grava na fila. Vantagem: o
cupom sai mesmo com todos os navegadores fechados — quando o app liga, a fila
está lá esperando.

```js
exports.enfileirarImpressao = onDocumentCreated(
  { region: REGION, document: 'pedidos/{pedidoId}' },   // ajuste o caminho
  async (event) => {
    const p = event.data && event.data.data();
    if (!p || p.status !== 'novo') return;
    // respeite as flags de config que já existirem (auto-imprimir ligado etc.)
    await db.collection('impressoes').doc(event.params.pedidoId).set({
      pedidoId: event.params.pedidoId,
      cozinha: cupomCozinhaSrv(p, css),
      entrega: cupomEntregaSrv(p, css),
      status: 'pendente',
      criadoEm: FieldValue.serverTimestamp(),
    });
  });
```

Aqui é preciso **portar as funções de cupom do front para o server** (elas
provavelmente usam `document`/`window` — a versão do servidor é string pura).
Deixar um comentário em CIMA das duas cópias dizendo "mexeu aqui? replique lá",
senão elas divergem em três meses.

**Rota B (não tem Cloud Functions):** o próprio painel admin grava na fila
quando cria/recebe o pedido, com uma função tipo:

```js
function enfileirarImpressaoApp(vias, pedidoId){
  return col('impressoes').add({ ...vias, pedidoId: pedidoId||null,
    status:'pendente', criadoEm: firebase.firestore.FieldValue.serverTimestamp() });
}
```

Funciona e é bem mais simples, mas exige o painel aberto em algum lugar na hora
do pedido. Se o Tcho não tiver Blaze, começar por aqui — a peça 3 é idêntica nas
duas rotas.

Usar essa mesma função também para **impressões avulsas** (reimprimir um pedido,
imprimir a conta da mesa): é só enfileirar `{caixa: html}`.

### Peça 3 — o app de bandeja (Electron)

Pasta nova `impressora-automatica/`, fora do build do site. Estrutura:

```
impressora-automatica/
  main.js            processo principal: bandeja, impressão, ponte IPC
  engine.html        janela OCULTA que hospeda o Firebase
  engine.js          auth + listener da fila
  pareamento.html    janelinha de parear (única janela visível)
  pareamento.js
  firebase-config.js mesmas credenciais públicas do site
  icones/            icon-conectado.{ico,png}, icon-desconectado.{ico,png}
  package.json       electron + electron-builder (target nsis)
```

**Por que duas janelas:** o Electron não roda Firebase direto no processo
principal de forma confiável. A `engine.html` é uma `BrowserWindow` com
`show:false` que existe só para manter a sessão do Firebase viva. O usuário
nunca a vê.

#### Armadilhas que custam horas se ignoradas

1. **Carregar o Firebase pelos bundles UMD de NAVEGADOR, não por `require()`.**
   Dentro do `engine.html`:
   ```html
   <script src="node_modules/firebase/firebase-app-compat.js"></script>
   <script src="node_modules/firebase/firebase-auth-compat.js"></script>
   <script src="node_modules/firebase/firebase-firestore-compat.js"></script>
   <script src="node_modules/firebase/firebase-functions-compat.js"></script>
   ```
   Com `require('firebase/...')` o Electron resolve a build de **Node**, que não
   traz as classes de persistência do Auth, e aparece
   `INTERNAL ASSERTION FAILED: Expected a class definition`. Carregar do pacote
   local (não de CDN) para o app não depender de internet só para iniciar.

2. **O corte da térmica depende do tamanho da PÁGINA, não do papel.** A
   impressora corta no fim da página. Sem dizer qual é a página, o Chromium usa
   o padrão do driver (um comprimento fixo) e o corte sai no meio do texto, ou
   depois de 20cm de papel em branco. A solução é **medir a altura real do
   conteúdo** e mandar imprimir numa página exatamente daquele tamanho:

   ```js
   const MICRONS_POR_PX = 25400 / 96;   // 1px CSS = 1/96", 1" = 25400µm
   const alturaPx = await win.webContents.executeJavaScript(
     'Math.ceil(document.body.getBoundingClientRect().height)');
   opts.pageSize = {
     width:  Math.round(larguraMm * 1000),
     height: Math.max(20000, Math.round(alturaPx * MICRONS_POR_PX)),
   };
   ```

3. **Medir `document.body.getBoundingClientRect().height` — NUNCA
   `documentElement.scrollHeight`.** Quando o conteúdo é menor que a janela,
   `scrollHeight` devolve a altura da JANELA. Com uma janela oculta de 1200px, a
   impressora cospe dezenas de centímetros em branco antes de cortar.

4. **A janela oculta precisa ter a largura do papel.** A altura do conteúdo
   depende de onde o texto quebra, e isso depende da largura:
   `width: Math.round(larguraMm / 25.4 * 96) + 20`.

5. **CSS do cupom:** `@page { margin:0; size: 80mm auto }` e o body com
   `width: 80mm; padding: 3mm`. Com margem no `@page` o conteúdo transborda para
   uma segunda página que sai em branco. Deixar também um **avanço no fim**
   (`padding-bottom: calc(3mm + 15mm)`) — sem sobra, a última linha fica presa
   dentro da impressora, antes da serrilha.

6. **Impressão silenciosa:**
   ```js
   win.webContents.print({ silent:true, printBackground:true,
     margins:{marginType:'none'}, deviceName, pageSize }, cb)
   ```
   `silent:true` é o que elimina o diálogo. `deviceName` vem da configuração da
   bandeja; se vazio, cai na padrão do Windows.

7. **Esperar entre uma via e outra.** Mandar duas impressões seguidas embaralha
   a fila do driver: `await new Promise(r => setTimeout(r, 1200))` entre elas.

8. **Ícone da bandeja: usar `.ico`, não `.png`.** O `.ico` com 16/20/24/32/48px
   dentro é o que garante nitidez em qualquer escala de tela; com PNG único o
   Windows às vezes mostra um quadrado branco. E pôr os ícones no `asarUnpack`
   do `package.json` — de dentro do `.asar` o Windows não consegue montar o
   HICON e a bandeja fica vazia:
   ```js
   const base = path.join(__dirname, 'icones', nome)
     .replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep);
   ```

9. **Sessão persistente:** `webPreferences: { partition: 'persist:tcho-impressao' }`
   na janela do motor. Assim o IndexedDB do Firebase sobrevive a reinícios do PC
   sozinho e não é preciso guardar token nenhum na mão.

10. **`app.requestSingleInstanceLock()`.** Sem isso, o usuário clica no atalho de
    novo, uma segunda instância morre calada e ele acha que o app não abre.
    Tratar o evento `second-instance` trazendo a janela de pareamento para a
    frente.

11. **`app.on('window-all-closed', e => e.preventDefault())`** — é app de
    bandeja, nunca fecha sozinho.

12. **Ligar o início automático na primeira execução**, sem perguntar:
    `app.setLoginItemSettings({ openAtLogin: true })`. É o sentido do app —
    ninguém deveria lembrar de abrir isso todo dia. Deixar um checkbox na
    bandeja para desligar.

#### O listener da fila (engine.js)

```js
db.collection('impressoes').where('status','==','pendente')
  .onSnapshot(snap => {
    snap.docChanges().forEach(ch => {
      if (ch.type !== 'added') return;
      const d = ch.doc.data();
      const vias = ['cozinha','entrega','caixa']
        .filter(t => d[t]).map(t => ({ tipo:t, html:d[t] }));
      if (!vias.length) return;
      ipcRenderer.send('imprimir', { id: ch.doc.id, pedidoId: d.pedidoId||null, vias });
    });
  });
```

Quando o principal termina de imprimir, ele avisa o motor, que marca
`status:'impresso'` na fila **e** `impresso:true` no pedido (para o Kanban do
navegador, se estiver aberto, não achar que falta imprimir).

#### Menu da bandeja

- Linha de status: `✅ Conectado — <loja>` ou `⭕ Não pareado` (desabilitada).
- **Impressoras** → um submenu por finalidade (🍳 Cozinha, 🛵 Entrega, 💵 Caixa),
  cada um com radio: *Padrão do Windows* / *Não imprimir esta via* / a lista de
  `webContents.getPrintersAsync()`. Salvar num `config.json` em
  `app.getPath('userData')`.
- **Iniciar com o Windows** (checkbox).
- **Parear…** / **Desparear este computador**.
- **Sair**.

Trocar o ícone da bandeja conforme conectado/desconectado — é o único feedback
que o dono da loja tem de que está tudo certo.

### Pareamento e segurança

Como o Tcho é single-tenant, há duas opções. **Perguntar qual o dono quer**
depois de ver como o login do admin funciona hoje:

**(a) Simples** — o app pede o mesmo e-mail/senha do painel e faz
`signInWithEmailAndPassword`. Menos código, mas a senha do dono fica na máquina
do caixa e não dá para revogar um PC específico.

**(b) Por código de pareamento** (usado no outro sistema, recomendado):

1. `gerarCodigoImpressora` — o dono, logado no painel, gera um código de 6
   dígitos válido por 10 min, gravado em `codigosImpressora/{codigo}`.
2. `pareiarImpressora` — o app manda o código **sem estar autenticado**. A
   function valida numa transação (existe? não usado? não expirou? marca como
   usado), cria um **Auth user dedicado àquele PC** com os custom claims de
   acesso, registra em `impressoras/{uid}` com o nome do computador, e devolve
   um `createCustomToken`. O app faz `signInWithCustomToken`.
3. `revogarImpressora` — o dono remove um PC pela lista no painel; a function dá
   `deleteUser(uid)` e apaga o doc. O acesso daquele PC cai na hora, sem afetar
   os outros.

Assim a senha do dono nunca sai do navegador dele, e cada máquina é revogável
individualmente. A rota (b) exige Cloud Functions.

No painel, fazer a tela **Configurações → App de impressão** com: botão "Parear
um computador" (mostra o código em fonte grande com contador regressivo), a
lista de PCs pareados com botão Remover, e o switch que liga o modo app.

### O switch de modo — cuidado para não sair cupom em dobro

Guardar em config algo como `impressaoModo: 'app' | 'navegador'`. Quando estiver
em `'app'`, **a aba do admin tem que parar de imprimir sozinha**, senão saem
duas vias do mesmo cupom (uma pelo app, outra pela aba). Procurar no código do
painel todo lugar que dispara impressão automática e colocar essa condição.

## Build e distribuição

`electron-builder` com target **NSIS**, `oneClick: true`, `perMachine: false`
(instala no perfil do usuário, não pede admin), `artifactName` com a versão.
Um script `release` que gera o `.exe` e copia para uma pasta `download/` com
**nome fixo** (`Tcho-Impressao.exe`) mais um `.json` de manifesto (versão,
tamanho, data) que o painel lê para montar o botão de download. Nome fixo
importa para o link do painel nunca quebrar a cada versão. O `.exe` (~87 MB)
**não vai para o git**.

Duas coisas que vão aparecer:

- **Build falha em "Cannot create symbolic link"**: o `electron-builder` baixa o
  pacote `winCodeSign`, que tem symlinks de macOS dentro, e o Windows só cria
  symlink com Modo de Desenvolvedor ligado. Destravar extraindo na mão sem a
  pasta `darwin`:
  ```
  CACHE="$LOCALAPPDATA/electron-builder/Cache/winCodeSign"
  ./node_modules/7zip-bin/win/x64/7za.exe x -y "$CACHE/<o .7z baixado>" "-o$CACHE/winCodeSign-2.6.0" "-xr!darwin"
  ```
- **SmartScreen / "editor desconhecido"**: o instalador não é assinado, então o
  Windows trata como suspeito e o Defender às vezes manda para quarentena. Não é
  falso-positivo de vírus, é falta de reputação. A solução real é assinar (Azure
  Trusted Signing é hoje o caminho mais barato; desde 2023 a chave tem que ficar
  em hardware/HSM, não é mais só um `.pfx`). Enquanto isso, deixar no painel um
  passo a passo do que clicar em cada tela.

## Diagnóstico — desde o começo

No PC do cliente, quando algo falha, não sobra rastro nenhum: a janela some e
ninguém sabe o que houve. Já nascer com:

- **Log em arquivo** em `app.getPath('userData')/log.txt`, com timestamp, e um
  botão "Ver log de erros" que abre a pasta.
- **Ping/pong entre o principal e o motor.** Antes de mandar parear, o principal
  dá um `ping` e espera o `pong` (4s). Isso separa "o app está quebrado por
  dentro" de "a internet não deixa falar com o servidor" — os dois davam
  exatamente a mesma tela de timeout. Registrar o handler do `ping` na
  **primeira linha** do `engine.js`, antes de qualquer coisa que possa falhar,
  senão um erro no carregamento do Firebase deixa o motor mudo e a mensagem de
  erro fica sendo "servidor não respondeu".
- **Botão "Testar conexão"** que bate no endpoint com o `https` cru do Node (sem
  passar pelo SDK do Firebase nem pela janela). Se responder qualquer coisa, a
  máquina alcança o servidor; se não, é firewall/antivírus local.
- **Timeouts em tudo.** O SDK do Firebase fica pendurado indefinidamente quando
  o antivírus engole a conexão: 20s no pareamento dentro do motor, 25s na janela
  como rede de segurança. Sem isso a janela trava em "Pareando…" para sempre,
  sem erro e sem poder tentar de novo.
- Capturar `window.onerror` no motor e `render-process-gone` / `did-fail-load` /
  `console-message` no principal — erro dentro da janela oculta só aparece por
  aí.

## Entregas esperadas

Em etapas, mostrando o resultado de cada uma:

1. O levantamento do projeto + qual rota recomendada (com o porquê).
2. O app rodando em `npm start` com pareamento funcionando e imprimindo um cupom
   de teste.
3. A tela do painel (parear / listar / revogar / switch de modo).
4. O instalador gerado e o fluxo de publicação.

Comentar o código em português e **explicar o porquê, não o quê** —
especialmente nos pontos das armadilhas acima, porque sem o comentário o próximo
a mexer desfaz a correção achando que é código estranho.
