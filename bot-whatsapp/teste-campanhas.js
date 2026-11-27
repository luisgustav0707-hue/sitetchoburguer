// ═══════════════════════════════════════════════════════════════
// TESTE LOCAL DAS CAMPANHAS — sem WhatsApp e sem Firestore
// ───────────────────────────────────────────────────────────────
// Banco e WhatsApp de mentira (em memória): nada sai deste PC.
// Roda junto com o teste do atendente:  npm test
// ═══════════════════════════════════════════════════════════════

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { iniciarCampanhas, comRodape, horaSP, diaSP } = require('./campanhas');
const { querSair, criarAtendente } = require('./atendente');
const CD = require('./cardapio');
const CONV = require('./conversas');

// ── Firestore de mentira (caminhos, subcoleções, where ==, transação) ──
const INC = Symbol('inc');
const FV = { serverTimestamp: () => ({ toMillis: () => Date.now() }), increment: (n) => ({ [INC]: n }) };
function fakeDb(inicial = {}) {
  const store = new Map(Object.entries(inicial));
  const ouvintes = [];   // { col, campo, valor, fn }
  const filhos = (col) => [...store.keys()].filter((k) => k.startsWith(col + '/') && !k.slice(col.length + 1).includes('/'));
  const avisar = () => ouvintes.forEach((o) => setImmediate(() => o.fn(consulta(o.col, o.campo, o.valor))));
  const docSnap = (p) => ({ id: p.split('/').pop(), exists: store.has(p), data: () => store.get(p) && { ...store.get(p) }, ref: doc(p) });
  function consulta(col, campo, valor, lim = Infinity) {
    const docs = filhos(col).filter((k) => store.get(k)[campo] === valor).slice(0, lim).map(docSnap);
    return { empty: !docs.length, docs, size: docs.length };
  }
  function aplicar(p, campos) {
    if (!store.has(p)) { const e = new Error('No document to update: ' + p); e.code = 'not-found'; throw e; }
    const d = JSON.parse(JSON.stringify(store.get(p)));
    for (const [k, v] of Object.entries(campos)) {
      const partes = k.split('.');
      let alvo = d;
      partes.slice(0, -1).forEach((x) => { alvo[x] = alvo[x] || {}; alvo = alvo[x]; });
      const f = partes[partes.length - 1];
      alvo[f] = v && v[INC] !== undefined ? (Number(alvo[f]) || 0) + v[INC] : v;
    }
    store.set(p, d);
    avisar();
  }
  function doc(p) {
    return {
      id: p.split('/').pop(), path: p,
      get: async () => docSnap(p),
      set: async (d) => { store.set(p, { ...d }); avisar(); },
      update: async (c) => aplicar(p, c),
      collection: (c) => col(`${p}/${c}`),
    };
  }
  function col(c) {
    return {
      doc: (id) => doc(`${c}/${id}`),
      where: (campo, op, valor) => ({
        limit: (n) => ({ get: async () => consulta(c, campo, valor, n) }),
        get: async () => consulta(c, campo, valor),
        onSnapshot: (fn) => { const o = { col: c, campo, valor, fn }; ouvintes.push(o); setImmediate(() => fn(consulta(c, campo, valor))); return () => ouvintes.splice(ouvintes.indexOf(o), 1); },
      }),
    };
  }
  return {
    store,
    collection: col,
    runTransaction: async (fn) => fn({ get: (r) => r.get(), update: (r, c) => aplicar(r.path, c) }),
  };
}

const espera = (ms) => new Promise((r) => setTimeout(r, ms));
async function ate(cond, ms = 3000) {
  const fim = Date.now() + ms;
  while (Date.now() < fim) { if (cond()) return; await espera(5); }
  throw new Error('tempo esgotado esperando a condição');
}

// 27/11/2026 14:00 em Brasília (dentro do horário de envio)
const MEIO_DIA = Date.parse('2026-11-27T14:00:00-03:00');
const envio = (tel, msg, extra = {}) => ({ nome: 'X', tel, clienteId: tel, mensagem: msg, codigo: '', status: 'pendente', ...extra });
const camp = (extra = {}) => ({ nome: 'Teste', bot: true, comando: 'enviar', ts: 1, totalClientes: 0, progresso: { estado: 'aguardando', obs: '', enviados: 0, falhas: 0, semWhatsapp: 0, pulados: 0 }, ...extra });

