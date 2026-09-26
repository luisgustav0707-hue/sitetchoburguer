// ── PROCESSO PRINCIPAL ─────────────────────────────────────────────
// Fica na bandeja, sem nenhuma janela visível na maior parte do tempo.
// Toda a lógica de Firebase (auth + fila de impressão) vive em engine.js,
// numa janela oculta; aqui cuidamos de: bandeja, janela de pareamento e a
// impressão de fato — nativa do Chromium (webContents.print), sem precisar
// do Chrome instalado à parte e sem diálogo de impressão.
const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const { spawn } = require('child_process');

// Segunda instância: em vez de morrer calada (o usuário clica no atalho e "não
// acontece nada", e conclui que o app não abre), a instância que já está
// rodando traz a janela de pareamento pra frente.
const instanciaUnica = app.requestSingleInstanceLock();
if (!instanciaUnica) {
  app.quit();
  return;
}

const PROJETO = require('./firebase-config.js').projectId;
const REGIAO_FUNCS = 'southamerica-east1';

const CONFIG_PATH = path.join(app.getPath('userData'), 'config.json');
// Log em arquivo: sem isso, quando algo falha no PC da loja não sobra rastro
// nenhum — a janela some e ninguém sabe o que aconteceu.
const LOG_PATH = path.join(app.getPath('userData'), 'log.txt');
function log(...partes) {
  const linha = `[${new Date().toISOString()}] ${partes.join(' ')}\n`;
  try { fs.appendFileSync(LOG_PATH, linha); } catch (e) { /* disco cheio / sem permissão */ }
  console.log(linha.trim());
}
function lerConfigLocal() {
  try { return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); } catch (e) { return {}; }
}
function salvarConfigLocal(patch) {
  const atual = lerConfigLocal();
  fs.writeFileSync(CONFIG_PATH, JSON.stringify({ ...atual, ...patch }, null, 2));
}

let engineWin = null;
let engineProntoP = null;      // resolve quando o motor termina de carregar
let pairWin = null;
let tray = null;
let conectado = false;
let lojaNomeAtual = '';
let jaOfereceuPareamento = false;

// Bandeja do Windows: o .ico (com 16/20/24/32/48px dentro) é o que garante o
// ícone nítido em qualquer escala de tela — com PNG único o Windows às vezes
// mostra um quadrado branco. O PNG fica de reserva.
function icone(nome) {
  // Os ícones ficam FORA do asar (asarUnpack no package.json): de dentro do
  // pacote o Windows não consegue montar o HICON e a bandeja fica vazia.
  const base = path.join(__dirname, 'icones', nome.replace(/\.png$/, ''))
    .replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep);
  const ico = base + '.ico';
  if (process.platform === 'win32' && fs.existsSync(ico)) {
    const img = nativeImage.createFromPath(ico);
    if (!img.isEmpty()) return img;
    log('ico vazio, caindo pro png:', ico);
  }
  return nativeImage.createFromPath(base + '.png');
}

function criarEngine() {
  engineWin = new BrowserWindow({
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      // Sessão nomeada e persistente: o IndexedDB do Firebase sobrevive a
      // reinícios do app e do PC sozinho — não precisamos guardar token nenhum
      // na mão, nem pedir o código de pareamento de novo todo dia.
      partition: 'persist:tcho-impressao',
    },
  });
  // Quem pareia é o motor. Se ele ainda estiver carregando, o pedido de
  // pareamento cai no vazio e a janela fica eternamente em "Pareando…".
  engineProntoP = new Promise((resolve) => {
    engineWin.webContents.once('did-finish-load', () => resolve());
  });
  engineWin.webContents.on('render-process-gone', (e, d) => {
    log('motor caiu:', (d && d.reason) || '?');
    if (pairWin) pairWin.webContents.send('pareamento-resultado', {
      ok: false, erro: 'O app travou ao tentar parear. Feche pela bandeja (Sair) e abra de novo.' });
  });
  // Erro dentro do engine.js (módulo que não carregou, exceção solta) só
  // aparece por aqui — a janela é invisível, não há console pra ninguém ver.
  engineWin.webContents.on('console-message', (e, nivel, msg) => {
    if (nivel >= 2) log('motor[console]:', msg);
  });
  engineWin.webContents.on('did-fail-load', (e, cod, desc) => {
    log('motor nao carregou:', cod, desc);
  });
  engineWin.loadFile('engine.html');
}

