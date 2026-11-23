// ═══════════════════════════════════════════════════════════════
// CARDÁPIO AO VIVO (Firestore) — o que o bot pode vender agora
// ───────────────────────────────────────────────────────────────
// Mesmas regras do site (cliente/cliente.js) e da conferência do servidor
// (functions/conferencia.js → carregarCardapio):
//   base = shared/dados.js  +  edições do admin em cardapio/* (nomes, preços,
//   ingredientes, adicionais, sabores, produtos custom, promoção)
//   estoque = cardapio/estoque  ·  bairros = cardapio/bairros
//   loja aberta / delivery / retirada / pagamento online = config/operacao
// Mudou essas regras lá? Replique aqui.
//
// Fica tudo em memória, atualizado por listeners (onSnapshot): o bot não
// lê o Firestore a cada mensagem e vê o estoque mudar na hora.
// ═══════════════════════════════════════════════════════════════

const path = require('path');
const vm = require('vm');
const fs = require('fs');

const SITE = 'https://tchoburguer.com';
const TZ = 'America/Sao_Paulo';

let base = null;          // TCHO de shared/dados.js
let docs = {};            // cardapio/* → data()
let operacao = {};        // config/operacao
let pronto = false;
let C = null;             // cardápio montado (cache; refeito quando algo muda)
const esperando = [];

// shared/dados.js: o publicado no site (igual ao que o cliente vê); se o site
// não responder, usa a cópia deste repositório.
async function carregarBase() {
  try {
    const r = await fetch(`${SITE}/shared/dados.js?t=${Date.now()}`, { signal: AbortSignal.timeout(10000) });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const ctx = { module: {} };
    vm.runInNewContext(await r.text(), ctx, { timeout: 1000 });
    if (!ctx.module.exports || !Array.isArray(ctx.module.exports.burguers)) throw new Error('dados.js sem cardápio');
    base = JSON.parse(JSON.stringify(ctx.module.exports));
  } catch (e) {
    const local = path.join(__dirname, '..', 'shared', 'dados.js');
    if (!base && fs.existsSync(local)) {
      console.warn(`[cardapio] site fora (${e.message}) — usando ${local}`);
      delete require.cache[require.resolve(local)];
      base = JSON.parse(JSON.stringify(require(local)));
    } else if (!base) throw e;
  }
  C = null;
}

function montar() {
  const T = JSON.parse(JSON.stringify(base));
  const d = (n) => docs[n] || {};

  const edits = d('prods_edits').data || {};
  [...T.burguers, ...T.extras].forEach((it) => {
    const e = edits[it.id];
    if (!e) return;
    if (e.nome) it.nome = e.nome;
    if (e.preco !== undefined) it.preco = e.preco;
    if (e.desc !== undefined) it.desc = e.desc;
  });
  const ings = d('ing_edits').data || {};
  T.burguers.forEach((b) => { if (ings[b.id]) b.ing = ings[b.id]; });
  const adicionais = Array.isArray(d('adicionais').lista) ? d('adicionais').lista : T.adicionais;

  const burguers = new Map(T.burguers.map((b) => [b.id, b]));
  const extras = new Map(T.extras.map((e) => [e.id, e]));
  (Array.isArray(d('prods_custom').lista) ? d('prods_custom').lista : [])
    .filter((p) => p && p.ativo !== false && p.id)
    .forEach((p) => {
      const prod = { id: p.id, nome: p.n || p.nome, preco: p.p !== undefined ? p.p : p.preco, desc: p.desc || '', opcoes: p.opcoes || [], ing: [] };
      const cat = String(p.cat || '');
      if (p.tipo === 'b' || cat === 'b' || cat === 'burguers') burguers.set(prod.id, prod);
      else extras.set(prod.id, prod);
    });

  // Promoção do Marketing (mesma regra de atualizarPromocoes() no cliente)
  const promo = d('promo');
  if (promo && promo.ativo) {
    const prod = promo.produtoId ? (burguers.get(promo.produtoId) || extras.get(promo.produtoId)) : null;
    const temPreco = promo.precoPromo !== undefined && promo.precoPromo !== null && String(promo.precoPromo).trim() !== '';
    const precoPromo = temPreco ? Number(promo.precoPromo) : null;
    const preco = precoPromo !== null && !isNaN(precoPromo) ? precoPromo : (prod ? prod.preco : null);
    if (preco !== null && !isNaN(preco)) {
      extras.set('promo_main', { id: 'promo_main', nome: String(promo.titulo || '').trim() || (prod ? prod.nome : 'Promoção'), preco, desc: String(promo.texto || '').trim(), opcoes: [] });
    }
  }

  const opcoesSalvas = d('opcoes').data || {};
  const opcoes = (id) => {
    if (opcoesSalvas[id] !== undefined) return opcoesSalvas[id];
    const e = extras.get(id);
    return (e && e.opcoes) || [];
  };
  const estoque = d('estoque').data || {};
  // Igual a produtoDisponivel() do cliente: sem registro = disponível.
  const disponivel = (id) => {
    const e = estoque[id];
    if (!e) return true;
    if (e.ativo === false) return false;
    if (e.modo === 'qtd' && (Number(e.qtd) || 0) <= 0) return false;
    return true;
  };
  const bairros = Array.isArray(d('bairros').lista) && d('bairros').lista.length ? d('bairros').lista : T.bairros;

  return {
    burguers, extras, adicionais, opcoes, estoque, disponivel, bairros,
    pontos: T.pontos || [], saches: T.saches || [], loja: T.loja || {},
    operacao,
  };
}

