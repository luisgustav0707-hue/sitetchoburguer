// ═══════════════════════════════════════════════════════════════
// PEDIDO — confere, resume e grava no Firestore
// ───────────────────────────────────────────────────────────────
// A IA só diz O QUE o cliente quer (ids e escolhas). Itens, preços e total
// são remontados aqui com o cardápio do Firestore, pelo mesmo
// montarDoCarrinho() que o servidor usa no pagamento online
// (functions/conferencia.js) — então o texto dos itens sai igual ao do site.
//
// O pedido gravado segue o formato de finalizarPedido()/dadosPedido() em
// cliente/cliente.js: aparece na Cozinha do admin e a impressão automática
// (functions/index.js → enfileirarImpressao) pega sozinha.
// ═══════════════════════════════════════════════════════════════

const { montarDoCarrinho } = require('../functions/conferencia');
const CD = require('./cardapio');

const COMBO_REFRI_ID = 'rla';   // mesmos ids de cliente/cliente.js
const COMBO_SUCO_ID = 'suc';
const COMBO_SUCO_EXTRA = 2;
const COMBO_PADRAO = 15;

const norm = (s) => CD.normBairro(s);
const txt = (v) => String(v == null ? '' : v).trim();

// Acha um valor numa lista por id ou nome, sem ligar pra acento/caixa.
function acharPor(lista, valor, campoNome = 'nome') {
  const n = norm(valor);
  if (!n) return null;
  return lista.find((x) => x.id === valor) || lista.find((x) => norm(x[campoNome]) === n)
    || lista.find((x) => norm(x[campoNome]).includes(n) || n.includes(norm(x[campoNome]))) || null;
}
function acharTexto(lista, valor) {
  const n = norm(valor);
  if (!n) return null;
  return lista.find((x) => norm(x) === n) || lista.find((x) => norm(x).includes(n) || n.includes(norm(x))) || null;
}

// Telefone do WhatsApp (5531983094152) → como o cliente digita no site.
function telefoneLimpo(numero) {
  let d = String(numero || '').replace(/\D/g, '');
  if (d.length >= 12 && d.startsWith('55')) d = d.slice(2);
  if (d.length === 10 && /[6-9]/.test(d[2])) d = d.slice(0, 2) + '9' + d.slice(2);   // celular sem o 9
  return d;
}
function telefoneFormatado(numero) {
  const d = telefoneLimpo(numero);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return d;
}

const brl = (v) => 'R$' + (Number.isInteger(v) ? v : Number(v).toFixed(2).replace('.', ','));

