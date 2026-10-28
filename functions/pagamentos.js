// ═══════════════════════════════════════════════════════════════
// PAGAMENTO ONLINE — Mercado Pago (Checkout Pro)
// ───────────────────────────────────────────────────────────────
// O cliente escolhe "Pagar online" e é levado à página do Mercado Pago, que
// cuida de Pix, crédito e débito (dados de cartão nunca passam pelo nosso
// site). O pedido SÓ entra no Kanban depois do pagamento aprovado.
//
// Fluxo:
//  1) O site grava o pedido em pagamentos/{id} com status 'aguardando'
//     (o firestore.rules só deixa criar nesse status).
//  2) criarPagamentoMP({id}) cria a "preferência" no Mercado Pago com o total
//     desse documento e devolve o link de pagamento.
//  3) O Mercado Pago avisa o webhookMercadoPago a cada mudança. O cliente, ao
//     voltar pro site, também chama verificarPagamentoMP (rede de segurança se
//     o aviso atrasar).
//  4) processarPagamento CONSULTA o pagamento na API do Mercado Pago (nunca
//     confia no corpo do aviso) e, se aprovado com o valor certo, cria
//     pedidos/{id} com status 'novo' — o mesmo ID. A partir daí é um pedido
//     como outro qualquer: os triggers onCreate (push + fila de impressão)
//     disparam sozinhos e o cliente acompanha pelo mesmo ID.
//
// Por que o webhook não valida a assinatura x-signature: a segurança vem do
// passo 4 — o status e o valor são lidos da API do Mercado Pago com o nosso
// token, então um aviso forjado não aprova nada. Exigir a assinatura só
// criaria um jeito de pedidos pagos ficarem presos por erro de configuração.
//
// Credencial (uma vez, pelo terminal, na pasta do projeto):
//   firebase functions:secrets:set MP_ACCESS_TOKEN
// ═══════════════════════════════════════════════════════════════

const admin = require('firebase-admin');
const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const logger = require('firebase-functions/logger');

const MP_ACCESS_TOKEN = defineSecret('MP_ACCESS_TOKEN');

const REGION = 'southamerica-east1';
const SITE = 'https://tchoburguer.com';
const MP_API = 'https://api.mercadopago.com';
const EXPIRA_MIN = 30;                       // link de pagamento vale 30 min
const ID_OK = /^[A-Za-z0-9]{10,40}$/;        // ID automático do Firestore

const db = () => admin.firestore();
const { FieldValue } = admin.firestore;

// Data no formato que o Mercado Pago pede (ISO com fuso -03:00, Brasília).
function isoBR(d) {
  const sp = new Date(d.getTime() - 3 * 3600000);
  return sp.toISOString().replace('Z', '-03:00');
}

// Hora HH:MM em Brasília (o servidor roda em UTC).
function horaBR(d) {
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
}

const centavos = (v) => Math.round(Number(v) * 100);

// Rótulo que aparece no Kanban, no cupom e na Conferência de Caixa. Começa
// sempre com "Pago online" para o motoboy saber que NÃO deve cobrar.
function rotuloPagamento(pay) {
  const tipo = pay.payment_type_id;
  const forma = pay.payment_method_id === 'pix' ? 'Pix'
    : tipo === 'credit_card' ? 'Crédito'
    : tipo === 'debit_card' ? 'Débito'
    : tipo === 'account_money' ? 'Saldo Mercado Pago'
    : tipo === 'prepaid_card' ? 'Cartão pré-pago'
    : 'Mercado Pago';
  return `Pago online - ${forma}`;
}

