// ═══════════════════════════════════════════════════════════════
// Cloud Functions — CRM / Marketing (automações + WhatsApp oficial)
// ───────────────────────────────────────────────────────────────
// SCAFFOLD: pronto pra deploy, mas o envio real só acontece depois de
// configurar as credenciais da API do WhatsApp (ver functions/README.md).
// Nada aqui roda no site atual (GitHub Pages) — são funções server-side
// no Firebase (plano Blaze). Deploy: `firebase deploy --only functions`.
// ═══════════════════════════════════════════════════════════════

const admin = require('firebase-admin');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');
const wa = require('./services/whatsappService');

admin.initializeApp();
const db = admin.firestore();

const REGION = 'southamerica-east1';
const TZ = 'America/Sao_Paulo';

// Gera um código de cupom individual (mesmo padrão do admin).
function gerarCodigo(nome, pct){
  const base = String(nome || 'CLIENTE')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z]/g, '').toUpperCase().slice(0, 6) || 'CLIENTE';
  const rnd = Math.random().toString(36).slice(2, 5).toUpperCase();
  return `${base}${pct}${rnd}`;
}

// ── 1) Verifica diariamente clientes sem compra ────────────────
// Roda todo dia às 10h (SP). Hoje só identifica/loga os inativos.
// Preparado para, quando a API estiver ligada, gerar cupom + enviar.
exports.verificarClientesInativos = onSchedule(
  { schedule: '0 10 * * *', timeZone: TZ, region: REGION },
  async () => {
    const DIAS = 15;
    const corte = Date.now() - DIAS * 86400000;
    const snap = await db.collection('clientes').get();
    const inativos = [];
    snap.forEach((doc) => {
      const c = doc.data();
      const ult = c.dataUltimaCompra && c.dataUltimaCompra.toDate
        ? c.dataUltimaCompra.toDate().getTime() : 0;
      if(ult && ult < corte) inativos.push({ id: doc.id, ...c });
    });
    logger.info(`Clientes inativos (${DIAS}d+): ${inativos.length}`);

    // TODO (ativar quando o WhatsApp estiver configurado):
    //   for (const c of inativos) {
    //     const codigo = gerarCodigo(c.nome, 10);
    //     await db.collection('cupons').add({ codigo, tipo:'pct', valor:10,
    //       usosMax:1, usosFeitos:0, ativo:true, clienteId:c.id, /* ... */ });
    //     await wa.sendMessage(c.telefone,
    //       `Olá ${c.nome}, sentimos sua falta! Use ${codigo} 🍔`);
    //   }
    return null;
  }
);

// ── 2) Disparo de campanha via API oficial (chamado pelo admin) ─
// data: { destinatarios: [{ telefone, mensagem }] }
exports.enviarCampanha = onCall({ region: REGION }, async (request) => {
  const destinatarios = request.data && request.data.destinatarios;
  if(!Array.isArray(destinatarios) || !destinatarios.length){
    throw new HttpsError('invalid-argument', 'Informe destinatarios: [{telefone, mensagem}]');
  }
  const resultados = [];
  for(const d of destinatarios){
    const r = await wa.sendMessage(d.telefone, d.mensagem);
    resultados.push({ telefone: d.telefone, ...r });
  }
  const enviados = resultados.filter((r) => r.enviado).length;
  logger.info(`enviarCampanha: ${enviados}/${destinatarios.length} enviados`);
  return { total: destinatarios.length, enviados, resultados };
});

// ── 3) Gera cupom individual sob demanda ───────────────────────
// data: { clienteId, nome, pct?, validadeDias? }
exports.gerarCupomCliente = onCall({ region: REGION }, async (request) => {
  const { clienteId, nome, pct = 10, validadeDias = 7 } = request.data || {};
  if(!clienteId) throw new HttpsError('invalid-argument', 'clienteId obrigatorio');
  const codigo = gerarCodigo(nome, pct);
  const validade = new Date(Date.now() + validadeDias * 86400000).toISOString().split('T')[0];
  await db.collection('cupons').add({
    codigo, tipo: 'pct', valor: pct, minimo: 0, usosMax: 1, usosFeitos: 0,
    validade, descricao: 'Cupom automático', item: '', ativo: true,
    criadoEm: new Date().toLocaleDateString('pt-BR'), clienteId,
  });
  return { codigo, validade };
});
