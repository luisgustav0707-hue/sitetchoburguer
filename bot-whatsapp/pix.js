// ═══════════════════════════════════════════════════════════════
// PIX PELO WHATSAPP — o mesmo Pix online do site (Mercado Pago)
// ───────────────────────────────────────────────────────────────
// O pedido NÃO vai pra cozinha na hora: fica em pagamentos/{id} como
// 'aguardando' (igual ao site) e quem cria pedidos/{id} com status 'novo' é a
// Cloud Function, depois que o Mercado Pago confirma o pagamento
// (functions/pagamentos.js → processarPagamento). Daí em diante é um pedido
// pago como os do site: Kanban, impressão, CRM, estoque, "PAGO - NÃO COBRAR".
//
// Este módulo:
//   • grava o pendente e pede o Pix (criarPixMP);
//   • acompanha pagamentos/{id} e pergunta ao Mercado Pago a cada 15 s
//     (verificarPagamentoMP), caso o aviso automático atrase;
//   • avisa o atendente quando pagou (aoPagar) ou quando o Pix venceu (aoVencer);
//   • guarda os Pix em andamento num arquivo, pra continuar acompanhando se o
//     bot reiniciar (atualização automática, queda de energia...).
// ═══════════════════════════════════════════════════════════════

const fs = require('fs');

const INTERVALO_MS = 15000;
const DEPOIS_DE_VENCER_MS = 5 * 60000;   // aviso atrasado do Mercado Pago ainda vale
const ID_OK = /^[A-Za-z0-9]{10,40}$/;

// chamar(nome, data) → resultado da Cloud Function (conexao.js).
function criarPix({ db, FieldValue, chamar, aoPagar, aoVencer, arquivo, intervaloMs = INTERVALO_MS, log = console.log }) {
  const ativos = new Map();   // id do pagamento → { chatId, venceMs, info, vencido, ocupado, unsub, timer }

  function salvar() {
    if (!arquivo) return;
    const lista = [...ativos].map(([id, a]) => ({ id, chatId: a.chatId, venceMs: a.venceMs, info: a.info }));
    try { fs.writeFileSync(arquivo, JSON.stringify(lista)); } catch (e) { console.warn('[pix] não salvou os Pix em andamento:', e.message); }
  }

  function parar(id) {
    const a = ativos.get(id);
    if (!a) return null;
    ativos.delete(id);
    try { if (a.unsub) a.unsub(); } catch (e) {}
    clearInterval(a.timer);
    salvar();
    return a;
  }

  function aoMudar(id, d) {
    if (!d) return;
    if (d.status === 'pago') {
      const a = parar(id);   // só a primeira notícia chega aqui (snapshot e verificação podem chegar juntos)
      if (a) Promise.resolve(aoPagar(a.chatId, { id, num: d.pedidoNum || '', info: a.info })).catch((e) => console.error('[pix] aoPagar:', e.message));
    } else if (d.status === 'cancelado' || d.status === 'pago-apos-cancelar') {
      parar(id);
    } else if (d.status === 'divergente') {
      log(`⚠️  Pix ${id}: pagamento com valor diferente do pedido — conferir no Mercado Pago`);
      parar(id);
    }
  }

  async function checar(id) {
    const s = await db.collection('pagamentos').doc(id).get();
    aoMudar(id, s.exists ? s.data() : null);
  }

  async function tick(id) {
    const a = ativos.get(id);
    if (!a || a.ocupado) return;
    a.ocupado = true;
    try {
      const r = await chamar('verificarPagamentoMP', { id });
      if (r && r.status === 'pago') await checar(id);
    } catch (e) { /* sem internet ou Mercado Pago fora: tenta na próxima */ }
    a.ocupado = false;
    if (!ativos.has(id)) return;                           // pagou
    const agora = Date.now();
    if (agora > a.venceMs && !a.vencido) {
      a.vencido = true;
      Promise.resolve(aoVencer(a.chatId, { id, info: a.info })).catch((e) => console.error('[pix] aoVencer:', e.message));
    }
    if (agora > a.venceMs + DEPOIS_DE_VENCER_MS) parar(id);
  }

  function acompanhar(id, chatId, venceMs, info) {
    let a = ativos.get(id);
    if (a) {
      Object.assign(a, { chatId, venceMs, vencido: false, info: info || a.info });
      salvar();
      return;
    }
    a = { chatId, venceMs, info: info || {}, vencido: false, ocupado: false };
    ativos.set(id, a);
    a.unsub = db.collection('pagamentos').doc(id).onSnapshot(
      (s) => aoMudar(id, s.exists ? s.data() : null),
      (e) => console.warn(`[pix] parou de ouvir o pagamento ${id}:`, e.message),   // a verificação a cada 15 s continua
    );
    a.timer = setInterval(() => tick(id), intervaloMs);
    if (a.timer.unref) a.timer.unref();
    salvar();
  }

  // Pix novo (ou o mesmo, se ainda não venceu: criarPixMP devolve o atual).
  async function novoPix(id, chatId, info) {
    const pix = await chamar('criarPixMP', { id });
    if (!pix || !pix.qr) throw new Error('o Mercado Pago não devolveu o código Pix');
    acompanhar(id, chatId, Number(pix.venceMs) || Date.now() + 30 * 60000, { ...(info || {}), qr: pix.qr });
    return pix;
  }

  // pedido = campos do pedido (pedido.js → dadosPedido) com pag 'online_pix'.
  // Mesmos campos que o site grava em finalizarPedidoOnline() (cliente/cliente.js).
  async function gerar({ chatId, pedido, total, consumo, carrinho, info }) {
    const ref = db.collection('pagamentos').doc();
    await ref.set({
      status: 'aguardando', pedido, total, consumo: consumo || {}, carrinho, cupomId: '',
      criadoEm: FieldValue.serverTimestamp(),
    });
    const pix = await novoPix(ref.id, chatId, info);
    return { id: ref.id, pix };
  }

  // Pergunta ao Mercado Pago agora (cliente disse que pagou / mandou comprovante).
  async function verificar(id) {
    const r = await chamar('verificarPagamentoMP', { id });
    const st = r && r.status;
    if (st === 'pago') await checar(id);
    return st;
  }

  // Cliente mudou o pedido ou a forma de pagamento. 'pago' = já tinha pago
  // (o pedido segue e o aoPagar avisa); senão o Pix é cancelado no Mercado Pago.
  async function cancelar(id) {
    const r = await chamar('cancelarPagamentoMP', { id });
    const st = r && r.status;
    if (st === 'pago') await checar(id); else parar(id);
    return st;
  }

  // Ao ligar: volta a acompanhar os Pix que estavam em andamento.
  function retomar() {
    if (!arquivo) return [];
    let lista;
    try { lista = JSON.parse(fs.readFileSync(arquivo, 'utf8')); } catch (e) { return []; }
    const agora = Date.now();
    const vivos = (Array.isArray(lista) ? lista : []).filter((x) => x && ID_OK.test(String(x.id)) && x.chatId
      && Number(x.venceMs) + DEPOIS_DE_VENCER_MS > agora);
    vivos.forEach((x) => acompanhar(x.id, x.chatId, Number(x.venceMs), x.info || {}));
    salvar();
    vivos.forEach((x) => tick(x.id));          // pode ter pago com o bot desligado
    return vivos;
  }

  return { gerar, novoPix, verificar, cancelar, retomar, esquecer: parar, ativo: (id) => ativos.has(id) };
}

module.exports = { criarPix };