// ── CONFERÊNCIA ─────────────────────────────────────────────────
// rascunho = o que a IA entendeu (ver ia.js → esquema "pedido").
// Devolve { pendencia, indisponiveis, rascunho (limpo), carrinho, montado,
//           frete, total, bairro } — pendencia é a próxima pergunta a fazer
// ao cliente (null quando dá pra mostrar o resumo).
function conferir(rascunhoIA) {
  const C = CD.cardapio();
  const r = JSON.parse(JSON.stringify(rascunhoIA || {}));
  r.lanches = Array.isArray(r.lanches) ? r.lanches : [];
  r.extras = Array.isArray(r.extras) ? r.extras : [];
  const indisponiveis = [];

  // Estoque restante (modo quantidade) — mesma conta de calcularConsumo()/
  // removerIndisponiveis() do cliente: combo gasta 1 bebida + 1 batata.
  const resta = {};
  Object.entries(C.estoque).forEach(([id, e]) => { if (e && e.modo === 'qtd') resta[id] = Math.max(0, Number(e.qtd) || 0); });
  const pega = (id) => {
    if (!C.disponivel(id)) return false;
    if (!(id in resta)) return true;
    if (resta[id] <= 0) return false;
    resta[id]--; return true;
  };
  const listaBurguers = [...C.burguers.values()];
  const listaExtras = [...C.extras.values()];

  const lanches = [];
  for (const l of r.lanches) {
    const b = acharPor(listaBurguers, l.id) || acharPor(listaBurguers, l.nome);
    if (!b) { indisponiveis.push(txt(l.nome || l.id) || 'lanche'); continue; }
    if (!pega(b.id)) { indisponiveis.push(b.nome); continue; }
    const ponto = acharPor(C.pontos, l.ponto);
    const sache = acharPor(C.saches, l.sache);
    const removidos = (Array.isArray(l.removidos) ? l.removidos : []).map((x) => acharTexto(b.ing || [], x)).filter(Boolean);
    const adicionais = (Array.isArray(l.adicionais) ? l.adicionais : []).map((x) => acharPor(C.adicionais, x)).filter(Boolean);
    const novo = { id: b.id, nome: b.nome, ponto: ponto ? ponto.id : '', sache: sache ? sache.id : '', removidos, adicionais: adicionais.map((a) => a.id), combo_sabor: '', combo_suco: false };
    const sabor = txt(l.combo_sabor);
    if (sabor) {
      const suco = !!l.combo_suco;
      const certo = acharTexto(C.opcoes(suco ? COMBO_SUCO_ID : 'cmb'), sabor);
      const ok = certo && C.disponivel('cmb') && pega(suco ? COMBO_SUCO_ID : COMBO_REFRI_ID) && pega('bat');
      if (ok) { novo.combo_sabor = certo; novo.combo_suco = suco; }
      else indisponiveis.push(`Combo ${suco ? 'com suco' : 'com refri'} ${sabor}`);
    }
    lanches.push(novo);
  }

  const extras = [];
  for (const x of r.extras) {
    const e = acharPor(listaExtras, x.id) || acharPor(listaExtras, x.nome);
    if (!e) { indisponiveis.push(txt(x.nome || x.id) || 'item'); continue; }
    const lista = C.opcoes(e.id);
    const okExtra = () => pega(e.id) && (e.id !== 'cmb' || C.disponivel(COMBO_REFRI_ID));
    if (lista.length) {
      // Um sabor por unidade. Sabor que não existe/acabou sai (e é avisado);
      // unidade sem sabor ainda vira pergunta (pendência) mais abaixo.
      const pedidos = (Array.isArray(x.sabores) ? x.sabores : []).slice(0, 60);
      const sabores = [];
      for (const s of pedidos) {
        const certo = acharTexto(lista, s);
        if (certo && okExtra()) sabores.push(certo);
        else indisponiveis.push(`${e.nome} ${txt(s)}`);
      }
      let qtd = Math.min(60, Math.max(Math.round(Number(x.quantidade) || 0), pedidos.length)) - (pedidos.length - sabores.length);
      if (!pedidos.length && qtd < 1) qtd = 1;
      if (qtd > 0) extras.push({ id: e.id, nome: e.nome, quantidade: qtd, sabores });
    } else {
      const pedida = Math.max(1, Math.min(60, Math.round(Number(x.quantidade) || 1)));
      let q = 0;
      for (let i = 0; i < pedida; i++) if (okExtra()) q++;
      if (q < pedida) indisponiveis.push(q ? `${e.nome} (só temos ${q})` : e.nome);
      if (q) extras.push({ id: e.id, nome: e.nome, quantidade: q, sabores: [] });
    }
  }
  // Extra com sabor que ficou sem nenhum sabor válido e nenhuma unidade pedida → sai.
  const extrasFinais = extras.filter((x) => x.quantidade > 0);

  const limpo = {
    ...r, lanches, extras: extrasFinais,
    tipo: ['delivery', 'retirada'].includes(r.tipo) ? r.tipo : '',
    pagamento: ['dinheiro', 'cartao', 'pix', 'online'].includes(r.pagamento) ? r.pagamento : '',
    nome: txt(r.nome).slice(0, 60), rua: txt(r.rua).slice(0, 120), numero: txt(r.numero).slice(0, 20),
    complemento: txt(r.complemento).slice(0, 80), cidade: txt(r.cidade).slice(0, 60), obs: txt(r.obs).slice(0, 300),
    troco: Number(r.troco) > 0 ? Math.round(Number(r.troco) * 100) / 100 : 0,
  };

  const res = { indisponiveis, rascunho: limpo, pendencia: null, carrinho: null, montado: null, frete: 0, total: 0, bairro: '' };
  const pendente = (msg) => { if (!res.pendencia) res.pendencia = msg; };

  // 1) itens
  if (!lanches.length && !extrasFinais.length) pendente('O que vai ser hoje? 🍔');
  for (const l of lanches) {
    if (!l.ponto) { pendente(`Qual o ponto da carne do ${l.nome}? Mal passado, ao ponto ou bem passado?`); break; }
    if (!l.sache) { pendente(`Vai querer sachê no ${l.nome}? Ketchup, maionese, os dois ou nenhum?`); break; }
  }
  for (const x of extrasFinais) {
    const lista = C.opcoes(x.id);
    if (lista.length && x.sabores.length < x.quantidade) { pendente(`Qual sabor de ${x.nome}? Temos: ${lista.join(', ')}.`); break; }
  }

  // Carrinho no formato de montarCarrinhoServidor() do cliente
  const carrinho = {
    burguers: lanches.map((l) => ({ id: l.id, ponto: l.ponto, sache: l.sache, removidos: l.removidos, adicionais: l.adicionais, combo: l.combo_sabor || null, suco: !!l.combo_suco })),
    extras: Object.fromEntries(extrasFinais.map((x) => [x.id, C.opcoes(x.id).length ? x.sabores.slice(0, x.quantidade) : x.quantidade])),
  };
  if (lanches.length || extrasFinais.length) {
    const montado = montarDoCarrinho(carrinho, C);
    if (montado) {
      if (montado.motivos.length) console.warn('[pedido] conferência:', montado.motivos.join(' | '));
      res.carrinho = carrinho; res.montado = montado;
    }
  }
  const sub = res.montado ? res.montado.sub : 0;

  // 2) entrega ou retirada
  const mod = CD.modalidades();
  if (!limpo.tipo) pendente(mod.delivery && mod.retirada ? 'É pra entrega ou retirada no local?' : mod.delivery ? 'Hoje é só delivery 🛵 Qual o endereço?' : 'Hoje é só retirada no local 🏃 Pode ser?');
  else if (!mod[limpo.tipo]) pendente(limpo.tipo === 'delivery' ? 'Hoje estamos sem delivery 😕 Só retirada no local. Pode ser?' : 'Hoje estamos sem retirada no local, só delivery 🛵 Qual o endereço?');

  // 3) nome
  if (!limpo.nome) pendente('Qual o seu nome?');

  // 4) endereço e frete
  if (limpo.tipo === 'delivery' && mod.delivery) {
    const b = CD.acharBairro(r.bairro);
    if (!txt(r.bairro)) pendente('Qual o seu bairro?');
    else if (!b) pendente(`Poxa, ainda não entregamos no bairro ${txt(r.bairro)} 😕${mod.retirada ? ' Quer retirar no local?' : ''}`);
    else { res.bairro = b.nome; res.frete = Number(b.taxa) || 0; limpo.bairro = b.nome; }
    if (!limpo.rua || !limpo.numero) pendente('Qual o endereço de entrega? Rua e número 🏠');
  }
  res.total = Math.max(0, sub + (limpo.tipo === 'delivery' ? res.frete : 0));

  // 5) pagamento
  const online = CD.pagamentoOnlineAtivo();
  const linkSite = `${CD.SITE}/cliente/`;
  // Com o pagamento online ligado, o Pix é o do Mercado Pago: o código vai aqui
  // no WhatsApp depois do "sim" (atendente.js → pedirPix). Cartão online, só no site.
  if (!limpo.pagamento) pendente(online ? 'Vai pagar como? Pix (te mando o código aqui mesmo), dinheiro ou cartão na entrega?' : 'Vai pagar como? Dinheiro, cartão na entrega ou Pix?');
  else if (limpo.pagamento === 'online') {
    pendente(online
      ? `Cartão online é só pelo nosso site 👉 ${linkSite}\nPor aqui dá pra pagar no Pix (te mando o código) ou em dinheiro/cartão na entrega. Qual prefere?`
      : 'Por aqui eu fecho com dinheiro, cartão na entrega ou Pix. Qual prefere?');
  } else if (limpo.pagamento === 'dinheiro' && limpo.troco > 0 && limpo.troco < res.total) {
    pendente(`O troco precisa ser pra um valor maior que o total (${brl(res.total)}). Troco pra quanto?`);
  }
  return res;
}

