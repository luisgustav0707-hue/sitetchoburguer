// ═══════════════════════════════════════════════════════════════
// TCHO BURGUER — ATENDENTE AUTOMÁTICO DE WHATSAPP
// ───────────────────────────────────────────────────────────────
// Liga o WhatsApp (whatsapp-web.js, login por QR Code uma vez) ao atendente
// (atendente.js). Roda no PC da loja, ao lado do app de impressão.
// Firebase por pareamento com o painel (conexao.js) — sem arquivo de chave.
// Instalação e uso: README.md desta pasta.
// ═══════════════════════════════════════════════════════════════

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '.env'), quiet: true });

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const QRCode = require('qrcode');
const CD = require('./cardapio');
const ia = require('./ia');
const { criarAtendente } = require('./atendente');
const { iniciarAvisos } = require('./avisos');
const conexao = require('./conexao');

const hora = () => new Date().toLocaleTimeString('pt-BR', { timeZone: CD.TZ });
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

let painel = null;   // conexão com o Firebase (pareamento)
const status = (c) => (painel ? painel.status(c) : Promise.resolve());

// Navegador que o WhatsApp Web usa: o Chrome ou o Edge já instalados no
// Windows (o Edge vem em todo Windows 10/11). CHROME_PATH no .env força um.
// Mesma busca do servidor-impressao/server.js.
function caminhoNavegador() {
  const pf = process.env.PROGRAMFILES || 'C:\\Program Files';
  const pf86 = process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)';
  const local = process.env.LOCALAPPDATA || '';
  const candidatos = [
    process.env.CHROME_PATH,
    `${pf}\\Google\\Chrome\\Application\\chrome.exe`,
    `${pf86}\\Google\\Chrome\\Application\\chrome.exe`,
    local && `${local}\\Google\\Chrome\\Application\\chrome.exe`,
    `${pf86}\\Microsoft\\Edge\\Application\\msedge.exe`,
    `${pf}\\Microsoft\\Edge\\Application\\msedge.exe`,
  ];
  return candidatos.find((p) => { try { return p && fs.existsSync(p); } catch (e) { return false; } }) || undefined;
}
const navegador = caminhoNavegador();

const client = new Client({
  authStrategy: new LocalAuth({ clientId: 'tcho', dataPath: path.join(__dirname, '.wwebjs_auth') }),
  webVersionCache: { type: 'local', path: path.join(__dirname, '.wwebjs_cache') },
  puppeteer: { headless: true, executablePath: navegador, args: ['--no-sandbox', '--disable-setuid-sandbox'] },
});

// Mensagens que o PRÓPRIO bot está mandando — pra não confundir com resposta
// manual da loja (que pausa o bot naquela conversa).
// O texto também entra sem o chat ("*|texto"): o aviso de status vai para
// número@c.us, mas o WhatsApp pode devolver a mesma conversa como @lid.
const doBot = new Map();   // "chatId|texto" → expira em
const chaveBot = (chatId, texto) => `${chatId}|${String(texto).trim()}`;
const marcarDoBot = (chatId, texto) => {
  const exp = Date.now() + 120000;
  doBot.set(chaveBot(chatId, texto), exp);
  doBot.set(chaveBot('*', texto), exp);
};

async function enviar(chatId, texto) {
  try {
    const chat = await client.getChatById(chatId);
    await chat.sendSeen().catch(() => {});
    await chat.sendStateTyping().catch(() => {});
    // "digitando..." proporcional ao tamanho (parece gente e evita rajada)
    await espera(Math.min(1200 + texto.length * 20, 4500) + Math.random() * 700);
    marcarDoBot(chatId, texto);
    await client.sendMessage(chatId, texto);
    await chat.clearState().catch(() => {});
  } catch (e) {
    console.error(`[whatsapp] erro ao enviar: ${e.message}`);
  }
}

// Aviso de status (avisos.js): o cliente pode nunca ter conversado com a
// loja, então não depende do chat existir nem simula "digitando".
async function enviarAviso(chatId, texto) {
  try {
    marcarDoBot(chatId, texto);
    await client.sendMessage(chatId, texto);
  } catch (e) {
    console.error(`[whatsapp] erro ao enviar aviso: ${e.message}`);
  }
}
let whatsappPronto = false;
let avisos = null;   // criado no main()
setInterval(() => { const t = Date.now(); for (const [k, exp] of doBot) if (exp < t) doBot.delete(k); }, 60000).unref();