function abrirPareamento() {
  if (pairWin) { pairWin.focus(); return; }
  pairWin = new BrowserWindow({
    width: 380, height: 430, resizable: false, minimizable: false, maximizable: false,
    title: 'Tcho Burguer — Parear impressão',
    webPreferences: { nodeIntegration: true, contextIsolation: false },
  });
  pairWin.setMenuBarVisibility(false);
  pairWin.loadFile('pareamento.html');
  pairWin.on('closed', () => { pairWin = null; });
}

// ── Impressão (Chrome/Edge em modo kiosk) ───────────────────────────
// POR QUE NÃO webContents.print: é o caminho óbvio e foi o primeiro que tentei,
// mas não funciona com todo driver térmico. Na Goldsky 80mm daqui (driver
// POS-80) ele imprime folha em branco — o driver só expõe papéis fixos
// (80x210, 80x297, 80x3276, todos com 71,9mm de área útil) e não aceita o
// formulário de tamanho livre que o Chromium monta pra cortar o cupom na
// altura exata do conteúdo.
//
// O que funciona é o que o servidor-impressao/server.js já fazia desde sempre:
// gravar o HTML num arquivo e abrir no Chrome (ou Edge) com --kiosk-printing,
// que imprime sem diálogo. O corte passa a ser o do driver, igual ao cupom que
// sempre saiu pelo navegador.
//
// Consequência aceita: o kiosk imprime SEMPRE na impressora padrão do Windows
// — não há como escolher a impressora pela linha de comando. Por isso o menu
// da bandeja só oferece "padrão" ou "não imprimir esta via".
function navegadorParaImpressao() {
  const candidatos = [
    process.env['PROGRAMFILES'] + '\Google\Chrome\Application\chrome.exe',
    process.env['PROGRAMFILES(X86)'] + '\Google\Chrome\Application\chrome.exe',
    (process.env['LOCALAPPDATA'] || '') + '\Google\Chrome\Application\chrome.exe',
    // O Edge já vem no Windows 10/11 — é a garantia de que sempre há um.
    process.env['PROGRAMFILES(X86)'] + '\Microsoft\Edge\Application\msedge.exe',
    process.env['PROGRAMFILES'] + '\Microsoft\Edge\Application\msedge.exe',
  ];
  for (const c of candidatos) {
    try { if (c && fs.existsSync(c)) return c; } catch (e) { /* caminho inválido */ }
  }
  return null;
}

// O HTML da fila vem limpo, sem script (a Cloud Function o remove de propósito).
// Quem dispara a impressão é o motor, e no kiosk quem dispara é a própria
// página: --kiosk-printing só faz window.print() sair sem diálogo, ele não
// imprime sozinho. O window.close() no fim é o que impede o Chrome de ir
// acumulando janela a cada pedido.
function htmlParaKiosk(html) {
  const gatilho = '<script>window.onload=function(){window.print();'
    + 'setTimeout(function(){window.close()},1500)}<' + '/script>';
  return /<\/body>/i.test(html) ? html.replace(/<\/body>/i, gatilho + '</body>') : html + gatilho;
}

