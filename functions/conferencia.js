// ═══════════════════════════════════════════════════════════════
// CONFERÊNCIA DO PEDIDO ONLINE
// ───────────────────────────────────────────────────────────────
// O pedido do site é montado no navegador do cliente — itens, preços e total
// vêm de lá e qualquer um pode alterar. No pagamento online isso é dinheiro:
// sem conferência, dava pra pagar R$1 num pedido de R$80.
//
// Por isso, no Pix/cartão online, o site manda também o CARRINHO (só ids e
// escolhas) e este módulo, com os preços do cardápio:
//   • remonta a lista de itens que vai pra cozinha (o texto do navegador é
//     descartado — senão bastaria mandar um carrinho barato e um texto caro);
//   • calcula o mínimo que o pedido custa (itens − cupom);
//   • aponta o que não bateu.
// Não bloqueia o pagamento: se o preço mudou com o cliente já na página, ele
// pagaria e ficaria travado. O pedido entra com `conferirValor` e o painel e
// o cupom mostram "⚠ CONFERIR VALOR".
//
// Fora daqui fica o frete: a taxa por km é calculada no navegador e não dá
// pra refazer. Quem zerar o frete só ganha a entrega — o painel mostra o
// valor do frete do pedido como sempre.
//
// O cardápio base é o MESMO shared/dados.js que o site usa (baixado do site
// publicado), mais as edições que o admin grava em cardapio/* — igual ao
// início de cliente/cliente.js. Mexeu nessas regras lá? Replique aqui.
// ═══════════════════════════════════════════════════════════════

const vm = require('vm');

const SITE = 'https://tchoburguer.com';
const COMBO_SUCO_EXTRA = 2;            // mesmo valor de cliente/cliente.js
const COMBO_PADRAO = 15;               // fallback do preço do combo (cliente.js)
const MAX_ITENS = 60;

// shared/dados.js do site publicado, com cache de 5 min. Roda num contexto
// isolado só pra ler o objeto TCHO (o arquivo é nosso, servido pelo site).
let cacheBase = null;
let cacheEm = 0;
async function baseCardapio() {
  if (cacheBase && Date.now() - cacheEm < 5 * 60000) return cacheBase;
  const resp = await fetch(`${SITE}/shared/dados.js?t=${Date.now()}`);
  if (!resp.ok) throw new Error(`dados.js HTTP ${resp.status}`);
  const ctx = { module: {} };
  vm.runInNewContext(await resp.text(), ctx, { timeout: 1000 });
  const T = ctx.module.exports;
  if (!T || !Array.isArray(T.burguers) || !Array.isArray(T.extras)) throw new Error('dados.js sem cardápio');
  cacheBase = JSON.parse(JSON.stringify(T));
  cacheEm = Date.now();
  return cacheBase;
}

