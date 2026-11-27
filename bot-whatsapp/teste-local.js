// ═══════════════════════════════════════════════════════════════
// TESTE LOCAL — fluxo inteiro sem WhatsApp, sem Gemini e sem Firestore
// ───────────────────────────────────────────────────────────────
// WhatsApp, IA e banco são de mentira (em memória): nada sai deste PC e
// nenhum pedido de verdade é criado. Roda com:  npm test
// ═══════════════════════════════════════════════════════════════

const assert = require('assert');
const path = require('path');
const CD = require('./cardapio');
const PED = require('./pedido');
const CONV = require('./conversas');
const { criarAtendente } = require('./atendente');

// ── Firestore de mentira ────────────────────────────────────────
function fakeDb(inicial = {}) {
  const store = new Map(Object.entries(JSON.parse(JSON.stringify(inicial))));
  let auto = 0;
  const copia = (x) => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));
  const write = (p, d, opt) => store.set(p, opt && opt.merge ? { ...(store.get(p) || {}), ...copia(d) } : copia(d));
  const docRef = (col, id) => ({
    id,
    get: async () => { const d = store.get(`${col}/${id}`); return { exists: !!d, id, data: () => copia(d) }; },
    set: async (d, o) => write(`${col}/${id}`, d, o),
    update: async (d) => write(`${col}/${id}`, d, { merge: true }),
  });
  return {
    store,
    collection: (col) => ({
      doc: (id) => docRef(col, id),
      add: async (d) => { const id = 'auto' + (++auto); write(`${col}/${id}`, d); return docRef(col, id); },
    }),
    runTransaction: async (fn) => fn({ get: (r) => r.get(), set: (r, d, o) => r.set(d, o), update: (r, d) => r.update(d) }),
  };
}
const fakeFieldValue = { serverTimestamp: () => '__serverTimestamp__' };

// ── Cardápio parecido com o de produção ─────────────────────────
const TCHO = require(path.join(__dirname, '..', 'shared', 'dados.js'));
const ESTOQUE = {
  rla: { modo: 'qtd', qtd: 2, ativo: true }, r15: { modo: 'inf', ativo: false, qtd: 0 },
  suc: { modo: 'qtd', ativo: false, qtd: 0 }, cmb: { modo: 'inf', ativo: true }, bat: { modo: 'inf', ativo: true, qtd: 10 },
  agu: { modo: 'qtd', ativo: true, qtd: 3 }, xbt: { modo: 'qtd', ativo: true, qtd: 0 },
};
const DOCS = () => ({
  opcoes: { data: { cmb: ['Coca cola'], rla: ['Coca Cola'], r15: ['Coca cola', 'Coca zero'], suc: [] } },
  estoque: { data: JSON.parse(JSON.stringify(ESTOQUE)) },
  bairros: { lista: TCHO.bairros },
});
const ABERTA = { forcarAberta: true, deliveryAtivo: true, retiradaAtiva: true, pagamentoOnline: false, prazoMin: 40, prazoMax: 60 };
CD._carregarParaTeste(TCHO, DOCS(), ABERTA);

// ── IA de mentira: devolve as respostas roteirizadas, em ordem ──
const roteiro = [];
let chamadasIA = 0;
const iaFake = { entender: async () => { chamadasIA++; const r = roteiro.shift(); if (!r) throw new Error('roteiro vazio'); return r; } };
const pedidoBase = (p) => ({ lanches: [], extras: [], tipo: '', nome: '', bairro: '', rua: '', numero: '', complemento: '', cidade: '', pagamento: '', troco: 0, obs: '', ...p });
const lanche = (p) => ({ id: 'xs', ponto: '', sache: '', removidos: [], adicionais: [], combo_sabor: '', combo_suco: false, ...p });

// ── WhatsApp de mentira ─────────────────────────────────────────
const enviadas = [];
const pausas = [];
const db = fakeDb({ 'config/contador': { ultimo: 580 }, 'cardapio/estoque': { data: ESTOQUE } });
const at = criarAtendente({ db, FieldValue: fakeFieldValue, ia: iaFake, enviar: async (chatId, texto) => enviadas.push({ chatId, texto }), aoPausar: (chatId) => pausas.push(chatId) });
const ultima = (chatId) => [...enviadas].reverse().find((e) => e.chatId === chatId)?.texto || '';
const fala = (chatId, texto, extra = {}) => at.receber({ chatId, numero: extra.numero || '5531999990001', tipo: 'texto', texto, ...extra });