// ── RESUMO (o cliente confirma em cima DESTE texto) ─────────────
function textoResumo(v) {
  const r = v.rascunho;
  const L = ['📝 *Resumo do pedido*', ''];
  v.montado.itens.forEach((i) => L.push(`• ${i}`));
  L.push('');
  if (r.tipo === 'delivery') {
    L.push(`Subtotal: ${brl(v.montado.sub)}`);
    L.push(`Entrega (${v.bairro}): ${brl(v.frete)}`);
  }
  L.push(`*Total: ${brl(v.total)}*`);
  L.push('');
  L.push(r.tipo === 'delivery'
    ? `🛵 Entrega: ${r.rua}, ${r.numero}${r.complemento ? ', ' + r.complemento : ''} — ${v.bairro}`
    : '🏃 Retirada no local');
  const pixOnline = r.pagamento === 'pix' && CD.pagamentoOnlineAtivo();
  const pag = { dinheiro: 'Dinheiro', cartao: 'Cartão na entrega', pix: pixOnline ? 'Pix (te mando o código aqui)' : 'Pix' }[r.pagamento];
  L.push(`💳 ${pag}${r.pagamento === 'dinheiro' && r.troco ? ` (troco pra ${brl(r.troco)})` : ''}`);
  L.push(`👤 ${r.nome}`);
  if (r.obs) L.push(`📝 Obs: ${r.obs}`);
  L.push('');
  L.push(pixOnline
    ? 'Tá tudo certo? Responde *SIM* que eu te mando o Pix ⚡'
    : 'Tá tudo certo? Responde *SIM* que eu mando pra cozinha 🔥');
  return L.join('\n');
}

