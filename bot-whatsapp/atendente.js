// ═══════════════════════════════════════════════════════════════
// ATENDENTE — o fluxo da conversa (sem depender do WhatsApp)
// ───────────────────────────────────────────────────────────────
// index.js entrega cada mensagem aqui e diz como responder (enviar). Assim
// dá pra testar o fluxo inteiro com WhatsApp e Gemini de mentira
// (teste-local.js).
//
//   mensagem → loja aberta? → (resumo pendente + "sim") → grava
//            → IA entende → pedido.js confere → responde / resume / grava
//
// Pix com o pagamento online ligado: o "sim" não grava o pedido — gera o Pix
// do Mercado Pago (pix.js) e manda o copia e cola. O pedido só entra no
// Kanban quando o pagamento cai, e aí o bot confirma pro cliente.
// ═══════════════════════════════════════════════════════════════

const CD = require('./cardapio');
const PED = require('./pedido');
const CONV = require('./conversas');
const { montarTexto } = require('./avisos');
const { criarPix } = require('./pix');

const AVISO_FECHADO_MS = 30 * 60000;   // não repete o "estamos fechados" a cada mensagem

const MSG = {
  erroIA: 'Opa, deu um probleminha aqui 😅 Pode mandar de novo?',
  audioRuim: 'Não consegui ouvir esse áudio 😕 Pode mandar de novo ou escrever?',
  soTexto: 'Por aqui eu entendo texto e áudio 😉 Me conta o que vai querer!',
  atendente: 'Beleza! Já chamei alguém da equipe pra falar com você, só um instante 😉',
  naoEntendi2: 'Acho que não tô conseguindo te entender 😅 Vou chamar alguém da equipe pra te ajudar, só um instante!',
  erroGravar: 'Ih, não consegui registrar o pedido agora 😕 Já chamei alguém da equipe pra finalizar com você!',
  semPedidos: 'Oi! 😊 No momento não estamos aceitando pedidos por aqui. Volta mais tarde!',
  erroPix: 'Ih, não consegui gerar o Pix agora 😕 Quer pagar em dinheiro ou cartão na entrega?',
  pixLimite: 'Já gerei Pix demais pra esse pedido 😅 Quer pagar em dinheiro ou cartão na entrega?',
  pixAguardando: 'Ainda não apareceu o pagamento aqui 👀 Às vezes o banco leva alguns segundinhos. Assim que cair, eu confirmo e o pedido vai direto pra cozinha!',
  pixComprovante: 'Recebi! 👀 O pagamento ainda não apareceu aqui, às vezes o banco leva alguns segundinhos. Assim que cair, eu confirmo e o pedido vai pra cozinha (não precisa mandar comprovante 😉).',
  pixVenceu: '⌛ O Pix venceu e o pedido ainda não foi pra cozinha. Responde *PIX* que eu gero um novo, ou me fala se prefere pagar em dinheiro ou cartão na entrega.',
  pixCancelado: 'Beleza, cancelei aquele Pix 👍',
  pixJaPago: 'Opa, o seu Pix já tinha caído aqui, então o pedido foi pra cozinha do jeito que estava 🔥 Se precisar mudar alguma coisa, me fala que eu chamo alguém da equipe.',
  pixNaoCancelou: 'Não consegui cancelar o Pix agora 😕 Se você já pagou, fica tranquilo que eu confirmo aqui. Se ainda não pagou, não pague aquele código e me manda a mensagem de novo daqui a pouco.',
};