// Cardápio como o cliente vê: base + edições do admin + produtos custom + promoção.
async function carregarCardapio(db) {
  const T = JSON.parse(JSON.stringify(await baseCardapio()));
  const col = db.collection('cardapio');
  const nomes = ['prods_edits', 'prods_custom', 'adicionais', 'ing_edits', 'opcoes', 'promo'];
  const snaps = await db.getAll(...nomes.map((n) => col.doc(n)));
  const doc = {};
  nomes.forEach((n, i) => { doc[n] = snaps[i].exists ? snaps[i].data() : {}; });

  const edits = doc.prods_edits.data || {};
  [...T.burguers, ...T.extras].forEach((it) => {
    const e = edits[it.id];
    if (!e) return;
    if (e.nome) it.nome = e.nome;
    if (e.preco !== undefined) it.preco = e.preco;
  });
  const ings = doc.ing_edits.data || {};
  T.burguers.forEach((b) => { if (ings[b.id]) b.ing = ings[b.id]; });
  const adicionais = Array.isArray(doc.adicionais.lista) ? doc.adicionais.lista : T.adicionais;

  const burguers = new Map(T.burguers.map((b) => [b.id, b]));
  const extras = new Map(T.extras.map((e) => [e.id, e]));
  (Array.isArray(doc.prods_custom.lista) ? doc.prods_custom.lista : [])
    .filter((p) => p && p.ativo !== false && p.id)
    .forEach((p) => {
      const prod = { id: p.id, nome: p.n || p.nome, preco: p.p !== undefined ? p.p : p.preco, opcoes: p.opcoes || [], ing: [] };
      const cat = String(p.cat || '');
      if (p.tipo === 'b' || cat === 'b' || cat === 'burguers') burguers.set(prod.id, prod);
      else extras.set(prod.id, prod);
    });

  // Promoção do Marketing (mesma regra de atualizarPromocoes() no cliente)
  const promo = doc.promo;
  if (promo && promo.ativo) {
    const prod = promo.produtoId ? (burguers.get(promo.produtoId) || extras.get(promo.produtoId)) : null;
    const temPreco = promo.precoPromo !== undefined && promo.precoPromo !== null && String(promo.precoPromo).trim() !== '';
    const precoPromo = temPreco ? Number(promo.precoPromo) : null;
    const preco = precoPromo !== null && !isNaN(precoPromo) ? precoPromo : (prod ? prod.preco : null);
    if (preco !== null && !isNaN(preco)) {
      extras.set('promo_main', { id: 'promo_main', nome: String(promo.titulo || '').trim() || (prod ? prod.nome : 'Promoção'), preco, opcoes: [] });
    }
  }

  const opcoesSalvas = doc.opcoes.data || {};
  const opcoes = (id) => {
    if (opcoesSalvas[id] !== undefined) return opcoesSalvas[id];
    const e = extras.get(id);
    return (e && e.opcoes) || [];
  };
  return { burguers, extras, adicionais, opcoes, pontos: T.pontos || [], saches: T.saches || [] };
}

const txt = (v) => String(v == null ? '' : v).slice(0, 40);

// Remonta itens, subtotal e consumo de estoque a partir do carrinho.
// Devolve null se o carrinho nem tem o formato esperado.
function montarDoCarrinho(car, C) {
  if (!car || typeof car !== 'object') return null;
  const bs = Array.isArray(car.burguers) ? car.burguers : [];
  const ex = car.extras && typeof car.extras === 'object' && !Array.isArray(car.extras) ? car.extras : {};
  if (bs.length + Object.keys(ex).length === 0 || bs.length > MAX_ITENS) return null;

  const itens = [];
  const motivos = [];
  const consumo = {};
  let sub = 0;
  const usar = (id, n) => { consumo[id] = (consumo[id] || 0) + n; };
  const cmb = C.extras.get('cmb');
  const comboPreco = (cmb && Number(cmb.preco)) || COMBO_PADRAO;

  for (const inst of bs) {
    const b = inst && C.burguers.get(inst.id);
    if (!b) { motivos.push(`produto inexistente (${txt(inst && inst.id)})`); continue; }
    const ponto = C.pontos.find((p) => p.id === inst.ponto);
    const sache = C.saches.find((s) => s.id === inst.sache);
    const pedidos = Array.isArray(inst.removidos) ? inst.removidos.map(txt) : [];
    const removidos = pedidos.filter((r) => (b.ing || []).includes(r));
    if (removidos.length !== pedidos.length) motivos.push(`ingrediente fora da lista em ${b.nome}`);
    let precoAdic = 0;
    const adicNomes = [];
    for (const a of (Array.isArray(inst.adicionais) ? inst.adicionais : [])) {
      const ad = C.adicionais.find((x) => x.id === a) || C.adicionais.find((x) => x.nome === a);
      if (!ad) { motivos.push(`acréscimo desconhecido (${txt(a)})`); continue; }
      precoAdic += Number(ad.preco) || 0;
      adicNomes.push(ad.nome);
    }
    const det = [
      ponto ? ponto.nome : '',
      sache && sache.id !== 'sn' ? 'sachê ' + sache.nome : '',
      removidos.length ? 'sem ' + removidos.join(', ') : '',
      adicNomes.length ? adicNomes.map((n) => '+' + n).join(', ') : '',
    ].filter(Boolean).join(' • ');
    const precoBurguer = (Number(b.preco) || 0) + precoAdic;
    itens.push(`${b.nome}${det ? ' (' + det + ')' : ''} — R$${precoBurguer}`);
    sub += precoBurguer;
    usar(b.id, 1);
    if (inst.combo) {
      const suco = !!inst.suco;
      const sabor = txt(inst.combo);
      if (!C.opcoes(suco ? 'suc' : 'cmb').includes(sabor)) motivos.push(`sabor do combo fora da lista (${sabor})`);
      const t = comboPreco + (suco ? COMBO_SUCO_EXTRA : 0);
      itens.push(`Combo Batata + ${suco ? 'Suco' : 'Refri'} (${sabor}) — R$${t}`);
      sub += t;
      usar(suco ? 'suc' : 'rla', 1);
      usar('bat', 1);
    }
  }

  for (const [id, v] of Object.entries(ex)) {
    const e = C.extras.get(id);
    if (!e) { motivos.push(`produto inexistente (${txt(id)})`); continue; }
    const preco = Number(e.preco) || 0;
    if (Array.isArray(v)) {
      if (!v.length || v.length > MAX_ITENS) { motivos.push(`quantidade inválida em ${e.nome}`); continue; }
      const lista = C.opcoes(id);
      v.forEach((s) => {
        const sabor = txt(s);
        if (lista.length && !lista.includes(sabor)) motivos.push(`opção fora da lista em ${e.nome} (${sabor})`);
        itens.push(`${e.nome} (${sabor}) — R$${preco}`);
        sub += preco;
      });
      usar(id, v.length);
    } else {
      const q = Number(v);
      if (!Number.isInteger(q) || q < 1 || q > MAX_ITENS) { motivos.push(`quantidade inválida em ${e.nome}`); continue; }
      itens.push(`${e.nome} x${q} — R$${preco * q}`);
      sub += preco * q;
      usar(id, q);
    }
  }
  if (!itens.length) return null;
  return { itens, sub, consumo, motivos };
}