let ok = 0;
async function caso(nome, fn) {
  try { await fn(); ok++; console.log('  ✅', nome); }
  catch (e) { console.log('  ❌', nome, '\n     ', e.message); process.exitCode = 1; }
}

(async () => {
  console.log('\nTeste local do atendente (tudo em memória)\n');

  await caso('pedido completo: delivery, combo, adicional, troco → grava #581', async () => {
    const chat = 'a@c.us';
    roteiro.push({ transcricao: '', acao: 'conversar', resposta: 'Show! Qual o ponto da carne e o sachê?', pedido: pedidoBase({ lanches: [lanche({})] }) });
    await fala(chat, 'quero um x-salada');
    assert.match(ultima(chat), /ponto da carne/);
    roteiro.push({
      transcricao: '', acao: 'mostrar_resumo', resposta: '(ignorado)',
      pedido: pedidoBase({
        lanches: [lanche({ ponto: 'Mal passado', sache: 'sa', adicionais: ['Bacon'], removidos: ['tomate'], combo_sabor: 'coca cola' })],
        extras: [{ id: 'agu', quantidade: 1, sabores: [] }],
        tipo: 'delivery', nome: 'João Teste', bairro: 'rio branco', rua: 'Rua A', numero: '10', complemento: 'casa', cidade: 'Belo Horizonte / MG',
        pagamento: 'dinheiro', troco: 100,
      }),
    });
    await fala(chat, 'mal passado, ketchup e maionese, com bacon sem tomate, combo coca, uma água, entrega rio branco rua A 10 casa, dinheiro troco pra 100, João Teste');
    const resumo = ultima(chat);
    assert.match(resumo, /Resumo do pedido/);
    assert.match(resumo, /X-Salada \(Mal passado • sachê Ketchup \+ Maionese • sem Tomate • \+Bacon\) — R\$30/);
    assert.match(resumo, /Combo Batata \+ Refri \(Coca cola\) — R\$15/);
    assert.match(resumo, /Entrega \(Rio Branco\): R\$4/);
    assert.match(resumo, /Total: R\$54/);          // 30 + 15 + 5 (água) + 4
    const antesIA = chamadasIA;
    await fala(chat, 'Sim!');
    assert.strictEqual(chamadasIA, antesIA, '"sim" não deveria passar pela IA');
    assert.match(ultima(chat), /Pedido \*#581\* confirmado/);
    assert.match(ultima(chat), /40–60 min/);
    const pedidos = [...db.store.entries()].filter(([k]) => k.startsWith('pedidos/')).map(([, v]) => v);
    assert.strictEqual(pedidos.length, 1);
    const p = pedidos[0];
    assert.deepStrictEqual(
      { id: p.id, num: p.num, nome: p.nome, tel: p.tel, tipo: p.tipo, bairro: p.bairro, endereco: p.endereco, pag: p.pag, troco: p.troco, frete: p.frete, total: p.total, status: p.status, impresso: p.impresso, desconto: p.desconto, cupom: p.cupom },
      { id: 581, num: '#581', nome: 'João Teste', tel: '(31) 99999-0001', tipo: 'delivery', bairro: 'Rio Branco', endereco: 'Rua A, 10, casa', pag: 'dinheiro', troco: 100, frete: 4, total: 54, status: 'novo', impresso: false, desconto: 0, cupom: '' });
    assert.strictEqual(p.criadoEm, '__serverTimestamp__');
    assert.strictEqual(p.hora, '__serverTimestamp__');
    assert.match(p.horaStr, /^\d{2}:\d{2}$/);
    assert.deepStrictEqual(p.itens, ['X-Salada (Mal passado • sachê Ketchup + Maionese • sem Tomate • +Bacon) — R$30', 'Combo Batata + Refri (Coca cola) — R$15', 'Água com Gás x1 — R$5']);
    assert.strictEqual(db.store.get('config/contador').ultimo, 581);
    const est = db.store.get('cardapio/estoque').data;
    assert.strictEqual(est.rla.qtd, 1, 'combo baixa 1 lata');
    assert.strictEqual(est.agu.qtd, 2, 'água baixa 1');
    const cli = db.store.get('clientes/31999990001');
    assert.ok(cli && cli.quantidadePedidos === 1 && cli.valorTotalGasto === 54, 'CRM atualizado');
  });

  await caso('combo com sabor que não está no painel (Fanta) sai e o cliente é avisado', async () => {
    const chat = 'b@c.us';
    roteiro.push({ transcricao: '', acao: 'mostrar_resumo', resposta: '', pedido: pedidoBase({ lanches: [lanche({ ponto: 'ap', sache: 'sn', combo_sabor: 'Fanta Laranja' })], tipo: 'retirada', nome: 'Ana', pagamento: 'cartao' }) });
    await fala(chat, 'x-salada ao ponto sem sachê com combo fanta, retirada, cartão, Ana');
    assert.match(ultima(chat), /Não temos agora: Combo com refri Fanta Laranja/);
    assert.doesNotMatch(ultima(chat), /Combo Batata/);
    assert.match(ultima(chat), /Total: R\$25/);
  });

  await caso('falta o ponto da carne → pergunta antes de resumir', async () => {
    const chat = 'c@c.us';
    roteiro.push({ transcricao: '', acao: 'mostrar_resumo', resposta: '', pedido: pedidoBase({ lanches: [lanche({ sache: 'sk' })], tipo: 'retirada', nome: 'Bia', pagamento: 'cartao' }) });
    await fala(chat, 'só isso');
    assert.match(ultima(chat), /Qual o ponto da carne do X-Salada/);
  });

  await caso('lanche esgotado (X-Bacon Triplo qtd 0) não entra', async () => {
    const chat = 'd@c.us';
    roteiro.push({ transcricao: '', acao: 'conversar', resposta: 'Anotado!', pedido: pedidoBase({ lanches: [lanche({ id: 'xbt', ponto: 'ap', sache: 'sn' })] }) });
    await fala(chat, 'um bacon triplo');
    assert.match(ultima(chat), /não temos agora X-Bacon Triplo/);
  });

  await caso('bairro fora da área → não calcula frete e oferece retirada', async () => {
    const chat = 'e@c.us';
    roteiro.push({ transcricao: '', acao: 'mostrar_resumo', resposta: '', pedido: pedidoBase({ lanches: [lanche({ ponto: 'ap', sache: 'sn' })], tipo: 'delivery', nome: 'Caio', bairro: 'Savassi', rua: 'Rua B', numero: '5', pagamento: 'cartao' }) });
    await fala(chat, 'manda pra savassi');
    assert.match(ultima(chat), /ainda não entregamos no bairro Savassi/);
  });

  await caso('Pix com pagamento online ligado → manda o link do site', async () => {
    CD._carregarParaTeste(TCHO, DOCS(), { ...ABERTA, pagamentoOnline: true });
    const chat = 'f@c.us';
    roteiro.push({ transcricao: '', acao: 'mostrar_resumo', resposta: '', pedido: pedidoBase({ lanches: [lanche({ ponto: 'ap', sache: 'sn' })], tipo: 'retirada', nome: 'Duda', pagamento: 'pix' }) });
    await fala(chat, 'pago no pix');
    assert.match(ultima(chat), /tchoburguer\.com\/cliente\//);
    CD._carregarParaTeste(TCHO, DOCS(), ABERTA);
  });

  await caso('estoque acaba entre o resumo e o "sim" → resumo novo, sem gravar', async () => {
    const chat = 'g@c.us';
    const antes = [...db.store.keys()].filter((k) => k.startsWith('pedidos/')).length;
    roteiro.push({ transcricao: '', acao: 'mostrar_resumo', resposta: '', pedido: pedidoBase({ lanches: [lanche({ ponto: 'ap', sache: 'sn' })], extras: [{ id: 'agu', quantidade: 1, sabores: [] }], tipo: 'retirada', nome: 'Edu', pagamento: 'cartao' }) });
    await fala(chat, 'x-salada e uma água, retirada, cartão, Edu');
    assert.match(ultima(chat), /Total: R\$30/);
    const docs = DOCS(); docs.estoque.data.agu.qtd = 0;            // acabou a água no admin
    CD._carregarParaTeste(TCHO, docs, ABERTA);
    await fala(chat, 'sim');
    assert.match(ultima(chat), /mudou uma coisinha/);
    assert.match(ultima(chat), /Não temos agora: Água com Gás/);
    assert.match(ultima(chat), /Total: R\$25/);
    assert.strictEqual([...db.store.keys()].filter((k) => k.startsWith('pedidos/')).length, antes);
    CD._carregarParaTeste(TCHO, DOCS(), ABERTA);
  });

  await caso('loja fechada → avisa o horário uma vez e não chama a IA', async () => {
    CD._carregarParaTeste(TCHO, DOCS(), { lojaAberta: false });
    const chat = 'h@c.us';
    const antesIA = chamadasIA, antesMsgs = enviadas.length;
    await fala(chat, 'boa noite, tá aberto?');
    await fala(chat, 'alô?');
    assert.strictEqual(chamadasIA, antesIA);
    assert.strictEqual(enviadas.length, antesMsgs + 1, 'avisa só uma vez');
    assert.match(ultima(chat), /estamos fechados/);
    CD._carregarParaTeste(TCHO, DOCS(), ABERTA);
  });

  await caso('cliente pede atendente → pausa e ignora as próximas', async () => {
    const chat = 'i@c.us';
    roteiro.push({ transcricao: '', acao: 'atendente', resposta: '', pedido: pedidoBase({}) });
    await fala(chat, 'quero falar com uma pessoa');
    assert.match(ultima(chat), /chamei alguém da equipe/);
    assert.ok(pausas.includes(chat));
    const antes = enviadas.length;
    await fala(chat, 'oi?');
    assert.strictEqual(enviadas.length, antes);
  });

  await caso('IA não entende 2 vezes seguidas → pausa', async () => {
    const chat = 'j@c.us';
    roteiro.push({ transcricao: '', acao: 'nao_entendi', resposta: 'Não entendi 😅', pedido: pedidoBase({}) });
    roteiro.push({ transcricao: '', acao: 'nao_entendi', resposta: 'Não entendi 😅', pedido: pedidoBase({}) });
    await fala(chat, 'asdkjh');
    assert.ok(!CONV.pausado(chat));
    await fala(chat, 'qwpoe');
    assert.ok(CONV.pausado(chat));
  });

  await caso('loja respondeu à mão → bot pausa na conversa', async () => {
    const chat = 'k@c.us';
    at.humanoRespondeu(chat);
    const antes = enviadas.length;
    await fala(chat, 'oi');
    assert.strictEqual(enviadas.length, antes);
  });

  await caso('áudio: usa a transcrição da IA no histórico', async () => {
    const chat = 'l@c.us';
    roteiro.push({ transcricao: 'quero um x-burguer', acao: 'conversar', resposta: 'Fechado! Ponto da carne?', pedido: pedidoBase({ lanches: [lanche({ id: 'xb' })] }) });
    await at.receber({ chatId: chat, numero: '5531999990002', tipo: 'audio', audio: 'T2dnUw==' });
    assert.match(ultima(chat), /Ponto da carne/);
    assert.strictEqual(CONV.obter(chat).historico[0].texto, '(áudio) quero um x-burguer');
  });

  await caso('IA fora do ar → mensagem amigável', async () => {
    const chat = 'm@c.us';
    await fala(chat, 'oi');           // roteiro vazio → IA de mentira dá erro
    assert.match(ultima(chat), /probleminha/);
  });

  await caso('telefone: número sem o 9 e com 55 vira (31) 9xxxx-xxxx', async () => {
    assert.strictEqual(PED.telefoneFormatado('553183094152'), '(31) 98309-4152');
    assert.strictEqual(PED.telefoneLimpo('5531983094152'), '31983094152');
  });

  await caso('avisos: etapa do Kanban → aviso certo (retirada x delivery)', async () => {
    const AV = require('./avisos');
    assert.strictEqual(AV.eventoDo({ status: 'novo', tipo: 'delivery' }), null);
    assert.strictEqual(AV.eventoDo({ status: 'prep', tipo: 'delivery' }), 'aceito');
    assert.strictEqual(AV.eventoDo({ status: 'pronto', tipo: 'delivery' }), 'aceito');
    assert.strictEqual(AV.eventoDo({ status: 'pronto', tipo: 'retirada' }), 'pronto');
    assert.strictEqual(AV.eventoDo({ status: 'entrega', tipo: 'delivery' }), 'entrega');
    assert.strictEqual(AV.eventoDo({ status: 'cancelado', tipo: 'delivery' }), 'cancelado');
    assert.strictEqual(AV.eventoDo({ status: 'finalizado', tipo: 'delivery', horaFim: '21:40' }), 'finalizado');
    assert.strictEqual(AV.eventoDo({ status: 'finalizado', tipo: 'retirada' }), null, 'balcão retroativo (sem horaFim)');
    assert.strictEqual(AV.numeroWhatsApp('(31) 98309-4152'), '5531983094152');
    assert.strictEqual(AV.numeroWhatsApp('123'), '');
    assert.strictEqual(AV.montarTexto(AV.PADRAO.aceito.texto, { nome: 'joão vitor', num: '#581' }),
      'Oi, João! 👋 Seu pedido #581 foi aceito e já está sendo preparado. 🍔');
    assert.strictEqual(AV.montarTexto(AV.PADRAO.entrega.texto, { nome: '', num: '#9' }),
      'Seu pedido #9 saiu para entrega! 🛵 Já já chega aí.');
  });

  await caso('avisos: 1 vez por etapa; pula mesa, mudança antiga e aviso desligado', async () => {
    const AV = require('./avisos');
    const espera = (ms) => new Promise((r) => setTimeout(r, ms));
    const docs = {};
    let ouvinte = null, opCb = null;
    const ts = (ms) => ({ toMillis: () => ms });
    const fdb = {
      collection: () => ({
        doc: (id) => ({
          _id: id,
          onSnapshot: (cb) => { opCb = cb; cb({ exists: false }); return () => {}; },
          get: async () => ({ exists: !!docs[id], data: () => docs[id] }),
        }),
        where: () => ({ onSnapshot: (cb) => { ouvinte = cb; return () => {}; } }),
      }),
      runTransaction: async (fn) => fn({
        get: async (ref) => ({ exists: !!docs[ref._id], data: () => docs[ref._id] }),
        update: (ref, campos) => { docs[ref._id] = { ...docs[ref._id], ...campos }; },
      }),
    };
    const env = [], pausados = [];
    let conectado = false;
    const av = AV.iniciarAvisos({
      db: fdb, FieldValue: { serverTimestamp: () => 'TS' }, pronto: () => conectado, log: () => {},
      resolverChat: async (n) => `${n}@c.us`,
      enviar: async (chat, txt) => { env.push([chat, txt]); },
      aoCancelar: async (chat) => { pausados.push(chat); },
    });
    const mudar = async (id, campos) => {
      docs[id] = { ...docs[id], ...campos };
      ouvinte({ docChanges: () => [{ type: 'modified', doc: { id, data: () => docs[id] } }] });
      await espera(20);
    };
    const agora = Date.now();
    await mudar('a', { num: '#1', nome: 'Ana', tel: '(31) 98888-7777', tipo: 'delivery', origem: 'site', status: 'prep', hora: ts(agora) });
    assert.strictEqual(env.length, 0, 'WhatsApp desconectado: espera');
    conectado = true; await av.aoConectar(); await espera(20);
    assert.deepStrictEqual(env.map((e) => e[0]), ['5531988887777@c.us']);
    assert.match(env[0][1], /Ana.*#1.*aceito/);
    await mudar('a', { status: 'pronto', hora: ts(agora) });   // delivery em "pronto": nada novo
    await mudar('a', { status: 'entrega', hora: ts(agora) });
    await mudar('a', { status: 'entrega', hora: ts(agora) });  // snapshot repetido
    assert.strictEqual(env.length, 2);
    assert.match(env[1][1], /saiu para entrega/);
    await mudar('m', { num: '#2', tel: '31988887777', tipo: 'mesa', origem: 'mesa', status: 'prep', hora: ts(agora) });
    await mudar('v', { num: '#3', tel: '31988887777', tipo: 'retirada', origem: 'site', status: 'pronto', hora: ts(agora - 2 * 3600000) });
    assert.strictEqual(env.length, 2, 'mesa e mudança antiga não avisam');
    await mudar('r', { num: '#4', nome: 'Bia', tel: '31977776666', tipo: 'retirada', origem: 'whatsapp', status: 'pronto', hora: ts(agora) });
    assert.match(env[2][1], /Bia.*#4.*pronto/);
    assert.strictEqual(docs.r.avisosWa.aceito, 'TS', 'pulou direto pra pronto: "aceito" não sai depois');
    opCb({ exists: true, data: () => ({ avisosWhatsApp: { entrega: { on: false } } }) });
    await mudar('d', { num: '#5', tel: '31966665555', tipo: 'delivery', origem: 'site', status: 'entrega', hora: ts(agora) });
    assert.strictEqual(env.length, 3, 'aviso desligado no painel');
    // Cancelado (até depois de "saiu para entrega"): usa canceladoEm e pausa a conversa.
    await mudar('a', { status: 'cancelado', canceladoEm: ts(agora) });
    assert.strictEqual(env.length, 4);
    assert.match(env[3][1], /Ana.*#1.*cancelado/);
    assert.deepStrictEqual(pausados, ['5531988887777@c.us']);
    await mudar('a', { status: 'cancelado', canceladoEm: ts(agora) });
    assert.strictEqual(env.length, 4, 'cancelamento repetido não avisa de novo');
    // Cancelado direto de "Novos", com a última etapa antiga: vale o canceladoEm.
    await mudar('n', { num: '#6', tel: '31955554444', tipo: 'delivery', origem: 'site', status: 'cancelado', hora: ts(agora - 2 * 3600000), canceladoEm: ts(agora) });
    assert.strictEqual(env.length, 5);
    assert.strictEqual(AV.eventoDo({ status: 'cancelado', tipo: 'mesa' }), 'cancelado');
    // Finalizado no Kanban: avisa uma vez; lançado já finalizado (sem horaFim) não.
    await mudar('r', { status: 'finalizado', horaFim: '21:40', hora: ts(agora) });
    assert.strictEqual(env.length, 6);
    assert.match(env[5][1], /Obrigado.*Bia.*#4.*finalizado/);
    await mudar('r', { status: 'finalizado', horaFim: '21:40', hora: ts(agora) });
    await mudar('b', { num: '#7', tel: '31944443333', tipo: 'retirada', origem: 'manual', status: 'finalizado', hora: ts(agora) });
    assert.strictEqual(env.length, 6, 'repetido e balcão retroativo não avisam');
  });

  await caso('texto do cardápio pra IA: sem esgotados e sem sabor fora do painel', async () => {
    const t = require('./ia').textoCardapio();
    assert.match(t, /ESGOTADO AGORA.*X-Bacon Triplo/);
    assert.match(t, /Refri do combo.*sabores: Coca cola$/m);
    assert.doesNotMatch(t, /Fanta/);
  });

  await caso('boas-vindas: só "oi" → só a mensagem da loja; pedido junto → IA continua; 1 vez por conversa', async () => {
    CD._carregarParaTeste(TCHO, DOCS(), { ...ABERTA, boasVindasWhatsApp: { on: true, texto: 'Olá, {nome}! 👋 Bem-vindo ao Tcho!' } });
    const antes = chamadasIA;
    await fala('bv1@c.us', 'Boa noite!! 😊', { numero: '5531999990101', nomeWhatsApp: 'maria souza' });
    assert.strictEqual(ultima('bv1@c.us'), 'Olá, Maria! 👋 Bem-vindo ao Tcho!');
    assert.strictEqual(chamadasIA, antes, 'só cumprimento não chama a IA');
    roteiro.push({ transcricao: '', acao: 'conversar', resposta: 'Qual o ponto da carne?', pedido: pedidoBase({ lanches: [lanche({})] }) });
    await fala('bv1@c.us', 'quero um x-salada', { numero: '5531999990101' });
    assert.strictEqual(enviadas.filter((e) => e.chatId === 'bv1@c.us' && /Bem-vindo/.test(e.texto)).length, 1, 'boas-vindas uma vez só');
    assert.strictEqual(ultima('bv1@c.us'), 'Qual o ponto da carne?');

    roteiro.push({ transcricao: '', acao: 'conversar', resposta: 'Show! Qual o ponto?', pedido: pedidoBase({ lanches: [lanche({})] }) });
    await fala('bv2@c.us', 'oi, quero um x-salada', { numero: '5531999990102' });
    const bv2 = enviadas.filter((e) => e.chatId === 'bv2@c.us').map((e) => e.texto);
    assert.deepStrictEqual(bv2, ['Olá! 👋 Bem-vindo ao Tcho!', 'Show! Qual o ponto?'], 'sem nome: "Olá!" + resposta da IA');

    CD._carregarParaTeste(TCHO, DOCS(), { ...ABERTA, boasVindasWhatsApp: { on: false, texto: 'Olá!' } });
    roteiro.push({ transcricao: '', acao: 'conversar', resposta: 'Oi! O que vai ser?', pedido: pedidoBase({}) });
    await fala('bv3@c.us', 'oi', { numero: '5531999990103' });
    assert.deepStrictEqual(enviadas.filter((e) => e.chatId === 'bv3@c.us').map((e) => e.texto), ['Oi! O que vai ser?'], 'desligado: só a IA');
    CD._carregarParaTeste(TCHO, DOCS(), ABERTA);
  });

  console.log(`\n${ok} casos ok${process.exitCode ? ' — HÁ FALHAS' : ''}\n`);
})();