function imprimirHTML(html, tipo) {
  const navegador = navegadorParaImpressao();
  if (!navegador) {
    log('nenhum Chrome ou Edge encontrado — impossível imprimir');
    return Promise.resolve(false);
  }
  const arquivo = path.join(app.getPath('temp'), `tcho-${tipo}-${Date.now()}.html`);
  fs.writeFileSync(arquivo, htmlParaKiosk(html), 'utf8');

  // EXATAMENTE as flags do servidor-impressao/server.js, que imprimiu por meses
  // na operação. Eu já tentei "melhorar" isto duas vezes e as duas custaram caro:
  //
  //  • --user-data-dir (perfil separado): resolveria o caso de o dono estar com
  //    o Chrome aberto — aí o comando vira só mais uma aba e o kiosk é ignorado.
  //    Mas perfil novo abre tela de boas-vindas/escolha de buscador, e aí a
  //    página nem chega a chamar window.print(). Trocar um problema raro por um
  //    que acontece sempre é péssimo negócio.
  //  • --window-position fora da tela: cosmético, e janela totalmente oculta
  //    pode ser tratada como ocluída e não pintar.
  //
  // Se algum dia o "Chrome já aberto" incomodar de verdade, a saída é detectar
  // e avisar o dono — não inventar flag sem ter como testar impressão.
  const args = [
    '--kiosk-printing', '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', arquivo,
  ];
  log(`imprimindo via ${path.basename(navegador)} (${tipo}, ${html.length} bytes)`);
  const proc = spawn(navegador, args, { detached: true, stdio: 'ignore' });
  proc.on('error', (e) => log('falha ao chamar o navegador:', e && e.message));
  proc.unref();

  // O arquivo temporário só pode sumir depois que o Chrome terminou de ler e
  // imprimir; 20s é folga suficiente até pra impressora lenta.
  setTimeout(() => fs.unlink(arquivo, () => {}), 20000);
  return Promise.resolve(true);
}

ipcMain.on('imprimir', async (event, { id, pedidoId, vias }) => {
  try {
    let n = 0;
    for (const via of vias) {
      if (impressoraDe(via.tipo) === NAO_IMPRIMIR) continue;   // via desligada pelo dono
      // Mandar duas impressões coladas embaralha a fila do driver e as vias
      // saem trocadas ou grudadas — 2s entre elas resolve (é também o tempo
      // que o servidor-impressao antigo usava entre cozinha e entrega).
      if (n++ > 0) await new Promise((r) => setTimeout(r, 2000));
      await imprimirHTML(via.html, via.tipo);
    }
  } catch (e) {
    log('erro ao imprimir', id, (e && e.message) || e);
  } finally {
    // Mesmo com erro, fecha o trabalho: senão o mesmo cupom volta na próxima
    // conexão e a loja recebe uma pilha de vias repetidas.
    if (engineWin) engineWin.webContents.send('impresso', { id, pedidoId });
  }
});

// ── Ponte entre a janela de pareamento e o motor ─────────────────────
// O motor responde? É o que distingue "o app está quebrado por dentro" de "a
// internet não deixa falar com o servidor" — os dois davam exatamente a mesma
// tela de timeout, e a gente perdia horas procurando no lugar errado.
let pongResolve = null;
ipcMain.on('pong', () => { if (pongResolve) { pongResolve(true); pongResolve = null; } });
function motorResponde(ms = 4000) {
  if (!engineWin) return Promise.resolve(false);
  return new Promise((resolve) => {
    pongResolve = resolve;
    engineWin.webContents.send('ping');
    setTimeout(() => { if (pongResolve) { pongResolve = null; resolve(false); } }, ms);
  });
}

ipcMain.on('pedido-pareamento', async (event, dados) => {
  try {
    if (!engineWin) throw new Error('motor não iniciou');
    await engineProntoP;                      // espera o motor carregar
    if (!(await motorResponde())) {
      log('motor nao respondeu ao ping');
      throw new Error('motor mudo');
    }
    log('enviando pareamento ao motor');
    engineWin.webContents.send('parear', dados);
  } catch (e) {
    log('falha na ponte de pareamento:', e && e.message);
    if (pairWin) pairWin.webContents.send('pareamento-resultado', {
      ok: false, erro: 'O app não conseguiu iniciar por dentro. Feche pela bandeja (Sair) e abra de novo.' });
  }
});