// ── GRAVAÇÃO ────────────────────────────────────────────────────
// Campos de dadosPedido() do cliente (sem número, status e horários).
// pag: o do rascunho, ou 'online_pix' no Pix pelo Mercado Pago (pix.js).
function dadosPedido(v, numeroWhatsApp, pag) {
  const r = v.rascunho;
  const delivery = r.tipo === 'delivery';
  const forma = pag || r.pagamento;
  return {
    nome: r.nome,
    tel: telefoneFormatado(numeroWhatsApp),
    tipo: r.tipo,
    bairro: delivery ? v.bairro : '',
    endereco: delivery ? `${r.rua}, ${r.numero}${r.complemento ? ', ' + r.complemento : ''}` : '',
    cidade: delivery ? r.cidade : '',
    pag: forma,
    troco: forma === 'dinheiro' ? r.troco : 0,
    frete: delivery ? v.frete : 0,
    desconto: 0,
    cupom: '',
    obs: r.obs,
    itens: v.montado.itens,
    total: v.total,
    origem: 'whatsapp',
  };
}

// v = resultado de conferir() sem pendência. FV = FieldValue de firebase-admin/firestore.
async function gravarPedido(db, FV, v, numeroWhatsApp) {
  // Número sequencial: o MESMO contador do site, balcão e mesa.
  const contRef = db.collection('config').doc('contador');
  const numOrdem = await db.runTransaction(async (t) => {
    const d = await t.get(contRef);
    const next = (d.exists ? d.data().ultimo || 0 : 0) + 1;
    t.set(contRef, { ultimo: next }, { merge: true });
    return next;
  });
  const num = '#' + String(numOrdem).padStart(3, '0');
  const horaStr = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: CD.TZ });

  // Mesmos campos de dadosPedido() + finalizarPedido() do cliente.
  const pedido = {
    id: numOrdem, num,
    ...dadosPedido(v, numeroWhatsApp),
    status: 'novo',
    hora: FV.serverTimestamp(),
    horaStr,
    impresso: false,
    criadoEm: FV.serverTimestamp(),
  };
  const ref = await db.collection('pedidos').add(pedido);

  // Baixa de estoque: mesma regra de baixarEstoque() (só itens no modo quantidade).
  await baixarEstoque(db, v.montado.consumo).catch((e) => console.error('[pedido] baixa de estoque:', e.message));
  await upsertCliente(db, FV, pedido).catch((e) => console.error('[pedido] CRM:', e.message));
  return { num, pedidoId: ref.id, pedido };
}

