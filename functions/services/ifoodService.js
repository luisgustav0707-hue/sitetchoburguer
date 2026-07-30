// ═══════════════════════════════════════════════════════════════
// ifoodService — integração OFICIAL com a API do iFood (Merchant API).
// Modelo DISTRIBUÍDO (o dono autoriza o app via userCode). Roda no
// servidor (Cloud Functions) porque o clientSecret e os tokens são
// secretos e não podem ficar no front-end.
// ───────────────────────────────────────────────────────────────
// Env/secrets (Functions):
//   IFOOD_CLIENT_ID      -> clientId do app (UUID) — não é segredo
//   IFOOD_CLIENT_SECRET  -> clientSecret do app — SEGREDO
// Tokens (accessToken/refreshToken) ficam no Firestore: ifood_auth/tokens
// (só o servidor acessa; regra nega leitura pelo cliente).
// Docs: https://developer.ifood.com.br  (base: merchant-api.ifood.com.br)
// ═══════════════════════════════════════════════════════════════

const BASE = 'https://merchant-api.ifood.com.br';
// Lidos em tempo de execução (secrets do Functions só entram no process.env
// quando a função roda, não no carregamento do módulo).
const cid  = () => process.env.IFOOD_CLIENT_ID || '';
const csec = () => process.env.IFOOD_CLIENT_SECRET || '';

function configurado(){ return !!(cid() && csec()); }

// POST form-urlencoded (usado só no fluxo de autenticação).
async function postForm(path, params){
  try{
    const r = await fetch(BASE + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params),
    });
    let data = null; try{ data = await r.json(); }catch(e){}
    return { ok: r.ok, status: r.status, data };
  }catch(e){ return { ok:false, status:0, data:{ erro:String(e) } }; }
}

// ── AUTENTICAÇÃO (modelo distribuído / userCode) ───────────────
// Passo 1: gera o código pro dono autorizar no portal do iFood.
async function gerarUserCode(){
  return postForm('/authentication/v1.0/oauth/userCode', { clientId: cid() });
}
// Passo 2: troca o userCode autorizado por accessToken + refreshToken.
async function trocarUserCode(db, userCode, verifier){
  const r = await postForm('/authentication/v1.0/oauth/token', {
    grantType: 'authorization_code',
    clientId: cid(), clientSecret: csec(),
    authorizationCode: userCode, authorizationCodeVerifier: verifier,
  });
  if(r.ok && r.data) await salvarTokens(db, r.data);
  return r;
}
async function salvarTokens(db, d){
  await db.collection('ifood_auth').doc('tokens').set({
    accessToken: d.accessToken,
    refreshToken: d.refreshToken,
    expiresAt: Date.now() + ((d.expiresIn || 0) * 1000) - 60000, // 1min de margem
    atualizadoEm: Date.now(),
  }, { merge: true });
}
// Retorna um accessToken válido; renova via refreshToken se expirou.
async function getToken(db){
  const doc = await db.collection('ifood_auth').doc('tokens').get();
  if(!doc.exists) return null;
  const t = doc.data() || {};
  if(t.accessToken && Date.now() < (t.expiresAt || 0)) return t.accessToken;
  if(!t.refreshToken) return null;
  const r = await postForm('/authentication/v1.0/oauth/token', {
    grantType: 'refresh_token',
    clientId: cid(), clientSecret: csec(),
    refreshToken: t.refreshToken,
  });
  if(!r.ok || !r.data){ console.error('[ifood] refresh falhou', r.status, r.data); return null; }
  await salvarTokens(db, r.data);
  return r.data.accessToken;
}

// ── CHAMADAS AUTENTICADAS (Order/Merchant API) ─────────────────
async function api(method, path, token, { body, headers } = {}){
  try{
    const r = await fetch(BASE + path, {
      method,
      headers: {
        'Authorization': 'Bearer ' + token,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(headers || {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    let data = null; try{ data = await r.json(); }catch(e){}
    return { ok: r.ok, status: r.status, data };
  }catch(e){ return { ok:false, status:0, data:{ erro:String(e) } }; }
}

async function merchants(token){ return api('GET', '/merchant/v1.0/merchants', token); }

// Eventos: polling (a cada ~30s) e acknowledgment (confirmar consumo).
async function pollEvents(token, merchantIds){
  const headers = {};
  if(merchantIds) headers['x-polling-merchants'] = Array.isArray(merchantIds) ? merchantIds.join(',') : String(merchantIds);
  return api('GET', '/order/v1.0/events:polling', token, { headers });
}
async function acknowledge(token, eventIds){
  if(!eventIds || !eventIds.length) return { ok:true, status:200, data:null };
  return api('POST', '/order/v1.0/events/acknowledgment', token, { body: eventIds.map(id => ({ id })) });
}

// Detalhe + ações do ciclo do pedido.
async function getOrder(token, id){ return api('GET', `/order/v1.0/orders/${id}`, token); }
async function confirm(token, id){ return api('POST', `/order/v1.0/orders/${id}/confirm`, token); }
async function startPreparation(token, id){ return api('POST', `/order/v1.0/orders/${id}/startPreparation`, token); }
async function readyToPickup(token, id){ return api('POST', `/order/v1.0/orders/${id}/readyToPickup`, token); }
async function dispatch(token, id){ return api('POST', `/order/v1.0/orders/${id}/dispatch`, token); }
async function cancellationReasons(token, id){ return api('GET', `/order/v1.0/orders/${id}/cancellationReasons`, token); }
async function requestCancellation(token, id, cancellationCode, reason){
  return api('POST', `/order/v1.0/orders/${id}/requestCancellation`, token, {
    body: { reason: reason || 'Cancelado pela loja', cancellationCode: cancellationCode || '506' },
  });
}

module.exports = {
  configurado, gerarUserCode, trocarUserCode, getToken, salvarTokens,
  merchants, pollEvents, acknowledge, getOrder,
  confirm, startPreparation, readyToPickup, dispatch,
  cancellationReasons, requestCancellation,
};