let atendente = null;   // criado no main(), depois de conectar ao painel

function ignorarChat(id) {
  return !id || id === 'status@broadcast' || id.endsWith('@g.us') || id.endsWith('@broadcast') || id.endsWith('@newsletter')
    || !(id.endsWith('@c.us') || id.endsWith('@lid'));
}

// Telefone do cliente (contas novas vêm como @lid, sem o número no id).
async function numeroDe(msg) {
  const from = msg.from;
  if (from.endsWith('@c.us')) return from.split('@')[0];
  try {
    const [r] = await client.getContactLidAndPhone([from]);
    if (r && r.pn) return String(r.pn).split('@')[0];
  } catch (e) { /* versão do WhatsApp sem suporte */ }
  try { const ct = await msg.getContact(); if (ct && ct.number) return ct.number; } catch (e) {}
  return '';
}

let prontoEm = Date.now();
const TIPOS_AUDIO = new Set(['ptt', 'audio']);
const TIPOS_OUTROS = new Set(['image', 'video', 'sticker', 'document', 'location', 'vcard', 'multi_vcard']);
const MAX_AUDIO_B64 = 15 * 1024 * 1024;

client.on('message', async (msg) => {
  try {
    if (!atendente || msg.fromMe || msg.isStatus || ignorarChat(msg.from)) return;
    // Mensagens antigas que chegam ao reconectar: não responde.
    const em = (msg.timestamp || 0) * 1000;
    if (em < prontoEm - 5000 || Date.now() - em > 120000) return;

    let m;
    if (msg.type === 'chat') {
      if (!String(msg.body || '').trim()) return;
      m = { tipo: 'texto', texto: msg.body };
    } else if (TIPOS_AUDIO.has(msg.type)) {
      let audio = null;
      try {
        const media = await msg.downloadMedia();
        if (media && media.data && media.data.length <= MAX_AUDIO_B64) audio = media.data;
      } catch (e) { console.warn('[whatsapp] não baixou o áudio:', e.message); }
      m = { tipo: 'audio', audio };
    } else if (msg.type === 'image' && String(msg.body || '').trim()) {
      m = { tipo: 'texto', texto: msg.body };   // foto com legenda: lê a legenda
    } else if (TIPOS_OUTROS.has(msg.type)) {
      m = { tipo: 'outro' };
    } else return;                               // notificações, chamadas, apagadas etc.

    await CD.aguardarPronto();
    m.chatId = msg.from;
    m.numero = await numeroDe(msg);
    m.nomeWhatsApp = (msg._data && msg._data.notifyName) || '';
    atendente.receber(m);
  } catch (e) {
    console.error('[whatsapp] erro na mensagem:', e);
  }
});

// Mensagem enviada por ESTE número: se não foi o bot, alguém da loja
// respondeu à mão → pausa o bot naquela conversa.
client.on('message_create', (msg) => {
  if (!atendente || !msg.fromMe || ignorarChat(msg.to)) return;
  const k = chaveBot(msg.to, msg.body), k2 = chaveBot('*', msg.body);
  if (doBot.has(k) || doBot.has(k2)) { doBot.delete(k); doBot.delete(k2); return; }
  if ((msg.timestamp || 0) * 1000 < prontoEm - 5000) return;
  atendente.humanoRespondeu(msg.to);
});

// O QR aparece aqui na janela E no painel (Configurações → WhatsApp),
// pra escanear de qualquer lugar.
client.on('qr', async (qr) => {
  console.log(`\n${hora()} 📱 Escaneie o QR Code com o WhatsApp da loja (Aparelhos conectados → Conectar aparelho).`);
  console.log('   Ele também aparece no painel: Configurações → WhatsApp.\n');
  qrcode.generate(qr, { small: true });
  try {
    status({ estado: 'qr', qr: await QRCode.toDataURL(qr, { margin: 1, width: 280 }), erro: null });
  } catch (e) { console.warn('[painel] QR não enviado:', e.message); }
});
client.on('authenticated', () => {
  console.log(`${hora()} 🔐 WhatsApp autenticado (sessão salva em .wwebjs_auth)`);
  status({ estado: 'autenticado', qr: null });
});
client.on('auth_failure', (m) => {
  console.error(`${hora()} ❌ Falha no login do WhatsApp: ${m}\n   Apague a pasta .wwebjs_auth e escaneie o QR de novo.`);
  status({ estado: 'erro', qr: null, erro: `Falha no login do WhatsApp: ${m}` });
});
client.on('ready', () => {
  prontoEm = Date.now();
  whatsappPronto = true;
  if (avisos) avisos.aoConectar().catch((e) => console.error('[avisos]', e.message));
  console.log(`${hora()} ✅ Atendente no ar! Respondendo mensagens novas.`);
  const numero = (client.info && client.info.wid && client.info.wid.user) || '';
  status({ estado: 'conectado', qr: null, erro: null, numero });
});

