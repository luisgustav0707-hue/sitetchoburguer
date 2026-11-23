// ═══════════════════════════════════════════════════════════════
// TCHO BURGUER — ATENDENTE AUTOMÁTICO DE WHATSAPP
// ───────────────────────────────────────────────────────────────
// Liga o WhatsApp (whatsapp-web.js, login por QR Code uma vez) ao atendente
// (atendente.js). Roda no PC da loja, ao lado do servidor-impressao/.
// Instalação e uso: README.md desta pasta.
// ═══════════════════════════════════════════════════════════════

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '.env'), quiet: true });

const SA = path.join(__dirname, 'serviceAccount.json');
if (!fs.existsSync(SA)) {
  console.error('\n❌ Falta o arquivo serviceAccount.json nesta pasta (veja o README.md).\n');
  process.exit(3);   // 3 = falta configuração (o INICIAR.bat não fica reiniciando)
}
if (!process.env.GEMINI_API_KEY) {
  console.error('\n❌ Falta a GEMINI_API_KEY no arquivo .env (copie o .env.example e preencha).\n');
  process.exit(3);   // 3 = falta configuração (o INICIAR.bat não fica reiniciando)
}

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
initializeApp({ credential: cert(JSON.parse(fs.readFileSync(SA, 'utf8'))) });
const db = getFirestore();

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const CD = require('./cardapio');
const ia = require('./ia');
const { criarAtendente } = require('./atendente');

const hora = () => new Date().toLocaleTimeString('pt-BR', { timeZone: CD.TZ });
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

CD.iniciar(db);

const client = new Client({
  authStrategy: new LocalAuth({ clientId: 'tcho', dataPath: path.join(__dirname, '.wwebjs_auth') }),
  webVersionCache: { type: 'local', path: path.join(__dirname, '.wwebjs_cache') },
  puppeteer: { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] },
});

// Mensagens que o PRÓPRIO bot está mandando — pra não confundir com resposta
// manual da loja (que pausa o bot naquela conversa).
const doBot = new Map();   // "chatId|texto" → expira em
const chaveBot = (chatId, texto) => `${chatId}|${String(texto).trim()}`;

async function enviar(chatId, texto) {
  try {
    const chat = await client.getChatById(chatId);
    await chat.sendSeen().catch(() => {});
    await chat.sendStateTyping().catch(() => {});
    // "digitando..." proporcional ao tamanho (parece gente e evita rajada)
    await espera(Math.min(1200 + texto.length * 20, 4500) + Math.random() * 700);
    doBot.set(chaveBot(chatId, texto), Date.now() + 120000);
    await client.sendMessage(chatId, texto);
    await chat.clearState().catch(() => {});
  } catch (e) {
    console.error(`[whatsapp] erro ao enviar: ${e.message}`);
  }
}
setInterval(() => { const t = Date.now(); for (const [k, exp] of doBot) if (exp < t) doBot.delete(k); }, 60000).unref();

const atendente = criarAtendente({
  db, FieldValue, ia, enviar,
  // Pausou (pediu atendente / não entendeu 2x / erro): marca como não lida pra equipe ver.
  aoPausar: async (chatId) => { const chat = await client.getChatById(chatId); await chat.markUnread(); },
});

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
    if (msg.fromMe || msg.isStatus || ignorarChat(msg.from)) return;
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
  if (!msg.fromMe || ignorarChat(msg.to)) return;
  const k = chaveBot(msg.to, msg.body);
  if (doBot.has(k)) { doBot.delete(k); return; }
  if ((msg.timestamp || 0) * 1000 < prontoEm - 5000) return;
  atendente.humanoRespondeu(msg.to);
});

client.on('qr', (qr) => {
  console.log(`\n${hora()} 📱 Escaneie o QR Code com o WhatsApp da loja (Aparelhos conectados → Conectar aparelho):\n`);
  qrcode.generate(qr, { small: true });
});
client.on('authenticated', () => console.log(`${hora()} 🔐 WhatsApp autenticado (sessão salva em .wwebjs_auth)`));
client.on('auth_failure', (m) => console.error(`${hora()} ❌ Falha no login do WhatsApp: ${m}\n   Apague a pasta .wwebjs_auth e escaneie o QR de novo.`));
client.on('ready', () => {
  prontoEm = Date.now();
  console.log(`${hora()} ✅ Atendente no ar! Respondendo mensagens novas.`);
});

// Reconexão automática
let reconectando = false;
async function conectar(tentativa = 1) {
  try {
    await client.initialize();
  } catch (e) {
    const s = Math.min(60, 5 * tentativa);
    console.error(`${hora()} ⚠️  Não conectou (${e.message}). Tentando de novo em ${s}s...`);
    await espera(s * 1000);
    return conectar(tentativa + 1);
  }
}
client.on('disconnected', async (motivo) => {
  console.warn(`${hora()} ⚠️  WhatsApp desconectado (${motivo}). Reconectando...`);
  if (reconectando) return;
  reconectando = true;
  try { await client.destroy(); } catch (e) {}
  await espera(5000);
  reconectando = false;
  conectar();
});

process.on('unhandledRejection', (e) => console.error('[erro não tratado]', e));
process.on('SIGINT', async () => { console.log('\nDesligando...'); try { await client.destroy(); } catch (e) {} process.exit(0); });

console.log(`${hora()} 🍔 Tcho Burguer — atendente de WhatsApp (modelo ${ia.MODELO})`);
console.log(`${hora()} Carregando cardápio e abrindo o WhatsApp...`);
conectar();
