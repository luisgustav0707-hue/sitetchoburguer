// ═══════════════════════════════════════════════════════════════
// ATENDENTE — o fluxo da conversa (sem depender do WhatsApp)
// ───────────────────────────────────────────────────────────────
// index.js entrega cada mensagem aqui e diz como responder (enviar). Assim
// dá pra testar o fluxo inteiro com WhatsApp e Gemini de mentira
// (teste-local.js).
//
//   mensagem → loja aberta? → (resumo pendente + "sim") → grava
//            → IA entende → pedido.js confere → responde / resume / grava
// ═══════════════════════════════════════════════════════════════

const CD = require('./cardapio');
const PED = require('./pedido');
const CONV = require('./conversas');

const AVISO_FECHADO_MS = 30 * 60000;   // não repete o "estamos fechados" a cada mensagem

const MSG = {
  erroIA: 'Opa, deu um probleminha aqui 😅 Pode mandar de novo?',
  audioRuim: 'Não consegui ouvir esse áudio 😕 Pode mandar de novo ou escrever?',
  soTexto: 'Por aqui eu entendo texto e áudio 😉 Me conta o que vai querer!',
  atendente: 'Beleza! Já chamei alguém da equipe pra falar com você, só um instante 😉',
  naoEntendi2: 'Acho que não tô conseguindo te entender 😅 Vou chamar alguém da equipe pra te ajudar, só um instante!',
  erroGravar: 'Ih, não consegui registrar o pedido agora 😕 Já chamei alguém da equipe pra finalizar com você!',
  semPedidos: 'Oi! 😊 No momento não estamos aceitando pedidos por aqui. Volta mais tarde!',
};

// "sim" de verdade: a mensagem inteira é uma confirmação curta (sem "mas...").
const SIM = /^(sim+|s|ss|isso( mesmo)?|confirm[oa]|confirmad[oa]|confirmar|pode( sim)?( mandar| confirmar| ser| fechar)?|fechad[oa]|fecha|ok|okay|beleza|blz|manda( ver)?|bora|perfeito|certo|ta certo|esta certo|tudo certo|correto|isso ai|sim pode|sim por favor|sim obrigad[oa])[\s!.👍✅🙏😊😁]*$/i;
const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

function mascara(numero) { const d = String(numero || '').replace(/\D/g, ''); return d ? '…' + d.slice(-4) : '?'; }
function log(chatId, numero, ...a) { console.log(new Date().toLocaleTimeString('pt-BR', { timeZone: CD.TZ }), `[${mascara(numero || chatId)}]`, ...a); }

function criarAtendente({ db, FieldValue, ia, enviar, aoPausar }) {
  const filas = new Map();   // chatId → Promise (uma mensagem por vez por cliente)

  async function responder(c, texto) {
    CONV.registrar(c, 'bot', texto);
    await enviar(c.chatId, texto);
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
        return mostrarResumo(c, r.pedido);
      case 'confirmar':
        if (c.resumo) {
          const v = PED.conferir(r.pedido);
          if (JSON.stringify(v.rascunho) !== c.resumo.chave) return mostrarResumo(c, r.pedido);   // mudou algo junto com o "sim"
          return confirmar(c);
        }
        return mostrarResumo(c, r.pedido);
      default: {   // conversar
        const v = PED.conferir(r.pedido);
        c.rascunho = v.rascunho;
        if (c.resumo && JSON.stringify(v.rascunho) !== c.resumo.chave) c.resumo = null;   // mudou → precisa de resumo novo
        let texto = r.resposta || 'Me conta o que vai querer 😊';
        if (v.indisponiveis.length) texto += `\n\n😕 Só avisando: não temos agora ${v.indisponiveis.join(', ')}.`;
        await responder(c, texto);
      }
    }
  }

  // Uma mensagem por vez por cliente (áudio + texto seguidos não se atropelam).
  function receber(m) {
    const anterior = filas.get(m.chatId) || Promise.resolve();
    const atual = anterior.then(() => processar(m)).catch((e) => console.error('[atendente] erro:', e));
    filas.set(m.chatId, atual);
    atual.finally(() => { if (filas.get(m.chatId) === atual) filas.delete(m.chatId); });
    return atual;
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

  return { receber, humanoRespondeu, pausarAposAviso };
}

module.exports = { criarAtendente, SIM, semAcento, MSG };
