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
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const logger = require('firebase-functions/logger');
const wa = require('./services/whatsappService');
const crypto = require('crypto');
// Cupons montados no servidor — cópia espelhada de admin/admin.js.
// Ver o aviso no topo de cupons-srv.js antes de mexer no layout.
const cupons = require('./cupons-srv');

admin.initializeApp();
const db = admin.firestore();
const { FieldValue } = admin.firestore;

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

// ═══════════════════════════════════════════════════════════════
// APP DE IMPRESSÃO AUTOMÁTICA (pasta impressora-automatica/)
// ───────────────────────────────────────────────────────────────
// Substitui a impressão feita pela aba do admin aberta no navegador por um
// app de bandeja rodando no PC da loja — do mesmo jeito que iFood e 99 saem
// sozinhos com aceite automático, sem ninguém clicar e sem depender de ter
// alguma aba aberta.
//
// Fluxo de pareamento (o app NUNCA guarda a senha do dono):
//  1) gerarCodigoImpressora — o dono, logado no painel, gera um código de
//     6 dígitos válido por 10 min (codigosImpressora/{codigo}).
//  2) pareiarImpressora — o app manda o código SEM estar autenticado. A
//     function cria um usuário do Auth dedicado A ESSE computador, com o
//     claim perfil:'impressora' (é isso que o firestore.rules enxerga), e
//     devolve as credenciais dele. Cada PC tem identidade própria, revogável
//     individualmente sem derrubar os outros.
//
//     Por que e-mail/senha gerados e não createCustomToken: assinar um custom
//     token exige a permissão iam.serviceAccounts.signBlob na conta de serviço
//     das functions, que este projeto não tem — e conceder isso é um passo
//     manual no IAM que quebra em toda máquina/projeto novo. O e-mail é
//     sintético (domínio que não existe, ninguém recebe nada), a senha é
//     aleatória de 32 bytes, trafega uma única vez no HTTPS da resposta e o
//     app nunca a guarda: depois do login quem mantém a sessão é o IndexedDB
//     do Firebase. Revogar continua sendo deleteUser(uid).
//  3) enfileirarImpressao — trigger a cada pedido novo: se a loja estiver no
//     modo "app" (config/operacao.impressaoModo), gera o HTML dos cupons no
//     servidor e deixa em impressoes/{pedidoId}. O app só escuta essa fila e
//     imprime — nunca monta cupom sozinho, pra nunca desalinhar do que
//     cupomCozinha()/cupomEntrega() de admin/admin.js produzem.
// ═══════════════════════════════════════════════════════════════

// Mesmo critério do firestore.rules: admin é quem tem doc em /admins/{uid}.
// Checado aqui também porque as regras não valem pra chamada de function.
async function exigirAdmin(auth) {
  if (!auth) throw new HttpsError('unauthenticated', 'Faça login para continuar.');
  const snap = await db.collection('admins').doc(auth.uid).get();
  if (!snap.exists) throw new HttpsError('permission-denied', 'Só o administrador pode fazer isso.');
  return auth.uid;
}

// data: {} — admin logado. Código de 6 dígitos, 10 minutos.
exports.gerarCodigoImpressora = onCall({ region: REGION }, async (request) => {
  await exigirAdmin(request.auth);
  const codigo = String(crypto.randomInt(100000, 999999));
  const expiraEm = Date.now() + 10 * 60 * 1000;
  await db.collection('codigosImpressora').doc(codigo).set({
    criadoEm: FieldValue.serverTimestamp(), expiraEm, usado: false,
  });
  return { codigo, expiraEm };
});

