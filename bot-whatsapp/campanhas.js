// ═══════════════════════════════════════════════════════════════
// CAMPANHAS — disparo automático de promoções pelo WhatsApp da loja
// ───────────────────────────────────────────────────────────────
// O painel (Marketing → Campanhas, ou Recuperação de Clientes) cria
// campanhas/{id} com bot:true e, ANTES dela, um doc por cliente em
// campanhas/{id}/envios/{clienteId}, com a mensagem já montada (nome + cupom
// individual). O atendente manda uma por vez, devagar, porque o WhatsApp
// bloqueia número que dispara muita mensagem de uma vez:
//   • só das 9h às 21h (horário de Brasília);
//   • 40 a 90 s entre uma mensagem e outra;
//   • no máximo 60 por dia neste PC, somando todas as campanhas;
//   • pula quem respondeu SAIR (clientes/{id}.semPromo) e quem já recebeu
//     promoção nos últimos 7 dias (clientes/{id}.ultimaPromoEm).
// Toda mensagem leva o "responda SAIR" no fim.
//
// Quem manda é o painel: campanhas/{id}.comando = 'enviar' | 'pausar' |
// 'cancelar'. O bot só escreve o andamento (campanhas/{id}.progresso) e o
// status de cada envio. Cada envio é reservado numa transação antes de sair
// (pendente → enviando): com dois PCs pareados, cada cliente recebe uma vez.
// Se o bot cair entre a reserva e o envio, aquele cliente fica "enviando" e
// não recebe de novo (melhor faltar uma mensagem do que mandar duas).
// ═══════════════════════════════════════════════════════════════

const fs = require('fs');
const { numeroWhatsApp } = require('./avisos');

const TZ = 'America/Sao_Paulo';
const HORA_INICIO = 9;
const HORA_FIM = 21;
const INTERVALO_MIN_MS = 40000;
const INTERVALO_MAX_MS = 90000;
const LIMITE_DIA = 60;
const PROMO_A_CADA_MS = 7 * 86400000;
const FALHAS_PARA_ESPERAR = 3;           // falhas seguidas → espera antes de tentar de novo
const ESPERA_FALHAS_MS = 15 * 60000;
const RODAPE = '\n\n_Pra não receber mais promoções, responda SAIR._';
const FINAIS = new Set(['concluida', 'cancelada']);

const horaSP = (ms) => Number(new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', hourCycle: 'h23' }).format(new Date(ms))) % 24;
const diaSP = (ms) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(ms));   // 2026-11-27
const emMs = (t) => (t && typeof t.toMillis === 'function' ? t.toMillis() : (typeof t === 'number' ? t : 0));
const final4 = (tel) => '…' + String(tel || '').slice(-4);

function comRodape(texto) {
  const t = String(texto || '').trim();
  return /\bSAIR\b/.test(t) ? t : t + RODAPE;
}