// Desconto que o cupom dá de verdade (mesma conta do getTotal() do cliente),
// só se o cupom ainda vale.
function descontoCupom(cupom, sub) {
  if (!cupom || cupom.ativo === false) return 0;
  if (cupom.validade) {
    const fim = new Date(cupom.validade + 'T23:59:59-03:00');
    if (!isNaN(fim) && fim < new Date()) return 0;
  }
  if (cupom.minimo > 0 && sub < cupom.minimo) return 0;
  if (cupom.tipo === 'pct') return Math.round(sub * (Number(cupom.valor) || 0) / 100);
  if (cupom.tipo === 'fixo') return Number(cupom.valor) || 0;
  return 0;                           // 'frete': zera o frete, que não entra na conta
}

const centavos = (v) => Math.round(Number(v) * 100);

// pg = doc de pagamentos/{id}. Devolve o que muda no pedido:
//   { itens?, consumo?, desconto?, conferirValor? }
async function conferirPedido(db, pg) {
  const pago = Number(pg.total) || 0;
  if (!pg.carrinho) {
    return { conferirValor: { esperado: null, pago, motivos: ['pedido sem carrinho — conferir itens e valor'] } };
  }
  const C = await carregarCardapio(db);
  const m = montarDoCarrinho(pg.carrinho, C);
  if (!m) return { conferirValor: { esperado: null, pago, motivos: ['carrinho inválido — conferir itens e valor'] } };

  let cupom = null;
  if (pg.cupomId && /^[A-Za-z0-9_-]{1,80}$/.test(pg.cupomId)) {
    const s = await db.collection('cupons').doc(pg.cupomId).get();
    if (s.exists) cupom = s.data();
  }
  const desconto = descontoCupom(cupom, m.sub);
  const esperado = Math.max(0, m.sub - desconto);
  // "itens R$X, pago R$Y" o painel já mostra a partir de esperado/pago
  const motivos = [...m.motivos];
  if (centavos(pago) < centavos(esperado)) motivos.unshift('valor pago menor que os itens');

  const r = { itens: m.itens, consumo: m.consumo, desconto };
  if (motivos.length) r.conferirValor = { esperado, pago, motivos: motivos.slice(0, 10) };
  return r;
}

module.exports = { conferirPedido, montarDoCarrinho, descontoCupom, carregarCardapio };