// data: { codigo, nomeDispositivo } — SEM auth (o app ainda não está logado).
exports.pareiarImpressora = onCall({ region: REGION }, async (request) => {
  const { codigo, nomeDispositivo } = request.data || {};
  if (!codigo) throw new HttpsError('invalid-argument', 'Informe o código.');
  const ref = db.collection('codigosImpressora').doc(String(codigo).trim());

  // Transação: o código vale UMA vez só. Sem ela, dois PCs digitando o mesmo
  // código ao mesmo tempo pareariam os dois.
  await db.runTransaction(async (t) => {
    const snap = await t.get(ref);
    if (!snap.exists) throw new HttpsError('not-found', 'Código inválido.');
    const d = snap.data();
    if (d.usado) throw new HttpsError('failed-precondition', 'Este código já foi usado — gere um novo no painel.');
    if (d.expiraEm < Date.now()) throw new HttpsError('failed-precondition', 'Código expirado — gere um novo no painel.');
    t.update(ref, { usado: true, usadoEm: FieldValue.serverTimestamp() });
  });

  const nome = String(nomeDispositivo || 'PC sem nome').slice(0, 60);
  const claims = { perfil: 'impressora' };
  // Domínio inexistente de propósito: é uma identidade de máquina, não de
  // pessoa — nenhum e-mail é enviado nem recebido aqui.
  const email = `impressora-${crypto.randomBytes(8).toString('hex')}@impressora.tchoburguer.invalid`;
  const senha = crypto.randomBytes(24).toString('base64url');
  let uid = null;
  try {
    const user = await admin.auth().createUser({
      email, password: senha, displayName: `Impressora — ${nome}`,
    });
    uid = user.uid;
    await admin.auth().setCustomUserClaims(uid, claims);

    // Só registra o computador na lista do painel DEPOIS que a identidade
    // existe de verdade. Um PC listado que nunca vai imprimir é pior que
    // nenhum: o dono acha que está tudo certo e só descobre quando o pedido
    // não sai.
    await db.collection('impressoras').doc(uid).set({
      nomeDispositivo: nome, pareadoEm: FieldValue.serverTimestamp(),
    });
    logger.info(`Impressora pareada: uid ${uid} (${nome})`);
    return { email, senha, lojaNome: 'Tcho Burguer' };
  } catch (e) {
    // Desfaz tudo e devolve o código pro dono: falhar no meio não pode custar
    // um código queimado nem deixar usuário órfão no Auth.
    if (uid) {
      await admin.auth().deleteUser(uid).catch(() => {});
      await db.collection('impressoras').doc(uid).delete().catch(() => {});
    }
    await ref.update({ usado: false, usadoEm: FieldValue.delete() }).catch(() => {});
    if (e instanceof HttpsError) throw e;
    // Sem isto o app só recebia "internal", que não diz nada a ninguém.
    logger.error('pareiarImpressora falhou:', e);
    const detalhe = (e && e.message) || String(e);
    if (/OPERATION_NOT_ALLOWED|operation-not-allowed/i.test(detalhe)) {
      throw new HttpsError('failed-precondition',
        'O login por e-mail/senha está desativado no Firebase Auth deste projeto — '
        + 'é o mesmo método que o painel usa, ligue em Authentication → Sign-in method.');
    }
    throw new HttpsError('internal', 'Não foi possível parear: ' + detalhe);
  }
});

// data: { uid } — admin. Remove um PC pareado (trocado, vendido, roubado) sem
// afetar os outros: apagar o usuário do Auth corta o acesso na hora.
exports.revogarImpressora = onCall({ region: REGION }, async (request) => {
  await exigirAdmin(request.auth);
  const { uid } = request.data || {};
  if (!uid) throw new HttpsError('invalid-argument', 'uid obrigatório.');
  const ref = db.collection('impressoras').doc(uid);
  if (!(await ref.get()).exists) throw new HttpsError('not-found', 'Computador não encontrado.');
  await admin.auth().deleteUser(uid).catch(() => {});   // pode já ter sumido antes
  await ref.delete();
  return { ok: true };
});

// ═══════════════════════════════════════════════════════════════
// Atendente de WhatsApp (pasta bot-whatsapp/) — mesmo pareamento do app de
// impressão, com identidade própria (perfil:'whatsapp') e coleções próprias:
// um código de bot não pareia impressora e vice-versa.
//
// O que o bot faz no banco (ler cardápio/config, criar pedido, contador,
// estoque, CRM) já é permitido ao site sem login. O login pareado serve pra
// duas coisas só: ler a chave do Gemini (botSegredos/gemini, que o admin
// cadastra no painel) e publicar o próprio status/QR em bots/{uid} — é isso
// que deixa o PC da loja sem nenhum arquivo de chave do Firebase.
// ═══════════════════════════════════════════════════════════════