// db/FieldValue: Firebase compat. pronto() → WhatsApp conectado.
// resolverChat(numero) → chatId ou null (número sem WhatsApp).
// enviar(chatId, texto) → lança erro se não enviou.
// aoEnviar(chatId, texto, numero): depois de cada envio (contexto da conversa).
// arquivo: onde guardar quantas saíram hoje (o limite sobrevive a um reinício).
function iniciarCampanhas({
  db, FieldValue, uid = '', pronto, resolverChat, enviar, aoEnviar, arquivo,
  agora = Date.now, intervalo, pausaPulo = 2000, limiteDia = LIMITE_DIA, horaInicio = HORA_INICIO, horaFim = HORA_FIM,
  log = console.log,
}) {
  const esperaEntre = intervalo || (() => INTERVALO_MIN_MS + Math.random() * (INTERVALO_MAX_MS - INTERVALO_MIN_MS));
  let campanhas = new Map();   // id → dados (do onSnapshot)
  let timer = null, ocupado = false, deNovo = false, parado = false;
  let falhasSeguidas = 0, esperarAte = 0;

  let hoje = { dia: '', qtd: 0 };
  try { if (arquivo) hoje = { ...hoje, ...JSON.parse(fs.readFileSync(arquivo, 'utf8')) }; } catch (e) { /* primeira vez */ }
  const enviadasHoje = () => (hoje.dia === diaSP(agora()) ? Number(hoje.qtd) || 0 : 0);
  function contarHoje() {
    const dia = diaSP(agora());
    hoje = { dia, qtd: (hoje.dia === dia ? Number(hoje.qtd) || 0 : 0) + 1 };
    if (arquivo) { try { fs.writeFileSync(arquivo, JSON.stringify(hoje)); } catch (e) { log(`⚠️ campanhas: não salvou o contador do dia (${e.message})`); } }
  }

  const refCamp = (id) => db.collection('campanhas').doc(id);
  const ts = () => FieldValue.serverTimestamp();

  // Estado da campanha pro painel. Só escreve quando muda (cada escrita custa).
  async function estado(id, est, obs = '') {
    const c = campanhas.get(id);
    const p = (c && c.progresso) || {};
    if (p.estado === est && (p.obs || '') === obs) return;
    if (c) c.progresso = { ...p, estado: est, obs };
    await refCamp(id).update({ 'progresso.estado': est, 'progresso.obs': obs, 'progresso.atualizadoEm': ts() })
      .catch((e) => log(`⚠️ campanhas: não atualizou o andamento (${e.message})`));
  }
  async function contar(id, campo) {
    const c = campanhas.get(id);
    if (c) c.progresso = { ...(c.progresso || {}), estado: 'enviando', obs: '' };
    await refCamp(id).update({
      [`progresso.${campo}`]: FieldValue.increment(1),
      'progresso.estado': 'enviando', 'progresso.obs': '', 'progresso.atualizadoEm': ts(),
    }).catch((e) => log(`⚠️ campanhas: não contou o envio (${e.message})`));
  }

  // Pausar / cancelar no painel: reflete na hora, mesmo no meio de uma espera.
  async function refletirComandos() {
    for (const [id, c] of campanhas) {
      if (FINAIS.has((c.progresso || {}).estado)) continue;
      if (c.comando === 'cancelar') { await estado(id, 'cancelada'); log(`📣 campanha "${c.nome || id}" cancelada no painel`); }
      else if (c.comando === 'pausar') await estado(id, 'pausada');
    }
  }

  async function reservar(ref) {
    let ok = false;
    await db.runTransaction(async (t) => {
      const d = await t.get(ref);
      if (!d.exists || d.data().status !== 'pendente') return;
      t.update(ref, { status: 'enviando', bot: uid, atualizadoEm: ts() });
      ok = true;
    });
    return ok;
  }

  // Um cliente. Devolve 'enviado' | 'pulado' | 'falhou'.
  async function enviarUm(campId, envioId, e) {
    const ref = refCamp(campId).collection('envios').doc(envioId);
    const fim = async (status, campo, extra = {}) => {
      await ref.update({ status, ...extra, atualizadoEm: ts() }).catch((err) => log(`⚠️ campanhas: não marcou o envio (${err.message})`));
      await contar(campId, campo);
    };
    const tel = String(e.tel || envioId).replace(/\D/g, '');
    const idCliente = e.clienteId || tel;
    const numero = numeroWhatsApp(tel);
    if (!numero) { await fim('sem-whatsapp', 'semWhatsapp'); return 'pulado'; }

    let cli = null;
    try { const d = await db.collection('clientes').doc(idCliente).get(); cli = d.exists ? d.data() : null; } catch (err) { /* sem cadastro: envia */ }
    if (cli && cli.semPromo) { await fim('saiu', 'pulados'); log(`📣 ${final4(tel)} pediu pra não receber promoção — pulado`); return 'pulado'; }
    if (cli && agora() - emMs(cli.ultimaPromoEm) < PROMO_A_CADA_MS) { await fim('recente', 'pulados'); return 'pulado'; }

    let chatId = null;
    try { chatId = await resolverChat(numero); } catch (err) { chatId = undefined; }
    if (chatId === null) { await fim('sem-whatsapp', 'semWhatsapp'); log(`📭 ${final4(tel)} não tem WhatsApp — pulado`); return 'pulado'; }

    const texto = comRodape(e.mensagem);
    try {
      if (!chatId) throw new Error('não consegui achar o número no WhatsApp');
      await enviar(chatId, texto);
    } catch (err) {
      falhasSeguidas++;
      if (falhasSeguidas >= FALHAS_PARA_ESPERAR) esperarAte = agora() + ESPERA_FALHAS_MS;
      await fim('falhou', 'falhas', { erro: String((err && err.message) || err).slice(0, 200) });
      log(`⚠️ campanha: não enviou para ${final4(tel)} (${err && err.message})`);
      return 'falhou';
    }
    falhasSeguidas = 0;
    contarHoje();
    await fim('enviado', 'enviados', { enviadoEm: ts() });
    if (cli) db.collection('clientes').doc(idCliente).update({ ultimaPromoEm: ts() }).catch(() => {});
    if (aoEnviar) await Promise.resolve(aoEnviar(chatId, texto, numero)).catch(() => {});
    log(`📣 campanha: enviada para ${final4(tel)} (${enviadasHoje()}/${limiteDia} hoje)`);
    return 'enviado';
  }

  // Um passo do disparo. Devolve em quantos ms rodar de novo (null = só
  // quando o painel mudar alguma campanha).
  async function passo() {
    await refletirComandos();
    const fila = [...campanhas]
      .filter(([, c]) => c.comando === 'enviar' && !FINAIS.has((c.progresso || {}).estado))
      .sort((a, b) => (a[1].ts || 0) - (b[1].ts || 0));
    if (!fila.length) return null;
    const [id, camp] = fila[0];

    if (!pronto()) { await estado(id, 'aguardando', 'Esperando o WhatsApp do atendente conectar'); return 30000; }
    const h = horaSP(agora());
    if (h < horaInicio || h >= horaFim) {
      await estado(id, 'aguardando', `Fora do horário de envio (${horaInicio}h às ${horaFim}h). Continua sozinho no próximo horário.`);
      return 5 * 60000;
    }
    if (enviadasHoje() >= limiteDia) {
      await estado(id, 'aguardando', `Limite de ${limiteDia} mensagens por dia atingido. Continua amanhã a partir das ${horaInicio}h.`);
      return 15 * 60000;
    }
    if (agora() < esperarAte) {
      await estado(id, 'aguardando', 'Várias mensagens falharam seguidas. Tentando de novo em alguns minutos.');
      return esperarAte - agora();
    }

    const pend = await refCamp(id).collection('envios').where('status', '==', 'pendente').limit(1).get();
    if (pend.empty) {
      await estado(id, 'concluida');
      log(`📣 campanha "${camp.nome || id}" concluída`);
      return 0;
    }
    const doc = pend.docs[0];
    if (!(await reservar(doc.ref))) return 1000;   // outro PC pegou esse
    const r = await enviarUm(id, doc.id, doc.data());
    return r === 'pulado' ? pausaPulo : esperaEntre();   // pulado: nada saiu, não precisa esperar muito
  }

  function agendar(ms) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(ciclo, Math.max(0, ms));
    if (timer.unref) timer.unref();
  }
  async function ciclo() {
    timer = null;
    if (parado) return;
    if (ocupado) { deNovo = true; return; }
    ocupado = true; deNovo = false;
    let prox = null;
    try { prox = await passo(); } catch (e) { log(`⚠️ campanhas: ${e.message}`); prox = 60000; }
    ocupado = false;
    if (parado) return;
    if (prox != null) agendar(prox);
    else if (deNovo) agendar(0);
  }
  // Algo mudou (campanha nova, WhatsApp conectou): roda já, a não ser que
  // esteja no intervalo entre duas mensagens — esse intervalo é respeitado.
  function acordar() {
    if (ocupado) { deNovo = true; return; }
    if (!timer) agendar(0);
  }

  let pararEscuta = () => {};
  function escutar() {
    pararEscuta = db.collection('campanhas').where('bot', '==', true).onSnapshot((snap) => {
      campanhas = new Map(snap.docs.map((d) => [d.id, d.data()]));
      refletirComandos().catch(() => {});
      acordar();
    }, (e) => {
      log(`⚠️ campanhas: parou de escutar o painel (${e.message}) — tentando de novo em 1 min`);
      setTimeout(() => { if (!parado) escutar(); }, 60000).unref();
    });
  }
  escutar();

  return {
    acordar,
    parar: () => { parado = true; if (timer) clearTimeout(timer); try { pararEscuta(); } catch (e) {} },
    enviadasHoje,
  };
}

module.exports = { iniciarCampanhas, comRodape, horaSP, diaSP, LIMITE_DIA, HORA_INICIO, HORA_FIM, RODAPE };