// "sim" de verdade: a mensagem inteira é uma confirmação curta (sem "mas...").
const SIM = /^(sim+|s|ss|isso( mesmo)?|confirm[oa]|confirmad[oa]|confirmar|pode( sim)?( mandar| confirmar| ser| fechar)?|fechad[oa]|fecha|ok|okay|beleza|blz|manda( ver)?|bora|perfeito|certo|ta certo|esta certo|tudo certo|correto|isso ai|sim pode|sim por favor|sim obrigad[oa])[\s!.👍✅🙏😊😁]*$/i;
const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// Mensagem só de cumprimento ("oi", "boa noite!", "olá, tudo bem? 😊"): depois
// das boas-vindas não precisa de resposta da IA, senão o cliente recebe dois "oi".
const SAUDACAO = /^((oi+e?|ola+|opa|e a[ie]|eae|eai|bom dia|boa tarde|boa noite|boa|hey|salve|alo|tudo bem|td bem|tudo bom|tudo certo|como vai|beleza|blz)\s*)+$/;
function soCumprimento(texto) {
  const t = semAcento(texto).replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();
  return !t || SAUDACAO.test(t);
}

// Com Pix esperando pagamento: "paguei", "pronto", "fiz o pix"... (a mensagem
// inteira). "Pago na entrega" ou "pronto, muda o endereço" não entram: vão pra IA.
const PAGUEI = /^(ja\s+)?(paguei|pago|ta pago|esta pago|pix feito|fiz o pix|fiz o pagamento|feito|pronto|transferi|enviei|mandei|caiu|comprovante|segue o comprovante|ja foi)(\s+(o pix|o pagamento|ja|agora|ai|aqui|viu|ta|blz|beleza|obrigad[oa]|vlw|valeu))*[\s!.?,👍✅🙏😊😁]*$/;
// "PIX" depois que venceu, ou pra receber o código de novo.
const PEDE_PIX = /^((gera|gerar|manda|mandar|me manda|quero|pode gerar|pode mandar|reenvia)\s+)?((o|um|outro|um novo|novo)\s+)?(pix|codigo|codigo do pix|copia e cola)(\s+(de novo|novo|novamente|por favor|pf|pfv))?[\s!.?👍✅🙏😊😁]*$|^(gera outro|outro|gera|pode gerar|pode mandar|sim)[\s!.👍✅🙏😊😁]*$/;

// Boas-vindas do painel (Configurações → WhatsApp): config/operacao.boasVindasWhatsApp.
function boasVindasConfig() {
  const op = (CD.cardapio() || {}).operacao || {};
  const bv = op.boasVindasWhatsApp || {};
  const texto = String(bv.texto || '').trim();
  return bv.on === true && texto ? texto : '';
}

function mascara(numero) { const d = String(numero || '').replace(/\D/g, ''); return d ? '…' + d.slice(-4) : '?'; }
function log(chatId, numero, ...a) { console.log(new Date().toLocaleTimeString('pt-BR', { timeZone: CD.TZ }), `[${mascara(numero || chatId)}]`, ...a); }