// Teste de conexão feito aqui no principal, com o https cru do Node: não passa
// pelo SDK do Firebase nem pela janela oculta, então separa "este PC não
// alcança o servidor" de "o app está com defeito".
ipcMain.on('testar-conexao', () => {
  const url = `https://${REGIAO_FUNCS}-${PROJETO}.cloudfunctions.net/pareiarImpressora`;
  const req = https.request(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, timeout: 12000 }, (res) => {
    let corpo = '';
    res.on('data', (c) => { corpo += c; });
    res.on('end', () => {
      // Sem código no corpo, a function responde "Informe o código" — o que já
      // prova que a máquina chegou até lá.
      const ok = res.statusCode > 0 && /Informe o código|invalid-argument/i.test(corpo);
      log('teste de conexao:', res.statusCode, corpo.slice(0, 120));
      if (pairWin) pairWin.webContents.send('resultado-conexao', {
        ok,
        detalhe: ok ? `Servidor respondeu (HTTP ${res.statusCode}).`
                    : `Resposta inesperada (HTTP ${res.statusCode}).`,
      });
    });
  });
  req.on('timeout', () => { req.destroy(new Error('tempo esgotado')); });
  req.on('error', (e) => {
    log('teste de conexao falhou:', e && e.message);
    if (pairWin) pairWin.webContents.send('resultado-conexao', {
      ok: false, detalhe: `Não chegou no servidor: ${e && e.message}` });
  });
  req.end(JSON.stringify({ data: {} }));
});

ipcMain.on('abrir-log', () => { shell.showItemInFolder(LOG_PATH); });

ipcMain.on('motor-pronto', () => log('motor pronto (Firebase carregado)'));

// Erro vindo de dentro do motor (carga do Firebase, exceção solta, fila).
ipcMain.on('motor-erro', (event, msg) => {
  log('motor-erro:', msg);
  if (pairWin) pairWin.webContents.send('pareamento-resultado', {
    ok: false, erro: 'Erro interno do app: ' + String(msg).slice(0, 200) });
});
ipcMain.on('pareamento-ok', (event, { lojaNome }) => {
  if (pairWin) pairWin.webContents.send('pareamento-resultado', { ok: true, lojaNome });
  setTimeout(() => { if (pairWin) pairWin.close(); }, 1200);
});
ipcMain.on('pareamento-erro', (event, erro) => {
  if (pairWin) pairWin.webContents.send('pareamento-resultado', { ok: false, erro });
});

// ── Status (vindo do motor) → bandeja ────────────────────────────────
ipcMain.on('status', (event, { conectado: c, lojaNome, erro }) => {
  conectado = !!c;
  lojaNomeAtual = lojaNome || '';
  atualizarTray();
  // Só oferece parear uma vez por execução: reabrir a janela a cada oscilação
  // de conexão viraria um pop-up perseguindo o operador no meio do movimento.
  if (!conectado && !jaOfereceuPareamento) {
    jaOfereceuPareamento = true;
    abrirPareamento();
  }
  if (erro) log('status:', erro);
});

// ── Bandeja ───────────────────────────────────────────────────────────
async function listarImpressoras() {
  try { return (await engineWin.webContents.getPrintersAsync()) || []; } catch (e) { return []; }
}