// Reconexão automática
let reconectando = false;
async function conectar(tentativa = 1) {
  try {
    await client.initialize();
  } catch (e) {
    try { await client.destroy(); } catch (x) {}   // fecha o navegador, senão a próxima tentativa acha a sessão "em uso"
    status({ estado: 'erro', qr: null, erro: /Waiting failed/i.test(e.message)
      ? 'O WhatsApp Web não respondeu (pode ser mudança do WhatsApp que a biblioteca ainda não acompanhou)'
      : `Não conectou: ${e.message}` });
    if (/Waiting failed/i.test(e.message)) {
      console.error(`${hora()} ⚠️  O WhatsApp Web não respondeu a tempo. Se continuar, pode ser mudança do WhatsApp que a biblioteca ainda não suporta — o INICIAR.bat busca atualização a cada reinício.`);
    } else {
      console.error(`${hora()} ⚠️  Não conectou (${e.message}).`);
    }
    if (tentativa >= 3) {
      console.error(`${hora()} Reiniciando o atendente para buscar atualização...`);
      process.exit(1);                               // o INICIAR.bat reinicia (e roda o npm update)
    }
    const s = 10 * tentativa;
    console.error(`${hora()} Tentando de novo em ${s}s...`);
    await espera(s * 1000);
    return conectar(tentativa + 1);
  }
}
client.on('disconnected', async (motivo) => {
  console.warn(`${hora()} ⚠️  WhatsApp desconectado (${motivo}). Reconectando...`);
  whatsappPronto = false;
  status({ estado: 'desconectado', qr: null, erro: `Desconectado: ${motivo}` });
  if (reconectando) return;
  reconectando = true;
  try { await client.destroy(); } catch (e) {}
  await espera(5000);
  reconectando = false;
  conectar();
});

process.on('unhandledRejection', (e) => console.error('[erro não tratado]', e));
process.on('SIGINT', async () => { console.log('\nDesligando...'); try { await client.destroy(); } catch (e) {} process.exit(0); });

async function main() {
  console.log(`${hora()} 🍔 Tcho Burguer — atendente de WhatsApp v${conexao.VERSAO} (modelo ${ia.MODELO})`);
  try {
    painel = await conexao.conectar();
  } catch (e) {
    console.error(`${hora()} ⚠️  ${e.message}`);
    process.exit(1);                                 // o INICIAR.bat tenta de novo
  }
  const { db, FieldValue } = painel;
  console.log(`${hora()} 🔗 Conectado ao painel como "${painel.nome}"`);
  painel.aoChave((chave) => ia.definirChave(chave));
  painel.aoRemover(async () => { try { await client.destroy(); } catch (e) {} process.exit(3); });
  status({ estado: 'iniciando', qr: null, erro: null });

  CD.iniciar(db);
  atendente = criarAtendente({
    db, FieldValue, ia, enviar,
    // Pausou (pediu atendente / não entendeu 2x / erro): marca como não lida pra equipe ver.
    aoPausar: async (chatId) => { const chat = await client.getChatById(chatId); await chat.markUnread(); },
  });

  // Avisos de status do pedido (aceito / pronto / saiu para entrega).
  avisos = iniciarAvisos({
    db, FieldValue,
    pronto: () => whatsappPronto,
    enviar: enviarAviso,
    resolverChat: async (numero) => { const w = await client.getNumberId(numero); return w ? w._serialized : null; },
    log: (t) => console.log(`${hora()} ${t}`),
  });

  console.log(`${hora()} Navegador: ${navegador || 'Chromium do puppeteer'}`);
  console.log(`${hora()} Carregando cardápio e abrindo o WhatsApp...`);
  conectar();
}
main();