// Cardápio atual (sempre o mais novo que chegou do Firestore).
function cardapio() {
  if (!pronto) throw new Error('cardápio ainda não carregou');
  if (!C) C = montar();
  return C;
}

// ── HORÁRIO ─────────────────────────────────────────────────────
// Cópia de estaAbertaAgora()/horarioPadrao() de shared/crm.js e da regra de
// aplicarEstadoLoja() do cliente — com o relógio de Brasília.
function horarioPadrao() {
  return { dias: [0, 4, 5, 6], p1: { abre: '19:00', fecha: '23:00' }, doisPeriodos: false, p2: { abre: '', fecha: '' } };
}
function dentroPeriodo(min, per) {
  if (!per || !per.abre || !per.fecha) return false;
  const [ah, am] = String(per.abre).split(':').map(Number);
  const [fh, fm] = String(per.fecha).split(':').map(Number);
  if (isNaN(ah) || isNaN(fh)) return false;
  return min >= ah * 60 + (am || 0) && min < fh * 60 + (fm || 0);
}
function agoraBrasilia() {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date()).map((x) => [x.type, x.value]));
  const dia = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday);
  return { dia, min: Number(p.hour) * 60 + Number(p.minute) };
}
function estaAbertaAgora(horarios) {
  const h = horarios && Array.isArray(horarios.dias) ? horarios : horarioPadrao();
  const { dia, min } = agoraBrasilia();
  if (!h.dias.includes(dia)) return false;
  if (dentroPeriodo(min, h.p1)) return true;
  return !!(h.doisPeriodos && dentroPeriodo(min, h.p2));
}
function lojaAberta() {
  const d = operacao || {};
  if (d.lojaAberta === false) return false;      // fechamento manual
  if (d.forcarAberta) return true;               // forçar aberta
  if (d.autoHorario !== false) return estaAbertaAgora(d.horarios);
  return d.lojaAberta !== false;
}
// Texto do horário pra avisar o cliente ("Qui, Sex, Sáb e Dom • 19:00 às 23:00").
function textoHorario() {
  const h = operacao && operacao.horarios && Array.isArray(operacao.horarios.dias) ? operacao.horarios : horarioPadrao();
  const nomes = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const dias = [1, 2, 3, 4, 5, 6, 0].filter((d) => h.dias.includes(d)).map((d) => nomes[d]);
  const lista = dias.length > 1 ? dias.slice(0, -1).join(', ') + ' e ' + dias[dias.length - 1] : dias.join('');
  let t = `${lista} • ${h.p1.abre} às ${h.p1.fecha}`;
  if (h.doisPeriodos && h.p2 && h.p2.abre) t += ` e ${h.p2.abre} às ${h.p2.fecha}`;
  return t;
}
function modalidades() {
  return { delivery: operacao.deliveryAtivo !== false, retirada: operacao.retiradaAtiva !== false };
}
function pagamentoOnlineAtivo() { return operacao.pagamentoOnline === true; }

// ── BAIRROS (mesma comparação de normBairro/matchBairro do cliente) ──
function normBairro(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
}
function acharBairro(nome) {
  const n = normBairro(nome);
  if (!n) return null;
  return cardapio().bairros.find((b) => { const nb = normBairro(b.nome); return nb === n || n.includes(nb) || nb.includes(n); }) || null;
}

// ── LISTENERS ───────────────────────────────────────────────────
function iniciar(db) {
  let chegouCardapio = false, chegouOperacao = false;
  const talvezPronto = () => {
    if (pronto || !chegouCardapio || !chegouOperacao || !base) return;
    pronto = true;
    console.log('[cardapio] carregado do Firestore');
    esperando.splice(0).forEach((r) => r());
  };
  carregarBase().then(talvezPronto).catch((e) => console.error('[cardapio] dados.js:', e.message));
  setInterval(() => carregarBase().catch(() => {}), 10 * 60000);   // preço base mudou no site

  db.collection('cardapio').onSnapshot((snap) => {
    const novo = {};
    snap.forEach((d) => { novo[d.id] = d.data(); });
    docs = novo; C = null; chegouCardapio = true;
    talvezPronto();
  }, (e) => console.error('[cardapio] listener cardapio:', e.message));

  db.collection('config').doc('operacao').onSnapshot((d) => {
    operacao = d.exists ? d.data() : {};
    C = null; chegouOperacao = true;
    talvezPronto();
  }, (e) => console.error('[cardapio] listener operacao:', e.message));
}
function aguardarPronto() { return pronto ? Promise.resolve() : new Promise((r) => esperando.push(r)); }

// Só para teste: monta o cardápio a partir de dados prontos, sem Firestore.
function _carregarParaTeste(tcho, docsTeste, operacaoTeste) {
  base = JSON.parse(JSON.stringify(tcho)); docs = docsTeste || {}; operacao = operacaoTeste || {};
  C = null; pronto = true;
}

module.exports = {
  iniciar, aguardarPronto, cardapio, lojaAberta, textoHorario, modalidades,
  pagamentoOnlineAtivo, acharBairro, normBairro, SITE, TZ, _carregarParaTeste,
};
