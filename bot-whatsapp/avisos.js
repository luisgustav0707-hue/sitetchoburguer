// ═══════════════════════════════════════════════════════════════
// AVISOS DE STATUS DO PEDIDO (Kanban → WhatsApp do cliente)
// ───────────────────────────────────────────────────────────────
// Escuta os pedidos que mudaram de etapa nas últimas horas e manda uma
// mensagem ao cliente quando o pedido:
//   • aceito   → saiu de "Novos" para qualquer etapa de trabalho
//   • pronto   → chegou em "Prontos" (só retirada; delivery espera a entrega)
//   • entrega  → chegou em "Entrega" (saiu para entrega)
//   • finalizado → finalizado no Kanban (entregue / retirado). Pedido do
//     balcão lançado já finalizado (data passada) não avisa: só o Kanban
//     grava `horaFim`.
//   • cancelado → cancelado no painel (em qualquer etapa). Depois dele o bot
//     fica quieto 30 min na conversa e marca como não lida: quem explica o
//     motivo é a loja, não a IA.
// Liga/desliga e textos: painel → Configurações → WhatsApp → Avisos
// (config/operacao.avisosWhatsApp). Sem config, usa os padrões abaixo.
//
// Cada aviso sai NO MÁXIMO uma vez por pedido: antes de enviar, o bot marca
// pedidos/{id}.avisosWa.<evento> numa transação (as regras só deixam o bot
// mexer nesse campo). Se dois PCs estiverem pareados, só um ganha a marca.
// ═══════════════════════════════════════════════════════════════

const PADRAO = {
  aceito:  { on: true, texto: 'Oi, {nome}! 👋 Seu pedido {num} foi aceito e já está sendo preparado. 🍔' },
  pronto:  { on: true, texto: '{nome}, seu pedido {num} está pronto! Pode vir retirar. 😋' },
  entrega: { on: true, texto: '{nome}, seu pedido {num} saiu para entrega! 🛵 Já já chega aí.' },
  finalizado: { on: true, texto: 'Obrigado pela preferência, {nome}! 🧡 Seu pedido {num} foi finalizado. Bom apetite! 🍔' },
  cancelado: { on: true, texto: '{nome}, seu pedido {num} foi cancelado. 😕 Se tiver qualquer dúvida, é só responder aqui que a gente te explica.' },
};
const EVENTOS = Object.keys(PADRAO);

// Só avisa mudança recente: o painel grava `hora` a cada troca de etapa.
// Pedido que mudou enquanto o bot estava desligado há mais tempo que isso
// não recebe aviso atrasado.
const JANELA_MS = 30 * 60 * 1000;
// Pedidos que o bot acompanha (as regras do Firestore limitam a 12 h).
const ESCUTA_MS = 6 * 60 * 60 * 1000;

const ORIGENS_SEM_AVISO = new Set(['mesa', 'mesa-rodada']);
const SEM_AVISO = new Set(['novo']);

// Qual aviso corresponde à etapa atual do pedido (null = nenhum).
function eventoDo(p) {
  const s = p.status;
  if (s === 'cancelado') return 'cancelado';
  if (s === 'finalizado') return p.horaFim ? 'finalizado' : null;
  if (!s || SEM_AVISO.has(s)) return null;
  if (s === 'entrega') return p.tipo === 'delivery' ? 'entrega' : 'aceito';
  if (s === 'pronto' && p.tipo !== 'delivery') return 'pronto';
  return 'aceito';   // prep, pronto (delivery) ou etapa personalizada
}

function primeiroNome(nome) {
  const n = String(nome || '').trim().split(/\s+/)[0] || '';
  return n ? n.charAt(0).toUpperCase() + n.slice(1).toLowerCase() : '';
}