// chamar(nome, data): Cloud Functions do Pix (conexao.js). Sem ele, o Pix fica
// como antes (chave da loja + comprovante). enviarImagem: QR code do Pix.
// arquivoPix: onde guardar os Pix em andamento (sobrevive a um reinício).
function criarAtendente({ db, FieldValue, ia, enviar, enviarImagem, chamar, arquivoPix, pixIntervaloMs, aoPausar }) {
  const filas = new Map();   // chatId → Promise (uma mensagem por vez por cliente)

  async function responder(c, texto) {
    CONV.registrar(c, 'bot', texto);
    await enviar(c.chatId, texto);
  }

  // Uma coisa por vez por cliente: mensagens dele e avisos do Pix não se atropelam.
  function naFila(chatId, fn) {
    const anterior = filas.get(chatId) || Promise.resolve();
    const atual = anterior.then(fn).catch((e) => console.error('[atendente] erro:', e));
    filas.set(chatId, atual);
    atual.finally(() => { if (filas.get(chatId) === atual) filas.delete(chatId); });
    return atual;
  }

  // ── PIX (Mercado Pago) ─────────────────────────────────────────
  const PIX = chamar ? criarPix({
    db, FieldValue, chamar, arquivo: arquivoPix, intervaloMs: pixIntervaloMs,
    aoPagar: (chatId, x) => pixPago(chatId, x),
    aoVencer: (chatId, x) => pixVencido(chatId, x),
    log: (t) => log('', '', t),
  }) : null;
  const pixOnline = () => !!PIX && CD.pagamentoOnlineAtivo();

  // O que não pode mudar depois do Pix gerado (senão o valor ou o pedido pago não batem).
  function chavePix(v) {
    const r = v.rascunho;
    return JSON.stringify([v.montado ? v.montado.itens : [], v.total, r.tipo, r.pagamento, r.bairro, r.rua, r.numero, r.complemento, r.obs]);
  }

  // Manda o Pix: QR code com as instruções e, separado, o copia e cola (fácil
  // de copiar no celular). Venceu ou sem código → pede outro ao Mercado Pago.
  async function mandarPix(c) {
    const p = c.pix;
    if (p.vencido || !p.qr || p.venceMs <= Date.now()) {
      try {
        const pix = await PIX.novoPix(p.id, c.chatId, p.info);
        Object.assign(p, { qr: pix.qr, qrBase64: pix.qrBase64 || '', venceMs: Number(pix.venceMs) || Date.now() + 30 * 60000, vencido: false });
        p.info = { ...p.info, qr: pix.qr };
        log(c.chatId, c.numero, `⚡ Pix novo gerado [${p.id}]`);
      } catch (e) {
        const st = await PIX.verificar(p.id).catch(() => null);
        if (st === 'pago') return;                              // a confirmação sai pelo pixPago
        console.warn('[atendente] Pix não gerado:', e.code || '', e.message);
        const limite = /resource-exhausted|muitas tentativas/i.test(`${e.code} ${e.message}`);
        PIX.esquecer(p.id);
        c.pix = null; c.resumo = null;
        if (c.rascunho) c.rascunho.pagamento = '';
        await responder(c, limite ? MSG.pixLimite : MSG.erroPix);
        return;
      }
    }
    const min = Math.max(1, Math.round((p.venceMs - Date.now()) / 60000));
    const texto = `⚡ *Pix de ${PED.brl(p.total)}*\n\nCopie o código da próxima mensagem e cole no app do banco em *Pix → Pix Copia e Cola*. Vale por ${min} min.\n\nAssim que o pagamento cair, eu confirmo aqui e o pedido vai direto pra cozinha 🔥 Não precisa mandar comprovante.`;
    CONV.registrar(c, 'bot', texto);
    if (enviarImagem && /^[A-Za-z0-9+/=]{100,}$/.test(p.qrBase64 || '')) await enviarImagem(c.chatId, p.qrBase64, texto);
    else await enviar(c.chatId, texto);
    CONV.registrar(c, 'bot', '(código Pix copia e cola)');
    await enviar(c.chatId, p.qr);
  }

  // "Sim" no resumo com Pix: grava o pendente e manda o Pix. O pedido de
  // verdade só nasce quando o Mercado Pago confirmar (functions/pagamentos.js).
  async function pedirPix(c, v) {
    const chave = chavePix(v);
    if (c.pix && c.pix.chave === chave) return mandarPix(c);   // mesmo pedido: reenvia
    const info = { nome: v.rascunho.nome, tipo: v.rascunho.tipo, total: v.total };
    const pedido = PED.dadosPedido(v, c.numero, 'online_pix');
    info.endereco = pedido.endereco;
    let r;
    try {
      r = await PIX.gerar({ chatId: c.chatId, pedido, total: v.total, consumo: v.montado.consumo, carrinho: v.carrinho, info });
    } catch (e) {
      console.error('[atendente] Pix não gerado:', e.code || '', e.message);
      c.resumo = null;
      c.rascunho.pagamento = '';
      await responder(c, MSG.erroPix);
      return;
    }
    log(c.chatId, c.numero, `⚡ Pix gerado (${PED.brl(v.total)}, ${v.rascunho.tipo}) — esperando o pagamento [${r.id}]`);
    c.resumo = null;
    c.pix = {
      id: r.id, chave, total: v.total, qr: r.pix.qr, qrBase64: r.pix.qrBase64 || '',
      venceMs: Number(r.pix.venceMs) || Date.now() + 30 * 60000, vencido: false, info: { ...info, qr: r.pix.qr },
    };
    await mandarPix(c);
  }

  // Cliente mudou o pedido/forma de pagamento: cancela o Pix antes.
  // 'ok' = cancelado; 'pago' = já tinha pago; 'erro' = não deu pra cancelar.
  async function cancelarPix(c) {
    const id = c.pix.id;
    let st;
    try { st = await PIX.cancelar(id); } catch (e) {
      console.warn('[atendente] Pix não cancelado:', e.code || '', e.message);
      await responder(c, MSG.pixNaoCancelou);
      return 'erro';
    }
    if (st === 'pago') { await responder(c, MSG.pixJaPago); return 'pago'; }   // a confirmação sai pelo pixPago
    log(c.chatId, c.numero, `⚡ Pix cancelado [${id}]`);
    c.pix = null;
    return 'ok';
  }

  // Mensagem do cliente com Pix esperando: "paguei"/comprovante → pergunta ao
  // Mercado Pago agora; "PIX" → manda (ou gera de novo). true = já respondeu.
  async function tratarPixPendente(c, m) {
    const t = m.tipo === 'texto' ? semAcento(m.texto) : '';
    const comprovante = m.tipo === 'outro';
    const pedePix = !!t && PEDE_PIX.test(t);
    const paguei = !!t && !pedePix && PAGUEI.test(t);
    if (!comprovante && !pedePix && !paguei) {
      PIX.verificar(c.pix.id).catch(() => {});                // de carona: pode ter caído agora
      return false;
    }
    CONV.registrar(c, 'cliente', comprovante ? '(mandou uma imagem/arquivo)' : m.texto);
    log(c.chatId, c.numero, comprovante ? '📎 comprovante?' : `💬 ${String(m.texto).slice(0, 120)}`);
    if (pedePix) { await mandarPix(c); return true; }
    const st = await PIX.verificar(c.pix.id).catch(() => null);
    if (st === 'pago') return true;                            // a confirmação sai pelo pixPago
    await responder(c, comprovante ? MSG.pixComprovante : MSG.pixAguardando);
    return true;
  }

  // Mercado Pago confirmou: o pedido já está no Kanban. Confirma pro cliente.
  function pixPago(chatId, { id, num, info }) {
    return naFila(chatId, async () => {
      const c = CONV.obter(chatId);
      const inf = info || {};
      const op = (CD.cardapio() || {}).operacao || {};
      const prazo = `${op.prazoMin || 30}–${op.prazoMax || 45} min`;
      const L = [`✅ Pagamento recebido! Pedido${num ? ` *${num}*` : ''} confirmado e já foi pra cozinha 🔥`];
      L.push(inf.tipo === 'delivery' ? `Previsão de entrega: ${prazo} 🛵` : `Pode vir buscar em uns ${prazo} 🏃`);
      if (inf.nome) L.push(`Valeu, ${inf.nome}! 🍔`);
      log(chatId, c.numero, `✅ Pix pago — pedido ${num || '?'} no Kanban [${id}]`);
      if (c.pix && c.pix.id === id) {
        c.cliente = { nome: inf.nome || (c.cliente && c.cliente.nome) || '', endereco: inf.endereco || (c.cliente && c.cliente.endereco) || '' };
        CONV.zerarPedido(c);
      }
      await responder(c, L.join('\n'));
    });
  }

  // Venceu sem pagamento: avisa uma vez (o cliente pode pedir outro).
  function pixVencido(chatId, { id }) {
    return naFila(chatId, async () => {
      const c = CONV.obter(chatId);
      if (!c.pix || c.pix.id !== id || CONV.pausado(chatId)) return;
      c.pix.vencido = true;
      log(chatId, c.numero, `⌛ Pix venceu sem pagamento [${id}]`);
      await responder(c, MSG.pixVenceu);
    });
  }

  // Bot reiniciou com Pix em andamento: volta a acompanhar (e a confirmar).
  function retomarPix() {
    if (!PIX) return;
    const lista = PIX.retomar();
    lista.forEach((x) => {
      const c = CONV.obter(x.chatId);
      if (c.pix) return;
      const inf = x.info || {};
      c.pix = { id: x.id, chave: null, total: inf.total, qr: inf.qr || '', qrBase64: '', venceMs: Number(x.venceMs), vencido: Number(x.venceMs) <= Date.now(), info: inf };
    });
    if (lista.length) console.log(`[pix] acompanhando ${lista.length} Pix de antes do reinício`);
  }

  function pausar(c, motivo) {
    CONV.pausar(c.chatId);
    log(c.chatId, c.numero, `⏸  bot pausado 30 min (${motivo}) — atender manualmente`);
    if (aoPausar) Promise.resolve(aoPausar(c.chatId, motivo)).catch(() => {});
  }

  // Confere o rascunho e manda o resumo oficial (ou a próxima pergunta).
  async function mostrarResumo(c, rascunho, prefixo = '') {
    const v = PED.conferir(rascunho);
    c.rascunho = v.rascunho;
    const aviso = v.indisponiveis.length ? `😕 Não temos agora: ${v.indisponiveis.join(', ')}.` : '';
    const topo = [prefixo, aviso].filter(Boolean).join('\n');
    if (v.pendencia || !v.montado) {
      c.resumo = null;
      await responder(c, [topo, v.pendencia || 'O que vai ser hoje? 🍔'].filter(Boolean).join('\n\n'));
      return;
    }
    c.resumo = { chave: JSON.stringify(v.rascunho), total: v.total, itens: v.montado.itens };
    await responder(c, [topo, PED.textoResumo(v)].filter(Boolean).join('\n\n'));
  }

  // Cliente disse sim: confere DE NOVO com o estoque de agora e grava.
  async function confirmar(c) {
    if (!c.resumo) return mostrarResumo(c, c.rascunho);
    const v = PED.conferir(c.rascunho);
    const mudou = v.pendencia || !v.montado || v.indisponiveis.length
      || v.total !== c.resumo.total || JSON.stringify(v.montado.itens) !== JSON.stringify(c.resumo.itens);
    if (mudou) {
      log(c.chatId, c.numero, 'cardápio mudou antes da confirmação — novo resumo');
      return mostrarResumo(c, c.rascunho, 'Opa, mudou uma coisinha no cardápio agora 👀');   // rascunho original: assim o aviso diz o que saiu
    }
    if (v.rascunho.pagamento === 'pix' && pixOnline()) return pedirPix(c, v);
    let r;
    try {
      r = await PED.gravarPedido(db, FieldValue, v, c.numero);
    } catch (e) {
      console.error('[atendente] erro ao gravar pedido:', e);
      await responder(c, MSG.erroGravar);
      pausar(c, 'erro ao gravar pedido');
      return;
    }
    log(c.chatId, c.numero, `✅ pedido ${r.num} gravado (${PED.brl(v.total)}, ${v.rascunho.tipo}, ${v.rascunho.pagamento})`);
    const C = CD.cardapio();
    const op = C.operacao || {};
    const prazo = `${op.prazoMin || 30}–${op.prazoMax || 45} min`;
    const L = [`✅ Pedido *${r.num}* confirmado! Já foi pra cozinha 🔥`];
    L.push(v.rascunho.tipo === 'delivery' ? `Previsão de entrega: ${prazo} 🛵` : `Pode vir buscar em uns ${prazo} 🏃`);
    if (v.rascunho.pagamento === 'pix') {
      const chave = process.env.PIX_CHAVE || (C.loja && C.loja.pixKey) || '';
      if (chave) L.push(`Chave Pix (CNPJ): *${chave}* — valor ${PED.brl(v.total)}. Manda o comprovante aqui, por favor 🙏`);
    }
    L.push(`Valeu, ${v.rascunho.nome}! 🍔`);
    c.cliente = { nome: v.rascunho.nome, endereco: r.pedido.endereco || (c.cliente && c.cliente.endereco) || '' };
    CONV.zerarPedido(c);
    await responder(c, L.join('\n'));
  }

  async function processar(m) {
    const c = CONV.obter(m.chatId);
    c.numero = m.numero || c.numero;
    if (CONV.pausado(m.chatId)) { log(m.chatId, c.numero, '(pausado — mensagem ignorada)'); return; }
    if (c.pix && PIX && await tratarPixPendente(c, m)) return;

    // Loja fechada ou sem nenhuma modalidade: avisa (no máximo a cada 30 min) e não aceita pedido.
    const mod = CD.modalidades();
    if (!CD.lojaAberta() || (!mod.delivery && !mod.retirada)) {
      if (Date.now() - c.avisoFechadoEm > AVISO_FECHADO_MS) {
        c.avisoFechadoEm = Date.now();
        c.resumo = null;
        const msg = !CD.lojaAberta()
          ? `Oi! 😊 No momento estamos fechados. Nosso horário: ${CD.textoHorario()}. Te esperamos! 🍔`
          : MSG.semPedidos;
        await responder(c, msg);
      }
      log(m.chatId, c.numero, '(loja fechada — não aceita pedido)');
      return;
    }

    // Primeira mensagem de uma conversa nova: a mensagem de boas-vindas da loja.
    const boasVindas = boasVindasConfig();
    if (boasVindas && !c.boasVindas && c.historico.length === 0) {
      c.boasVindas = true;
      if (c.cliente === undefined) c.cliente = await PED.buscarCliente(db, c.numero);
      await responder(c, montarTexto(boasVindas, { nome: (c.cliente && c.cliente.nome) || m.nomeWhatsApp || '' }));
      log(m.chatId, c.numero, '👋 boas-vindas enviadas');
      if (m.tipo === 'texto' && soCumprimento(m.texto)) { CONV.registrar(c, 'cliente', m.texto); return; }
    }

    if (m.tipo === 'outro') { await responder(c, MSG.soTexto); return; }
    if (m.tipo === 'audio' && !m.audio) { await responder(c, MSG.audioRuim); return; }
    log(m.chatId, c.numero, m.tipo === 'audio' ? '🎤 áudio' : `💬 ${String(m.texto).slice(0, 120)}`);

    // Atalho: "sim" com resumo na tela → grava sem passar pela IA.
    if (c.resumo && m.tipo === 'texto' && SIM.test(semAcento(m.texto))) {
      CONV.registrar(c, 'cliente', m.texto);
      return confirmar(c);
    }

    if (c.cliente === undefined) c.cliente = await PED.buscarCliente(db, c.numero);

    let r;
    try {
      r = await ia.entender(c, m.tipo === 'audio' ? { audio: m.audio } : { texto: m.texto }, m.nomeWhatsApp);
    } catch (e) {
      console.error('[atendente] IA indisponível:', e.status || '', e.message);
      await responder(c, MSG.erroIA);
      return;
    }
    CONV.registrar(c, 'cliente', m.tipo === 'audio' ? `(áudio) ${r.transcricao || ''}`.trim() : m.texto);
    if (m.tipo === 'audio') log(m.chatId, c.numero, `🎤 "${String(r.transcricao || '').slice(0, 120)}"`);
    log(m.chatId, c.numero, `🤖 ${r.acao}`);

    if (r.acao !== 'nao_entendi') c.naoEntendeu = 0;

    // Pix esperando pagamento: mudou o pedido ou a forma de pagamento → cancela
    // o Pix antes; pediu o resumo / confirmou de novo o mesmo pedido → reenvia.
    // Depois de um reinício não há chave (o rascunho se perdeu): só um pedido
    // novo ou outra forma de pagamento cancela.
    let prefixo = '';
    if (c.pix && PIX && r.acao !== 'atendente' && r.acao !== 'nao_entendi') {
      const v0 = PED.conferir(r.pedido);
      const rr = v0.rascunho;
      const mudou = r.acao === 'cancelar' || (c.pix.chave
        ? chavePix(v0) !== c.pix.chave
        : rr.lanches.length > 0 || rr.extras.length > 0 || rr.pagamento === 'dinheiro' || rr.pagamento === 'cartao');
      if (mudou) {
        if ((await cancelarPix(c)) !== 'ok') return;
        if (r.acao !== 'cancelar') prefixo = MSG.pixCancelado;
      } else if (r.acao === 'confirmar' || r.acao === 'mostrar_resumo') {
        return mandarPix(c);
      }
    }

    switch (r.acao) {
      case 'atendente':
        await responder(c, MSG.atendente);
        pausar(c, 'cliente pediu atendente');
        return;
      case 'nao_entendi':
        c.naoEntendeu++;
        if (c.naoEntendeu >= 2) { await responder(c, MSG.naoEntendi2); pausar(c, 'IA não entendeu 2 vezes'); return; }
        await responder(c, r.resposta || 'Não entendi 😅 Pode repetir?');
        return;
      case 'cancelar':
        CONV.zerarPedido(c);
        await responder(c, r.resposta || 'Tranquilo, pedido cancelado! Quando quiser é só chamar 😉');
        return;
      case 'mostrar_resumo':
        return mostrarResumo(c, r.pedido, prefixo);
      case 'confirmar':
        if (c.resumo) {
          const v = PED.conferir(r.pedido);
          if (JSON.stringify(v.rascunho) !== c.resumo.chave) return mostrarResumo(c, r.pedido);   // mudou algo junto com o "sim"
          return confirmar(c);
        }
        return mostrarResumo(c, r.pedido, prefixo);
      default: {   // conversar
        const v = PED.conferir(r.pedido);
        c.rascunho = v.rascunho;
        if (c.resumo && JSON.stringify(v.rascunho) !== c.resumo.chave) c.resumo = null;   // mudou → precisa de resumo novo
        let texto = [prefixo, r.resposta || 'Me conta o que vai querer 😊'].filter(Boolean).join('\n\n');
        if (v.indisponiveis.length) texto += `\n\n😕 Só avisando: não temos agora ${v.indisponiveis.join(', ')}.`;
        await responder(c, texto);
      }
    }
  }

  // Uma mensagem por vez por cliente (áudio + texto seguidos não se atropelam).
  function receber(m) {
    return naFila(m.chatId, () => processar(m));
  }

  // Alguém da loja respondeu à mão nessa conversa → bot fica quieto 30 min.
  function humanoRespondeu(chatId) {
    if (!CONV.pausado(chatId)) {
      const c = CONV.pausar(chatId);
      log(chatId, c.numero, '⏸  resposta manual da loja — bot pausado 30 min nessa conversa');
    } else CONV.pausar(chatId);
  }

  // Aviso de cancelamento (avisos.js): quem explica o motivo é a loja.
  function pausarAposAviso(chatId, motivo) {
    pausar(CONV.obter(chatId), motivo);
  }

  // Teste: espera terminar o que está na fila desse cliente.
  const ocioso = (chatId) => filas.get(chatId) || Promise.resolve();

  return { receber, humanoRespondeu, pausarAposAviso, retomarPix, ocioso };
}

module.exports = { criarAtendente, SIM, PAGUEI, PEDE_PIX, semAcento, MSG };