async function baixarEstoque(db, consumo) {
  if (!consumo || !Object.keys(consumo).length) return;
  const ref = db.collection('cardapio').doc('estoque');
  await db.runTransaction(async (t) => {
    const snap = await t.get(ref);
    if (!snap.exists) return;
    const data = snap.data().data || {};
    let mudou = false;
    Object.entries(consumo).forEach(([id, qty]) => {
      const e = data[id];
      if (e && e.modo === 'qtd') { e.qtd = Math.max(0, (e.qtd || 0) - qty); mudou = true; }
    });
    if (mudou) t.set(ref, { data }, { merge: true });
  });
}

// Porte de upsertCliente() de shared/crm.js (1 doc por telefone em `clientes`).
async function upsertCliente(db, FV, pedido) {
  const tel = String(pedido.tel || '').replace(/\D/g, '');
  if (tel.length < 10) return;
  const ref = db.collection('clientes').doc(tel);
  const agora = FV.serverTimestamp();
  const total = Number(pedido.total) || 0;
  const primeiroItem = (pedido.itens && pedido.itens[0]) || '';
  await db.runTransaction(async (t) => {
    const doc = await t.get(ref);
    if (doc.exists) {
      const d = doc.data();
      const qtd = (d.quantidadePedidos || 0) + 1;
      const gasto = Math.round(((d.valorTotalGasto || 0) + total) * 100) / 100;
      t.update(ref, {
        nome: pedido.nome || d.nome || '',
        telefone: pedido.tel || d.telefone || '',
        endereco: pedido.endereco || d.endereco || '',
        dataUltimaCompra: agora,
        quantidadePedidos: qtd,
        valorTotalGasto: gasto,
        ticketMedio: Math.round((gasto / qtd) * 100) / 100,
        ultimoProdutoComprado: primeiroItem,
        atualizadoEm: agora,
      });
    } else {
      t.set(ref, {
        nome: pedido.nome || '', telefone: pedido.tel || '', email: '', endereco: pedido.endereco || '',
        dataPrimeiraCompra: agora, dataUltimaCompra: agora,
        quantidadePedidos: 1, valorTotalGasto: total, ticketMedio: total,
        ultimoProdutoComprado: primeiroItem, criadoEm: agora, atualizadoEm: agora,
      });
    }
  });
}

// Cadastro do CRM (nome/endereço do último pedido) pra IA já saber quem é.
async function buscarCliente(db, numeroWhatsApp) {
  const tel = telefoneLimpo(numeroWhatsApp);
  if (tel.length < 10) return null;
  try {
    const d = await db.collection('clientes').doc(tel).get();
    return d.exists ? { nome: d.data().nome || '', endereco: d.data().endereco || '' } : null;
  } catch (e) { return null; }
}

module.exports = {
  conferir, textoResumo, dadosPedido, gravarPedido, buscarCliente, telefoneLimpo, telefoneFormatado, brl,
  COMBO_SUCO_EXTRA, COMBO_PADRAO,
};