// data: {} — admin logado. Código de 6 dígitos, 10 minutos.
exports.gerarCodigoBot = onCall({ region: REGION }, async (request) => {
  await exigirAdmin(request.auth);
  const codigo = String(crypto.randomInt(100000, 999999));
  const expiraEm = Date.now() + 10 * 60 * 1000;
  await db.collection('codigosBot').doc(codigo).set({
    criadoEm: FieldValue.serverTimestamp(), expiraEm, usado: false,
  });
  return { codigo, expiraEm };
});

// data: { codigo, nomeDispositivo } — SEM auth (o bot ainda não está logado).
exports.parearBot = onCall({ region: REGION }, async (request) => {
  const { codigo, nomeDispositivo } = request.data || {};
  if (!codigo) throw new HttpsError('invalid-argument', 'Informe o código.');
  const ref = db.collection('codigosBot').doc(String(codigo).replace(/\D/g, '').slice(0, 6) || 'x');

  // Código vale UMA vez (mesmo motivo da transação de pareiarImpressora).
  await db.runTransaction(async (t) => {
    const snap = await t.get(ref);
    if (!snap.exists) throw new HttpsError('not-found', 'Código inválido.');
    const d = snap.data();
    if (d.usado) throw new HttpsError('failed-precondition', 'Este código já foi usado — gere um novo no painel.');
    if (d.expiraEm < Date.now()) throw new HttpsError('failed-precondition', 'Código expirado — gere um novo no painel.');
    t.update(ref, { usado: true, usadoEm: FieldValue.serverTimestamp() });
  });

  const nome = String(nomeDispositivo || 'PC sem nome').slice(0, 60);
  const email = `bot-${crypto.randomBytes(8).toString('hex')}@whatsapp.tchoburguer.invalid`;
  const senha = crypto.randomBytes(24).toString('base64url');
  let uid = null;
  try {
    const user = await admin.auth().createUser({
      email, password: senha, displayName: `Atendente WhatsApp — ${nome}`,
    });
    uid = user.uid;
    await admin.auth().setCustomUserClaims(uid, { perfil: 'whatsapp' });
    await db.collection('bots').doc(uid).set({
      nomeDispositivo: nome, pareadoEm: FieldValue.serverTimestamp(), estado: 'pareado',
    });
    logger.info(`Atendente WhatsApp pareado: uid ${uid} (${nome})`);
    // Diferente do app de impressão (Electron guarda a sessão no IndexedDB),
    // o bot roda em Node, sem persistência de sessão: ele guarda este login
    // de máquina num arquivo local. Revogar = deleteUser + apagar bots/{uid}.
    return { uid, email, senha, lojaNome: 'Tcho Burguer' };
  } catch (e) {
    if (uid) {
      await admin.auth().deleteUser(uid).catch(() => {});
      await db.collection('bots').doc(uid).delete().catch(() => {});
    }
    await ref.update({ usado: false, usadoEm: FieldValue.delete() }).catch(() => {});
    if (e instanceof HttpsError) throw e;
    logger.error('parearBot falhou:', e);
    throw new HttpsError('internal', 'Não foi possível parear: ' + ((e && e.message) || String(e)));
  }
});

// data: { uid } — admin. Remove um PC do atendente. Apagar bots/{uid} faz o
// bot (que escuta o próprio doc) desligar na hora; apagar o usuário corta o
// acesso à chave do Gemini.
exports.revogarBot = onCall({ region: REGION }, async (request) => {
  await exigirAdmin(request.auth);
  const { uid } = request.data || {};
  if (!uid) throw new HttpsError('invalid-argument', 'uid obrigatório.');
  const ref = db.collection('bots').doc(uid);
  if (!(await ref.get()).exists) throw new HttpsError('not-found', 'Computador não encontrado.');
  await admin.auth().deleteUser(uid).catch(() => {});
  await ref.delete();
  return { ok: true };
});