async function atualizarTray() {
  if (!tray) return;
  tray.setImage(icone(conectado ? 'icon-conectado.png' : 'icon-desconectado.png'));
  const status = conectado ? `Conectado — ${lojaNomeAtual}` : 'Não pareado';
  tray.setToolTip(`Tcho Burguer Impressão — ${status}`);

  const cfg = lerConfigLocal();
  const mapa = cfg.impressoras || {};
  const impressoras = await listarImpressoras();

  // Um submenu por finalidade: dá pra mandar o pedido pra térmica da cozinha e
  // a conta da mesa pra impressora do caixa.
  // Só liga/desliga: o kiosk do Chrome imprime sempre na impressora padrão do
  // Windows e não aceita escolher pela linha de comando (ver o comentário em
  // imprimirHTML). A lista serve pra mostrar ao dono QUAL é a padrão — é o que
  // ele precisa saber pra trocar, e ele troca no Windows, não aqui.
  const padrao = (impressoras.find((p) => p.isDefault) || {}).name || 'nenhuma configurada';
  const menuDaFinalidade = (tipo) => {
    const desligada = mapa[tipo] === NAO_IMPRIMIR;
    return [
      { label: `Sai na padrão do Windows: ${padrao}`, enabled: false },
      { type: 'separator' },
      {
        label: 'Imprimir esta via',
        type: 'radio',
        checked: !desligada,
        click: () => salvarConfigLocal({ impressoras: { ...mapa, [tipo]: '' } }),
      },
      {
        label: 'Não imprimir esta via',
        type: 'radio',
        checked: desligada,
        click: () => salvarConfigLocal({ impressoras: { ...mapa, [tipo]: NAO_IMPRIMIR } }),
      },
    ];
  };
  const resumo = (tipo) => (mapa[tipo] === NAO_IMPRIMIR ? ' — desligada' : ' — ligada');

  tray.setContextMenu(Menu.buildFromTemplate([
    { label: (conectado ? '✅ ' : '⭕ ') + status, enabled: false },
    { type: 'separator' },
    {
      label: 'Impressoras',
      submenu: [
        { label: `🍳 Cozinha (pedido)${resumo('cozinha')}`, submenu: menuDaFinalidade('cozinha') },
        { label: `🛵 Entrega / cliente${resumo('entrega')}`, submenu: menuDaFinalidade('entrega') },
        { label: `💵 Caixa (conta da mesa)${resumo('caixa')}`, submenu: menuDaFinalidade('caixa') },
      ],
    },
    {
      label: 'Iniciar com o Windows',
      type: 'checkbox',
      checked: app.getLoginItemSettings().openAtLogin,
      click: (item) => app.setLoginItemSettings({ openAtLogin: item.checked }),
    },
    { label: 'Ver log de erros', click: () => shell.showItemInFolder(LOG_PATH) },
    { type: 'separator' },
    conectado
      ? { label: 'Desparear este computador', click: desparear }
      : { label: 'Parear...', click: abrirPareamento },
    { type: 'separator' },
    { label: 'Sair', click: () => { app.isQuitting = true; app.quit(); } },
  ]));
}

function desparear() {
  jaOfereceuPareamento = false;
  if (engineWin) engineWin.webContents.send('desparear');
}

function criarTray() {
  tray = new Tray(icone('icon-desconectado.png'));
  // Reconstrói o menu a cada clique: é assim que a lista de impressoras
  // aparece atualizada quando o dono instala uma térmica nova.
  tray.on('click', () => { atualizarTray(); tray.popUpContextMenu(); });
  atualizarTray();
}

app.on('second-instance', () => {
  if (pairWin) { pairWin.show(); pairWin.focus(); return; }
  if (!conectado) abrirPareamento();
});

app.whenReady().then(() => {
  // Primeira execução: já liga o início automático, sem perguntar. É o sentido
  // do app — ninguém deveria precisar lembrar de abrir isso todo dia. Quem quiser
  // desligar tem o checkbox na bandeja.
  if (!fs.existsSync(CONFIG_PATH)) {
    app.setLoginItemSettings({ openAtLogin: true });
    salvarConfigLocal({ primeiraExecucaoEm: new Date().toISOString() });
  }
  criarEngine();
  criarTray();
});

// App de bandeja: fechar a janela de pareamento não pode encerrar o app.
app.on('window-all-closed', (e) => { if (e && e.preventDefault) e.preventDefault(); });
app.on('before-quit', () => { app.isQuitting = true; });