async function mp(token, metodo, caminho, corpo, idempotencia) {
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  if (idempotencia) headers['X-Idempotency-Key'] = idempotencia;
  const resp = await fetch(MP_API + caminho, {
    method: metodo, headers, body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const err = new Error(`Mercado Pago ${resp.status}: ${json.message || json.error || 'erro'}`);
    err.status = resp.status;
    throw err;
  }
  return json;
}

// Mesmo critério do baixarEstoque() do cliente: só mexe em item no modo 'qtd'.
function aplicarConsumo(estoque, consumo) {
  let mudou = false;
  Object.entries(consumo || {}).forEach(([id, qtd]) => {
    const n = Number(qtd);
    if (!Number.isInteger(n) || n < 1 || n > 100) return;       // ignora lixo
    const e = estoque[id];
    if (e && e.modo === 'qtd') { e.qtd = Math.max(0, (e.qtd || 0) - n); mudou = true; }
  });
  return mudou;
}

// Mesmo cálculo do upsertCliente() de shared/crm.js — feito aqui porque o
// cliente pode não voltar pro site depois de pagar.
async function atualizarCliente(pedido) {
  const tel = String(pedido.tel || '').replace(/\D/g, '');
  if (tel.length < 10) return;
  const ref = db().collection('clientes').doc(tel);
  const agora = FieldValue.serverTimestamp();
  const total = Number(pedido.total) || 0;
  const primeiroItem = (pedido.itens && pedido.itens[0]) || '';
  await db().runTransaction(async (t) => {
    const doc = await t.get(ref);
    if (doc.exists) {
      const d = doc.data();
      const qtd = (d.quantidadePedidos || 0) + 1;
      const gasto = Math.round(((d.valorTotalGasto || 0) + total) * 100) / 100;
      t.update(ref, {
        nome: pedido.nome || d.nome || '', telefone: pedido.tel || d.telefone || '',
        endereco: pedido.endereco || d.endereco || '', dataUltimaCompra: agora,
        quantidadePedidos: qtd, valorTotalGasto: gasto, ticketMedio: Math.round((gasto / qtd) * 100) / 100,
        ultimoProdutoComprado: primeiroItem, atualizadoEm: agora,
      });
    } else {
      t.set(ref, {
        nome: pedido.nome || '', telefone: pedido.tel || '', email: '', endereco: pedido.endereco || '',
        dataPrimeiraCompra: agora, dataUltimaCompra: agora, quantidadePedidos: 1,
        valorTotalGasto: total, ticketMedio: total, ultimoProdutoComprado: primeiroItem,
        criadoEm: agora, atualizadoEm: agora,
      });
    }
  });
}

// Coração da integração: recebe o pagamento JÁ LIDO da API do Mercado Pago.
// Idempotente — pode ser chamado várias vezes (webhook repetido + cliente
// voltando) que o pedido é criado uma vez só.
async function processarPagamento(pay) {
  const id = String(pay.external_reference || '');
  if (!ID_OK.test(id)) return 'sem-referencia';
  const pgRef = db().collection('pagamentos').doc(id);
  const pedRef = db().collection('pedidos').doc(id);
  const contRef = db().collection('config').doc('contador');
  const estRef = db().collection('cardapio').doc('estoque');

  const resultado = await db().runTransaction(async (t) => {
    const pgSnap = await t.get(pgRef);
    if (!pgSnap.exists) return 'sem-pendente';
    const pg = pgSnap.data();
    if (pg.status === 'pago') return 'ja-pago';

    if (pay.status !== 'approved') {
      // Recusado/cancelado não é definitivo: no Checkout Pro o cliente pode
      // tentar outro cartão no mesmo link, e um aprovado depois vale.
      const st = (pay.status === 'rejected' || pay.status === 'cancelled') ? 'recusado' : 'aguardando';
      t.update(pgRef, { status: st, mpStatus: pay.status, mpDetalhe: pay.status_detail || '', atualizadoEm: FieldValue.serverTimestamp() });
      return st;
    }

    // Aprovado: confere moeda e valor antes de liberar o pedido
    if (pay.currency_id !== 'BRL' || centavos(pay.transaction_amount) < centavos(pg.total)) {
      t.update(pgRef, { status: 'divergente', mpId: String(pay.id), mpValor: pay.transaction_amount, atualizadoEm: FieldValue.serverTimestamp() });
      logger.error(`processarPagamento: valor divergente em ${id} (pago ${pay.transaction_amount}, pedido ${pg.total})`);
      return 'divergente';
    }

    // Leituras antes das escritas (regra da transação)
    const contSnap = await t.get(contRef);
    const estSnap = pg.consumo ? await t.get(estRef) : null;
    const cupRef = pg.cupomId && ID_OK.test(pg.cupomId) ? db().collection('cupons').doc(pg.cupomId) : null;
    const cupSnap = cupRef ? await t.get(cupRef) : null;

    // Mesmo contador do site e do balcão → numeração única
    const numOrdem = (contSnap.exists ? contSnap.data().ultimo || 0 : 0) + 1;
    const num = `#${String(numOrdem).padStart(3, '0')}`;
    const agora = new Date();
    const base = pg.pedido || {};
    const pedido = {
      ...base,
      id: numOrdem, num,
      total: pg.total,
      pag: rotuloPagamento(pay),
      pagamentoOnline: {
        mpId: String(pay.id),
        forma: pay.payment_method_id || '',
        tipo: pay.payment_type_id || '',
        valor: pay.transaction_amount,
        aprovadoEm: pay.date_approved || '',
      },
      status: 'novo',
      hora: FieldValue.serverTimestamp(),
      horaStr: horaBR(agora),
      impresso: false,
      criadoEm: FieldValue.serverTimestamp(),
    };

    t.set(contRef, { ultimo: numOrdem }, { merge: true });
    t.set(pedRef, pedido);
    t.update(pgRef, { status: 'pago', pedidoNum: num, mpId: String(pay.id), pagoEm: FieldValue.serverTimestamp() });
    if (estSnap && estSnap.exists) {
      const estoque = estSnap.data().data || {};
      if (aplicarConsumo(estoque, pg.consumo)) t.set(estRef, { data: estoque }, { merge: true });
    }
    if (cupSnap && cupSnap.exists) t.update(cupRef, { usosFeitos: FieldValue.increment(1) });
    return { criado: pedido };
  });

  if (resultado && resultado.criado) {
    logger.info(`processarPagamento: pedido ${resultado.criado.num} pago (${resultado.criado.pag})`);
    try { await atualizarCliente(resultado.criado); } catch (e) { logger.warn('atualizarCliente:', e.message); }
    return 'pago';
  }
  return resultado;
}

// data: { id } — ID de pagamentos/{id} criado pelo site. Sem login (cliente).
exports.criarPagamentoMP = onCall({ region: REGION, secrets: [MP_ACCESS_TOKEN] }, async (request) => {
  const id = String((request.data || {}).id || '');
  if (!ID_OK.test(id)) throw new HttpsError('invalid-argument', 'Pedido inválido.');
  const ref = db().collection('pagamentos').doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Pedido não encontrado.');
  const pg = snap.data();
  if (pg.status === 'pago') throw new HttpsError('failed-precondition', 'Este pedido já foi pago.');

  // Mesmo link enquanto não vence: tentar de novo não cria cobrança nova
  if (pg.linkPagamento && pg.linkVenceMs > Date.now() + 60000) {
    return { url: pg.linkPagamento };
  }

  const total = Math.round(Number(pg.total) * 100) / 100;
  if (!(total > 0) || total > 5000) throw new HttpsError('invalid-argument', 'Valor do pedido inválido.');

  const agora = new Date();
  const vence = new Date(agora.getTime() + EXPIRA_MIN * 60000);
  const voltar = `${SITE}/cliente/?pg=${id}`;
  const pedido = pg.pedido || {};
  const pref = await mp(MP_ACCESS_TOKEN.value(), 'POST', '/checkout/preferences', {
    items: [{ id: 'pedido', title: 'Pedido Tcho Burguer', quantity: 1, unit_price: total, currency_id: 'BRL' }],
    payer: { name: String(pedido.nome || '').slice(0, 60) },
    external_reference: id,
    notification_url: `https://${REGION}-${process.env.GCLOUD_PROJECT}.cloudfunctions.net/webhookMercadoPago`,
    back_urls: { success: voltar, pending: voltar, failure: voltar },
    auto_return: 'approved',
    // Boleto/lotérica demoram dias — não servem pra lanche. Sem parcelamento.
    payment_methods: { excluded_payment_types: [{ id: 'ticket' }, { id: 'atm' }], installments: 1 },
    statement_descriptor: 'TCHO BURGUER',
    expires: true,
    expiration_date_from: isoBR(agora),
    expiration_date_to: isoBR(vence),
    date_of_expiration: isoBR(vence),              // Pix gerado vence junto
  }, `pref-${id}-${Math.floor(agora.getTime() / (EXPIRA_MIN * 60000))}`);

  await ref.update({
    preferenciaId: pref.id,
    linkPagamento: pref.init_point,
    linkVenceMs: vence.getTime(),
  });
  return { url: pref.init_point };
});

// Aviso do Mercado Pago (URL mandada em notification_url). Responde 200 pra
// tudo que não é pagamento; erro 500 faz o Mercado Pago tentar de novo.
exports.webhookMercadoPago = onRequest({ region: REGION, secrets: [MP_ACCESS_TOKEN] }, async (req, res) => {
  const tipo = (req.body && (req.body.type || req.body.topic)) || req.query.type || req.query.topic;
  const payId = (req.body && req.body.data && req.body.data.id) || req.query['data.id'] || req.query.id;
  if (tipo !== 'payment' || !payId || !/^\d+$/.test(String(payId))) { res.status(200).send('ignorado'); return; }
  try {
    const pay = await mp(MP_ACCESS_TOKEN.value(), 'GET', `/v1/payments/${payId}`);
    const r = await processarPagamento(pay);
    logger.info(`webhookMercadoPago: pagamento ${payId} → ${typeof r === 'string' ? r : 'ok'}`);
    res.status(200).send('ok');
  } catch (e) {
    logger.error(`webhookMercadoPago: ${payId}`, e.message);
    res.status(e.status === 404 ? 200 : 500).send('erro');
  }
});

// data: { id } — o cliente chama ao voltar do Mercado Pago. Busca os
// pagamentos desse pedido e processa o aprovado (se o webhook ainda não fez).
exports.verificarPagamentoMP = onCall({ region: REGION, secrets: [MP_ACCESS_TOKEN] }, async (request) => {
  const id = String((request.data || {}).id || '');
  if (!ID_OK.test(id)) throw new HttpsError('invalid-argument', 'Pedido inválido.');
  const snap = await db().collection('pagamentos').doc(id).get();
  if (!snap.exists) throw new HttpsError('not-found', 'Pedido não encontrado.');
  if (snap.data().status === 'pago') return { status: 'pago' };

  const busca = await mp(MP_ACCESS_TOKEN.value(), 'GET',
    `/v1/payments/search?external_reference=${encodeURIComponent(id)}&sort=date_created&criteria=desc`);
  const lista = busca.results || [];
  const aprovado = lista.find((p) => p.status === 'approved');
  const escolhido = aprovado || lista[0];
  if (!escolhido) return { status: snap.data().status };
  const r = await processarPagamento(escolhido);
  return { status: r === 'ja-pago' ? 'pago' : r };
});

// Exportado para teste
exports._interno = { processarPagamento, rotuloPagamento, aplicarConsumo, isoBR };