function montar(db, opts = {}) {
  const enviadas = [];
  const contexto = [];
  const arquivo = path.join(os.tmpdir(), `tcho-camp-${process.pid}-${Math.random().toString(36).slice(2)}.json`);
  const c = iniciarCampanhas({
    db, FieldValue: FV, uid: 'pc1',
    pronto: () => (opts.pronto ? opts.pronto() : true),
    resolverChat: async (n) => (opts.semWhats && opts.semWhats.includes(n) ? null : `${n}@c.us`),
    enviar: async (chatId, texto) => { if (opts.falhar && opts.falhar(chatId)) throw new Error('falhou de mentira'); enviadas.push({ chatId, texto }); },
    aoEnviar: (chatId, texto, numero) => contexto.push({ chatId, numero }),
    arquivo, agora: opts.agora || (() => MEIO_DIA), intervalo: () => 1, pausaPulo: 1, limiteDia: opts.limiteDia || 60,
    log: () => {},
  });
  return { c, enviadas, contexto, arquivo };
}

let ok = 0;
async function caso(nome, fn) {
  try { await fn(); ok++; console.log('  ✅', nome); }
  catch (e) { console.log('  ❌', nome, '\n     ', e.stack.split('\n').slice(0, 3).join('\n      ')); process.exitCode = 1; }
}