// data: {} — admin. Enfileira um cupom de teste: prova a corrente inteira
// (fila → app → impressora) sem depender de um pedido de verdade chegar.
exports.imprimirTeste = onCall({ region: REGION }, async (request) => {
  await exigirAdmin(request.auth);
  await db.collection('impressoes').add({
    pedidoId: null,                       // avulso: não há pedido pra marcar
    cozinha: cupons.cupomTesteSrv(),
    status: 'pendente',
    criadoEm: FieldValue.serverTimestamp(),
  });
  return { ok: true };
});

// ── "Nº pedido do cliente" (como no iFood: 1º pedido, 5º pedido...) ──
// Conta no HISTÓRICO de pedidos pelo telefone, não no clientes.quantidadePedidos:
// o site e o painel atualizam esse contador em paralelo com a gravação do
// pedido, então lê-lo aqui às vezes já incluiria este pedido, às vezes não.
// Só para a loja (card do Kanban + cupom da cozinha); o cliente não vê.
// Mesma normalização do telefoneLimpo() de bot-whatsapp/pedido.js.
function telDigitos(tel) {
  let d = String(tel || '').replace(/\D/g, '');
  if (d.length >= 12 && d.startsWith('55')) d = d.slice(2);
  if (d.length === 10 && /[6-9]/.test(d[2])) d = d.slice(0, 2) + '9' + d.slice(2);   // celular sem o 9
  return d;
}
async function marcarPedidoDoCliente(ref, p) {
  const tel = telDigitos(p.tel);
  if (tel.length < 10) return null;                  // mesa / balcão sem telefone
  const snap = await db.collection('pedidos').where('telDigitos', '==', tel).select('status').get();
  let n = 1;                                         // este pedido (ainda sem telDigitos)
  snap.forEach((d) => { if (d.id !== ref.id && d.data().status !== 'cancelado') n++; });
  await ref.update({ telDigitos: tel, pedidoDoCliente: n });
  return n;
}

// Roda a cada pedido novo: marca o nº do pedido do cliente e, se a loja
// optou pelo app (impressaoModo:'app'), enfileira o cupom — senão segue tudo
// como antes, com a aba imprimindo.
exports.enfileirarImpressao = onDocumentCreated(
  { region: REGION, document: 'pedidos/{pedidoId}' },
  async (event) => {
    const snap = event.data;
    const p = snap && snap.data();
    if (!p) return;
    try {
      const n = await marcarPedidoDoCliente(snap.ref, p);
      if (n) p.pedidoDoCliente = n;
    } catch (e) {
      logger.warn('pedidoDoCliente:', e.message);       // nunca segura a impressão
    }
    if (p.status !== 'novo') return;
    const { pedidoId } = event.params;

    const opSnap = await db.collection('config').doc('operacao').get();
    const op = opSnap.exists ? opSnap.data() : {};
    if (op.impressaoModo !== 'app') return;      // painel ainda no modo navegador
    if (op.autoImprimir === false) return;       // dono desligou o auto-imprimir

    const pedido = { ...p, id: p.id || pedidoId };
    // doc(pedidoId): se o trigger reprocessar (retry do Firebase), sobrescreve o
    // mesmo documento em vez de enfileirar o cupom duas vezes.
    await db.collection('impressoes').doc(pedidoId).set({
      pedidoId,                                  // o app marca o pedido por este campo
      cozinha: cupons.cupomCozinhaSrv(pedido),
      entrega: cupons.cupomEntregaSrv(pedido),
      status: 'pendente',
      criadoEm: FieldValue.serverTimestamp(),
    });
    logger.info(`enfileirarImpressao: pedido ${pedido.num || pedidoId} na fila`);
  }
);

// ═══════════════════════════════════════════════════════════════
// PAGAMENTO ONLINE — Mercado Pago (ver functions/pagamentos.js)
// ═══════════════════════════════════════════════════════════════
const pagamentos = require('./pagamentos');
exports.criarPagamentoMP = pagamentos.criarPagamentoMP;
exports.criarPixMP = pagamentos.criarPixMP;
exports.cancelarPagamentoMP = pagamentos.cancelarPagamentoMP;
exports.webhookMercadoPago = pagamentos.webhookMercadoPago;
exports.verificarPagamentoMP = pagamentos.verificarPagamentoMP;
