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
const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore');
const logger = require('firebase-functions/logger');
const wa = require('./services/whatsappService');

// Secrets da API oficial do WhatsApp (Meta Cloud API).
const WA_SECRETS = ['WHATSAPP_TOKEN', 'WHATSAPP_PHONE_ID'];

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
exports.enviarCampanha = onCall({ region: REGION, secrets: WA_SECRETS }, async (request) => {
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

// ── 4) Push de novo pedido ─────────────────────────────────────
// Dispara quando um pedido é criado e manda notificação push pra todos os
// aparelhos cadastrados em `push_tokens` (o admin ativa pelo botão 📱).
// Falhar aqui NÃO afeta o pedido — é 100% adicional.
exports.notificarNovoPedido = onDocumentCreated(
  { document: 'pedidos/{id}', region: REGION },
  async (event) => {
    const snap = event.data;
    if(!snap) return;
    const p = snap.data() || {};
    if(p.status && p.status !== 'novo') return;   // só avisa pedido novo

    const tokSnap = await db.collection('push_tokens').get();
    const tokens = tokSnap.docs.map((d) => d.id).filter(Boolean);
    if(!tokens.length){ logger.info('notificarNovoPedido: sem tokens cadastrados'); return; }

    const tipo = p.tipo === 'delivery' ? '🛵 Delivery'
      : p.tipo === 'mesa' ? `🍽️ Mesa ${p.mesaNumero || ''}`.trim()
      : '🏃 Retirada';
    const title = `🔔 Novo pedido ${p.num || ''}`.trim();
    const body = `${p.nome || 'Cliente'} · ${tipo} · R$${p.total != null ? p.total : '?'}`;

    const message = {
      tokens,
      notification: { title, body },
      data: { url: '/admin/index.html', pedidoId: String(event.params.id) },
      webpush: {
        headers: { Urgency: 'high' },
        fcmOptions: { link: 'https://tchoburguer.com/admin/index.html' },
      },
    };

    const resp = await admin.messaging().sendEachForMulticast(message);
    logger.info(`notificarNovoPedido: ${resp.successCount}/${tokens.length} enviados`);

    // Remove tokens que não valem mais (aparelho desinstalou / expirou).
    const limpar = [];
    resp.responses.forEach((r, i) => {
      if(!r.success){
        const code = (r.error && r.error.code) || '';
        if(code.includes('registration-token-not-registered') || code.includes('invalid-argument')){
          limpar.push(db.collection('push_tokens').doc(tokens[i]).delete().catch(() => {}));
        }
      }
    });
    if(limpar.length) await Promise.all(limpar);
  }
);

// ── 5) WhatsApp automático ao mudar a etapa do pedido ──────────
// Dispara quando o `status` de um pedido MUDA e envia um TEMPLATE
// aprovado na Meta para o cliente (ex.: "saiu para entrega").
// Config em config/operacao.whatsAuto:
//   { ativo:true, stages:{ entrega:{template:'pedido_saiu_entrega', lang:'pt_BR', params:['nome','num']}, ... } }
// Os `params` são preenchidos na ordem ({{1}},{{2}}...) a partir do pedido.
function resolverParamWpp(key, p){
  const nome = String(p.nome || '').trim().split(' ')[0] || 'cliente';
  switch(key){
    case 'nome':         return nome;
    case 'nomeCompleto': return p.nome || '';
    case 'num':          return p.num || ('#' + (p.id || ''));
    case 'total':        return 'R$' + (p.total != null ? p.total : '');
    case 'tipo':         return p.tipo === 'delivery' ? 'Delivery' : (p.tipo === 'mesa' ? 'Mesa' : 'Retirada');
    case 'bairro':       return p.bairro || '';
    case 'endereco':     return p.endereco || '';
    case 'loja':         return 'Tcho Burguer';
    default:             return '';
  }
}

exports.whatsappStatusPedido = onDocumentUpdated(
  { document: 'pedidos/{id}', region: REGION, secrets: WA_SECRETS },
  async (event) => {
    if(!event.data) return;
    const before = event.data.before.data() || {};
    const after  = event.data.after.data() || {};
    const novo = after.status;
    if(before.status === novo) return;            // só quando o status muda de fato
    if(!after.tel) return;                          // sem telefone → nada a enviar

    const cfgDoc = await db.collection('config').doc('operacao').get();
    const wc = (cfgDoc.exists && cfgDoc.data().whatsAuto) || {};
    if(!wc.ativo) return;                           // automação desligada
    const sc = wc.stages && wc.stages[novo];
    if(!sc || !sc.template) return;                // etapa sem template configurado

    const params = (sc.params || []).map(k => resolverParamWpp(k, after));
    const r = await wa.sendTemplate(after.tel, sc.template, sc.lang || 'pt_BR', params);
    logger.info(`whatsappStatusPedido: pedido ${event.params.id} → ${novo} → ${r.enviado ? 'ENVIADO' : 'nao-enviado ('+(r.motivo||'?')+')'}`);

    // Log pra auditoria/depuração (não bloqueia se falhar).
    db.collection('whatsapp_logs').add({
      pedidoId: event.params.id, status: novo,
      tel: wa.normalizarTelefone(after.tel), template: sc.template,
      enviado: !!r.enviado, motivo: r.motivo || null, wamid: r.id || null,
      em: admin.firestore.FieldValue.serverTimestamp(),
    }).catch(() => {});
  }
);
