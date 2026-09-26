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

// ── Impressão nativa (sem Chrome externo, sem diálogo) ──────────────
// A térmica corta no FIM DA PÁGINA. Sem dizer qual é a página, o Chromium usa
// o tamanho padrão do driver — normalmente um comprimento fixo — e o corte sai
// no lugar errado: no meio do texto quando o cupom é maior que a página, ou
// depois de um palmo de papel em branco quando é menor. Por isso medimos a
// altura real do conteúdo e imprimimos numa página exatamente desse tamanho.
const MICRONS_POR_PX = 25400 / 96;          // 1px CSS = 1/96 pol; 1 pol = 25400µm
const MICRONS_POR_MM = 1000;

function larguraPapelDoHtml(html) {
  const m = /@page\{[^}]*size:\s*(\d+(?:\.\d+)?)mm/i.exec(html || '');
  const mm = m ? Number(m[1]) : 80;
  return (mm >= 40 && mm <= 120) ? mm : 80;
}

async function imprimirHTML(html, deviceName) {
  const larguraMm = larguraPapelDoHtml(html);
  const win = new BrowserWindow({
    show: false,
    // A janela precisa ter a largura do papel: a altura do conteúdo depende de
    // onde o texto quebra, e isso depende da largura.
    width: Math.round(larguraMm / 25.4 * 96) + 20,
    height: 1200,
  });
  try {
    // NÃO deixe essa rejeição derrubar a impressão. O cupom de entrega puxa
    // duas imagens remotas (a logo e o QR da rota): basta a internet da loja
    // oscilar pra o Chromium devolver ERR_FAILED e o cupom inteiro não sair —
    // muito pior do que sair sem o QR. O texto já renderizou; seguimos.
    await win.loadURL('data:text/html;charset=UTF-8,' + encodeURIComponent(html))
      .catch((e) => log('cupom carregou com falha (imagem remota?), imprimindo assim mesmo:', (e && e.message) || e));
    let alturaPx = 0;
    try {
      // ATENÇÃO: NÃO troque por documentElement.scrollHeight. Quando o conteúdo
      // é menor que a janela, scrollHeight devolve a altura da JANELA — com a
      // janela oculta de 1200px, a impressora cuspia dezenas de centímetros em
      // branco antes de cortar. O que vale é a caixa do body.
      alturaPx = await win.webContents.executeJavaScript(
        'Math.ceil(document.body.getBoundingClientRect().height)');
    } catch (e) { log('não consegui medir a altura do cupom:', e && e.message); }

    const opts = { silent: true, printBackground: true, margins: { marginType: 'none' } };
    if (deviceName) opts.deviceName = deviceName;
    if (alturaPx > 0) {
      opts.pageSize = {
        width: Math.round(larguraMm * MICRONS_POR_MM),
        height: Math.max(20000, Math.round(alturaPx * MICRONS_POR_PX)),
      };
      log(`imprimindo ${larguraMm}mm x ${(alturaPx * MICRONS_POR_PX / 1000).toFixed(0)}mm`
        + (deviceName ? ` em "${deviceName}"` : ' na impressora padrão'));
    }

    return await new Promise((resolve) => {
      win.webContents.print(opts, (ok, motivo) => {
        if (!ok) log('falha ao imprimir:', motivo);
        resolve(ok);
      });
    });
  } finally {
    setTimeout(() => { if (!win.isDestroyed()) win.destroy(); }, 800);
  }
}

// Cada via sai na impressora escolhida pra sua finalidade. Sem escolha, cai na
// padrão do Windows — que é o comportamento de quem só tem uma impressora.
const NAO_IMPRIMIR = '__nenhuma__';
function impressoraDe(tipo) {
  const cfg = lerConfigLocal();
  const mapa = cfg.impressoras || {};
  const escolha = mapa[tipo];
  if (escolha === NAO_IMPRIMIR) return NAO_IMPRIMIR;
  return escolha || undefined;
}

ipcMain.on('imprimir', async (event, { id, pedidoId, vias }) => {
  try {
    let n = 0;
    for (const via of vias) {
      const alvo = impressoraDe(via.tipo);
      if (alvo === NAO_IMPRIMIR) continue;          // via desligada pelo dono
      // Mandar duas impressões coladas embaralha a fila do driver e as vias
      // saem trocadas ou grudadas — 1,2s entre elas resolve.
      if (n++ > 0) await new Promise((r) => setTimeout(r, 1200));
      await imprimirHTML(via.html, alvo);
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
  const menuDaFinalidade = (tipo) => {
    if (!impressoras.length) return [{ label: 'Nenhuma impressora encontrada', enabled: false }];
    const bruto = mapa[tipo];
    const escolhida = bruto === NAO_IMPRIMIR ? NAO_IMPRIMIR : (bruto || '');
    return [
      {
        label: 'Padrão do Windows',
        type: 'radio',
        checked: !escolhida,
        click: () => salvarConfigLocal({ impressoras: { ...mapa, [tipo]: '' } }),
      },
      {
        label: 'Não imprimir esta via',
        type: 'radio',
        checked: escolhida === NAO_IMPRIMIR,
        click: () => salvarConfigLocal({ impressoras: { ...mapa, [tipo]: NAO_IMPRIMIR } }),
      },
      { type: 'separator' },
      ...impressoras.map((p) => ({
        label: p.name + (p.isDefault ? ' (padrão)' : ''),
        type: 'radio',
        checked: escolhida === p.name,
        click: () => salvarConfigLocal({ impressoras: { ...mapa, [tipo]: p.name } }),
      })),
    ];
  };
  const resumo = (tipo) => {
    const n = mapa[tipo];
    if (n === NAO_IMPRIMIR) return ' — desligada';
    return n ? ` — ${n}` : ' — padrão';
  };

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