(async () => {
  console.log('\nTeste local das campanhas (tudo em memória)\n');

  await caso('horário e dia de Brasília', async () => {
    assert.strictEqual(horaSP(MEIO_DIA), 14);
    assert.strictEqual(horaSP(Date.parse('2026-11-27T02:30:00Z')), 23);       // 23h30 de 26/11 em SP
    assert.strictEqual(diaSP(Date.parse('2026-11-27T02:30:00Z')), '2026-11-26');
  });

  await caso('rodapé do SAIR entra uma vez só', async () => {
    assert.match(comRodape('Oi!'), /responda SAIR\._$/);
    assert.strictEqual(comRodape('Oi! Responda SAIR pra parar'), 'Oi! Responda SAIR pra parar');
  });

  await caso('manda pra todos, pula SAIR / promo recente / sem WhatsApp, conta e conclui', async () => {
    const db = fakeDb({
      'campanhas/c1': camp({ totalClientes: 5 }),
      'campanhas/c1/envios/31999990001': envio('31999990001', 'Oi, Ana! Cupom ANA10'),
      'campanhas/c1/envios/31999990002': envio('31999990002', 'Oi, Bia!'),
      'campanhas/c1/envios/31999990003': envio('31999990003', 'Oi, Caio!'),
      'campanhas/c1/envios/31999990004': envio('31999990004', 'Oi, Duda!'),
      'campanhas/c1/envios/3133334444': envio('3133334444', 'Oi, Edu!'),
      'clientes/31999990001': { nome: 'Ana' },
      'clientes/31999990002': { nome: 'Bia', semPromo: true },
      'clientes/31999990003': { nome: 'Caio', ultimaPromoEm: MEIO_DIA - 2 * 86400000 },
      'clientes/31999990004': { nome: 'Duda', ultimaPromoEm: MEIO_DIA - 8 * 86400000 },
    });
    const { c, enviadas, contexto } = montar(db, { semWhats: ['553133334444'] });
    await ate(() => (db.store.get('campanhas/c1').progresso || {}).estado === 'concluida');
    c.parar();
    assert.deepStrictEqual(enviadas.map((e) => e.chatId).sort(), ['5531999990001@c.us', '5531999990004@c.us']);
    assert.match(enviadas.find((e) => e.chatId.startsWith('5531999990001')).texto, /^Oi, Ana! Cupom ANA10\n\n_Pra não receber mais promoções, responda SAIR\._$/);
    const p = db.store.get('campanhas/c1').progresso;
    assert.deepStrictEqual({ enviados: p.enviados, pulados: p.pulados, semWhatsapp: p.semWhatsapp, falhas: p.falhas }, { enviados: 2, pulados: 2, semWhatsapp: 1, falhas: 0 });
    const st = (t) => db.store.get(`campanhas/c1/envios/${t}`).status;
    assert.deepStrictEqual([st('31999990001'), st('31999990002'), st('31999990003'), st('31999990004'), st('3133334444')], ['enviado', 'saiu', 'recente', 'enviado', 'sem-whatsapp']);
    assert.strictEqual(db.store.get('campanhas/c1/envios/31999990001').bot, 'pc1');
    assert.ok(db.store.get('clientes/31999990001').ultimaPromoEm, 'marca a última promoção no CRM');
    assert.strictEqual(contexto.length, 2, 'avisa o atendente de cada envio');
  });

  await caso('limite por dia: para no limite e avisa no painel', async () => {
    const ini = {};
    for (let i = 0; i < 5; i++) ini[`campanhas/c2/envios/3199999100${i}`] = envio(`3199999100${i}`, `Oi ${i}`);
    const db = fakeDb({ 'campanhas/c2': camp(), ...ini });
    const { c, enviadas, arquivo } = montar(db, { limiteDia: 3 });
    await ate(() => /Limite de 3 mensagens/.test((db.store.get('campanhas/c2').progresso || {}).obs || ''));
    c.parar();
    assert.strictEqual(enviadas.length, 3);
    assert.strictEqual(db.store.get('campanhas/c2').progresso.estado, 'aguardando');
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(arquivo, 'utf8')), { dia: '2026-11-27', qtd: 3 });
    // reiniciou o bot no mesmo dia: o limite continua valendo
    const c2 = iniciarCampanhas({ db, FieldValue: FV, pronto: () => true, resolverChat: async (n) => n, enviar: async () => { throw new Error('não devia enviar'); }, arquivo, agora: () => MEIO_DIA + 3600000, intervalo: () => 1, pausaPulo: 1, limiteDia: 3, log: () => {} });
    assert.strictEqual(c2.enviadasHoje(), 3);
    await espera(30);
    c2.parar();
    assert.strictEqual(Object.keys(Object.fromEntries(db.store)).filter((k) => k.startsWith('campanhas/c2/envios/') && db.store.get(k).status === 'pendente').length, 2);
    // no dia seguinte zera
    const c3 = iniciarCampanhas({ db, FieldValue: FV, pronto: () => false, resolverChat: async (n) => n, enviar: async () => {}, arquivo, agora: () => MEIO_DIA + 86400000, intervalo: () => 1, pausaPulo: 1, limiteDia: 3, log: () => {} });
    assert.strictEqual(c3.enviadasHoje(), 0);
    c3.parar();
  });

  await caso('fora do horário não envia nada', async () => {
    const db = fakeDb({ 'campanhas/c3': camp(), 'campanhas/c3/envios/31999992000': envio('31999992000', 'Oi') });
    const { c, enviadas } = montar(db, { agora: () => Date.parse('2026-11-27T22:30:00-03:00') });
    await ate(() => /Fora do horário/.test((db.store.get('campanhas/c3').progresso || {}).obs || ''));
    c.parar();
    assert.strictEqual(enviadas.length, 0);
    assert.strictEqual(db.store.get('campanhas/c3/envios/31999992000').status, 'pendente');
  });

  await caso('WhatsApp desconectado: espera, não gasta os envios', async () => {
    const db = fakeDb({ 'campanhas/c4': camp(), 'campanhas/c4/envios/31999993000': envio('31999993000', 'Oi') });
    const { c, enviadas } = montar(db, { pronto: () => false });
    await ate(() => /Esperando o WhatsApp/.test((db.store.get('campanhas/c4').progresso || {}).obs || ''));
    c.parar();
    assert.strictEqual(enviadas.length, 0);
    assert.strictEqual(db.store.get('campanhas/c4/envios/31999993000').status, 'pendente');
  });

  await caso('pausar e cancelar pelo painel', async () => {
    const ini = {};
    for (let i = 0; i < 4; i++) ini[`campanhas/c5/envios/3199999400${i}`] = envio(`3199999400${i}`, `Oi ${i}`);
    const db = fakeDb({ 'campanhas/c5': camp({ comando: 'pausar' }), ...ini });
    const { c, enviadas } = montar(db);
    await ate(() => db.store.get('campanhas/c5').progresso.estado === 'pausada');
    await espera(20);
    assert.strictEqual(enviadas.length, 0, 'pausada não envia');
    await db.collection('campanhas').doc('c5').update({ comando: 'enviar' });
    await ate(() => enviadas.length >= 1);
    await db.collection('campanhas').doc('c5').update({ comando: 'cancelar' });
    await ate(() => db.store.get('campanhas/c5').progresso.estado === 'cancelada');
    const n = enviadas.length;
    await espera(30);
    c.parar();
    assert.strictEqual(enviadas.length, n, 'cancelada não envia mais');
    assert.ok(n < 4);
  });

  await caso('falha de envio marca o cliente e segue pros próximos', async () => {
    const db = fakeDb({
      'campanhas/c6': camp(),
      'campanhas/c6/envios/31999995001': envio('31999995001', 'Oi 1'),
      'campanhas/c6/envios/31999995002': envio('31999995002', 'Oi 2'),
    });
    const { c, enviadas } = montar(db, { falhar: (id) => id.startsWith('5531999995001') });
    await ate(() => db.store.get('campanhas/c6').progresso.estado === 'concluida');
    c.parar();
    assert.strictEqual(enviadas.length, 1);
    assert.strictEqual(db.store.get('campanhas/c6/envios/31999995001').status, 'falhou');
    assert.match(db.store.get('campanhas/c6/envios/31999995001').erro, /falhou de mentira/);
    assert.strictEqual(db.store.get('campanhas/c6').progresso.falhas, 1);
  });

  await caso('campanha antiga vai antes; outro PC já reservou → não manda de novo', async () => {
    const db = fakeDb({
      'campanhas/nova': camp({ ts: 20 }),
      'campanhas/nova/envios/31999996001': envio('31999996001', 'Nova'),
      'campanhas/velha': camp({ ts: 10 }),
      'campanhas/velha/envios/31999996002': envio('31999996002', 'Velha'),
      'campanhas/velha/envios/31999996003': envio('31999996003', 'Já foi', { status: 'enviando', bot: 'pc2' }),
    });
    const { c, enviadas } = montar(db);
    await ate(() => db.store.get('campanhas/nova').progresso.estado === 'concluida');
    c.parar();
    assert.deepStrictEqual(enviadas.map((e) => e.texto.split('\n')[0]), ['Velha', 'Nova']);
  });

  await caso('SAIR: frases que contam e que não contam', async () => {
    ['SAIR', 'sair', 'Sair.', 'PARAR', 'Não quero mais receber promoções', 'nao quero receber mensagens', 'pare de mandar mensagem', 'stop 🙏']
      .forEach((t) => assert.ok(querSair(t), `devia sair: ${t}`));
    ['sair pra buscar', 'quero sair do combo', 'parar no caminho', 'quero um x-bacon', 'não quero cebola']
      .forEach((t) => assert.ok(!querSair(t), `não devia sair: ${t}`));
  });

  await caso('cliente responde SAIR → marca no CRM e confirma; promoção entra no contexto', async () => {
    const TCHO = require(path.join(__dirname, '..', 'shared', 'dados.js'));
    CD._carregarParaTeste(TCHO, { opcoes: { data: {} }, estoque: { data: {} }, bairros: { lista: TCHO.bairros } }, { forcarAberta: true, deliveryAtivo: true, retiradaAtiva: true });
    const db = fakeDb({ 'clientes/31999997001': { nome: 'Gabi' } });
    const enviadas = [];
    const ia = { entender: async () => { throw new Error('a IA não devia ser chamada'); } };
    const at = criarAtendente({ db, FieldValue: FV, ia, enviar: async (chatId, texto) => enviadas.push({ chatId, texto }) });
    at.campanhaEnviada('g@c.us', '5531999997001', 'Oi, Gabi! Cupom GABI10');
    const conv = CONV.obter('g@c.us');
    assert.strictEqual(conv.boasVindas, true);
    assert.deepStrictEqual(conv.historico[0], { quem: 'bot', texto: 'Oi, Gabi! Cupom GABI10' });
    await at.receber({ chatId: 'g@c.us', numero: '5531999997001', tipo: 'texto', texto: 'SAIR' });
    assert.strictEqual(db.store.get('clientes/31999997001').semPromo, true);
    assert.match(enviadas[enviadas.length - 1].texto, /não vai mais receber promoções/);
  });

  console.log(`\n${ok} casos ok${process.exitCode ? ' (com falhas acima)' : ''}\n`);
  process.exit(process.exitCode || 0);
})();
