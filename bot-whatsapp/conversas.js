// ═══════════════════════════════════════════════════════════════
// CONVERSAS — estado de cada cliente (em memória)
// ───────────────────────────────────────────────────────────────
// Histórico curto (pra não estourar tokens), rascunho do pedido, resumo
// aguardando "sim", pausa pro atendimento humano. Some depois de 2h sem
// mensagem. Reiniciar o bot zera tudo (as pausas também).
// ═══════════════════════════════════════════════════════════════

const EXPIRA_MS = 2 * 60 * 60000;      // 2h sem falar → conversa nova
const MAX_HISTORICO = 16;              // mensagens (cliente + bot) mandadas pra IA
const PAUSA_MS = 30 * 60000;           // atendimento humano

const conversas = new Map();   // chatId → estado

function novo(chatId) {
  return {
    chatId,
    historico: [],          // [{ quem: 'cliente'|'bot', texto }]
    rascunho: {},           // o que a IA entendeu até agora
    resumo: null,           // { rascunho, conferido } mostrado ao cliente, esperando o "sim"
    naoEntendeu: 0,         // vezes seguidas que a IA não entendeu
    pausadoAte: 0,
    avisoFechadoEm: 0,
    boasVindas: false,      // já mandou a mensagem de boas-vindas nesta conversa
    cliente: undefined,     // cadastro do CRM (undefined = ainda não buscou)
    numero: '',             // telefone (só dígitos, com 55)
    ultimaEm: Date.now(),
  };
}

function obter(chatId) {
  let c = conversas.get(chatId);
  if (c && Date.now() - c.ultimaEm > EXPIRA_MS) {
    const pausadoAte = c.pausadoAte;           // a pausa vale mesmo com a conversa expirada
    c = novo(chatId); c.pausadoAte = pausadoAte;
    conversas.set(chatId, c);
  }
  if (!c) { c = novo(chatId); conversas.set(chatId, c); }
  c.ultimaEm = Date.now();
  return c;
}

function registrar(c, quem, texto) {
  if (!texto) return;
  c.historico.push({ quem, texto: String(texto).slice(0, 1500) });
  if (c.historico.length > MAX_HISTORICO) c.historico.splice(0, c.historico.length - MAX_HISTORICO);
}

// Pedido gravado: começa do zero, mas lembra quem é o cliente.
function zerarPedido(c) {
  c.rascunho = {}; c.resumo = null; c.naoEntendeu = 0; c.historico = [];
}

function pausar(chatId, ms = PAUSA_MS) {
  const c = obter(chatId);
  c.pausadoAte = Date.now() + ms;
  return c;
}
function pausado(chatId) {
  const c = conversas.get(chatId);
  return !!(c && c.pausadoAte > Date.now());
}

// Limpeza periódica da memória.
setInterval(() => {
  const agora = Date.now();
  for (const [id, c] of conversas) {
    if (agora - c.ultimaEm > EXPIRA_MS && c.pausadoAte < agora) conversas.delete(id);
  }
}, 10 * 60000).unref();

module.exports = { obter, registrar, zerarPedido, pausar, pausado, PAUSA_MS, _conversas: conversas };