function montarTexto(modelo, p) {
  const nome = primeiroNome(p.nome);
  const total = Number(p.total) || 0;
  return String(modelo || '')
    .replace(/\{nome\}/g, nome)
    .replace(/\{num\}/g, p.num || '')
    .replace(/\{total\}/g, 'R$' + total.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
    // "{nome}" vazio não pode deixar "Oi, !" ou ", seu pedido"
    .replace(/^\s*,\s*/, '').replace(/,\s*!/g, '!').replace(/\s{2,}/g, ' ')
    .trim()
    .replace(/^./, (c) => c.toUpperCase());
}

// "(31) 99999-8888" → "5531999998888". Vazio se não parece telefone do Brasil.
function numeroWhatsApp(tel) {
  let d = String(tel || '').replace(/\D/g, '');
  if (d.startsWith('0')) d = d.replace(/^0+/, '');
  if (d.length === 10 || d.length === 11) d = '55' + d;
  return /^55\d{10,11}$/.test(d) ? d : '';
}

function lerConfig(op) {
  const cfg = (op && op.avisosWhatsApp) || {};
  const out = {};
  EVENTOS.forEach((e) => {
    const c = cfg[e] || {};
    out[e] = {
      on: c.on !== undefined ? c.on !== false : PADRAO[e].on,
      texto: String(c.texto || '').trim() || PADRAO[e].texto,
    };
  });
  return out;
}

// db/FieldValue: Firebase compat. resolverChat(numero) → chatId ou null.
// enviar(chatId, texto). pronto() → true quando o WhatsApp está conectado.
// aoCancelar(chatId, pedido): depois do aviso de cancelamento (pausa o bot).
function iniciarAvisos({ db, FieldValue, resolverChat, enviar, pronto, aoCancelar, log = console.log }) {
  let config = lerConfig(null);
  db.collection('config').doc('operacao').onSnapshot(
    (d) => { config = lerConfig(d.exists ? d.data() : null); },
    (e) => console.warn('[avisos] não leu a config:', e.message),
  );

  const fila = [];          // pedidos esperando o WhatsApp conectar
  const vistos = new Map(); // pedidoId|evento → já tratado nesta execução

  async function tratar(id, p) {
    const ev = eventoDo(p);
    if (!ev || ORIGENS_SEM_AVISO.has(p.origem)) return;
    const chave = `${id}|${ev}`;
    if (vistos.has(chave)) return;
    const ja = p.avisosWa || {};
    if (ja[ev]) { vistos.set(chave, Date.now()); return; }
    if (!config[ev].on) return;
    // Cancelar não regrava `hora`: o painel grava `canceladoEm` (painel antigo,
    // ainda aberto sem recarregar, não grava — aí vale a última etapa).
    const marcaTempo = ev === 'cancelado' && p.canceladoEm ? p.canceladoEm : p.hora;
    const quando = marcaTempo && marcaTempo.toMillis ? marcaTempo.toMillis() : 0;
    if (!quando || Date.now() - quando > JANELA_MS) { vistos.set(chave, Date.now()); return; }
    const numero = numeroWhatsApp(p.tel);
    if (!numero) { vistos.set(chave, Date.now()); return; }
    if (!pronto()) { if (!fila.some((f) => f.id === id)) fila.push({ id }); return; }

    vistos.set(chave, Date.now());
    const ref = db.collection('pedidos').doc(id);
    let ganhou = false;
    try {
      await db.runTransaction(async (t) => {
        const d = await t.get(ref);
        if (!d.exists) return;
        const atual = d.data();
        if (eventoDo(atual) !== ev || (atual.avisosWa || {})[ev]) return;   // mudou de etapa ou outro PC já mandou
        const marca = { ...(atual.avisosWa || {}), [ev]: FieldValue.serverTimestamp() };
        // Pulou direto para pronto/entrega: o "aceito" não sai mais depois.
        if (ev !== 'aceito' && ev !== 'cancelado' && !marca.aceito) marca.aceito = FieldValue.serverTimestamp();
        t.update(ref, { avisosWa: marca });
        ganhou = true;
      });
    } catch (e) {
      console.warn(`[avisos] ${p.num || id}: não marcou o aviso (${e.message})`);
      vistos.delete(chave);
      return;
    }
    if (!ganhou) return;

    const chatId = await resolverChat(numero).catch(() => null);
    if (!chatId) { log(`📭 ${p.num || id}: ${numero} não tem WhatsApp — aviso "${ev}" não enviado`); return; }
    await enviar(chatId, montarTexto(config[ev].texto, p));
    log(`📣 ${p.num || id}: aviso "${ev}" enviado para ${numero}`);
    if (ev === 'cancelado' && aoCancelar) await Promise.resolve(aoCancelar(chatId, p)).catch(() => {});
  }

  // Duas consultas: etapas (`hora`) e cancelamentos (`canceladoEm`) — um
  // pedido antigo cancelado agora não aparece na primeira.
  function escutar() {
    const desde = new Date(Date.now() - ESCUTA_MS);
    const ouvir = (campo) => db.collection('pedidos').where(campo, '>=', desde).onSnapshot((snap) => {
      snap.docChanges().forEach((ch) => {
        if (ch.type === 'removed') return;
        tratar(ch.doc.id, ch.doc.data()).catch((e) => console.error('[avisos]', e.message));
      });
    }, (e) => {
      console.warn(`[avisos] parou de escutar os pedidos (${campo}):`, e.message, '— tentando de novo em 1 min');
      setTimeout(reabrir, 60000);
    });
    const pararHora = ouvir('hora'), pararCancel = ouvir('canceladoEm');
    return () => { pararHora(); pararCancel(); };
  }
  // O filtro "últimas 6 h" é fixo na consulta: reabre a cada hora para andar junto.
  let parar = escutar();
  function reabrir() { try { parar(); } catch (e) {} parar = escutar(); }
  setInterval(reabrir, 60 * 60 * 1000).unref();
  setInterval(() => { const t = Date.now() - ESCUTA_MS; for (const [k, v] of vistos) if (v < t) vistos.delete(k); }, 30 * 60 * 1000).unref();

  // WhatsApp conectou: manda o que ficou esperando.
  async function aoConectar() {
    const ids = fila.splice(0);
    for (const { id } of ids) {
      const d = await db.collection('pedidos').doc(id).get().catch(() => null);
      if (d && d.exists) await tratar(id, d.data()).catch((e) => console.error('[avisos]', e.message));
    }
  }

  return { aoConectar };
}

module.exports = { iniciarAvisos, eventoDo, montarTexto, numeroWhatsApp, lerConfig, PADRAO };
