// ═══════════════════════════════════════════════════════════════
// whatsappService — envio pela API OFICIAL do WhatsApp Business
// (Meta Cloud API / Graph API). NÃO usa WhatsApp Web nem métodos
// não oficiais. Roda no servidor (Cloud Functions) porque o token
// é secreto e não pode ficar no front-end.
// ───────────────────────────────────────────────────────────────
// Secrets/vars de ambiente (Functions):
//   WHATSAPP_TOKEN     -> token permanente do app Meta (System User)
//   WHATSAPP_PHONE_ID  -> Phone Number ID do número no WhatsApp Business
//   WHATSAPP_API_VER   -> versão da Graph API (padrão v21.0; atual v25.0)
//
// Sem credenciais, os envios NÃO acontecem — retornam
// {enviado:false, motivo:'nao-configurado'} pra não quebrar nada.
// Docs: https://developers.facebook.com/docs/whatsapp/cloud-api
// ═══════════════════════════════════════════════════════════════

const API_VER = process.env.WHATSAPP_API_VER || 'v21.0';

function estaConfigurado(){
  return !!(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID);
}

// Normaliza para formato internacional (55 + DDD + número), só dígitos.
function normalizarTelefone(phone){
  let t = String(phone || '').replace(/\D/g, '');
  if(!t) return '';
  if(!t.startsWith('55')) t = '55' + t;
  return t;
}

// POST único pra Graph API (reaproveitado por texto e template).
async function postToMeta(body){
  const url = `https://graph.facebook.com/${API_VER}/${process.env.WHATSAPP_PHONE_ID}/messages`;
  try{
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const data = await resp.json().catch(() => ({}));
    if(!resp.ok){
      console.error('[whatsappService] erro Meta API:', resp.status, JSON.stringify(data).slice(0, 500));
      return { enviado:false, motivo:'erro-api', status:resp.status, data };
    }
    return { enviado:true, id: data && data.messages && data.messages[0] && data.messages[0].id };
  }catch(e){
    console.error('[whatsappService] falha na requisição:', e);
    return { enviado:false, motivo:'excecao', erro:String(e) };
  }
}

// Mensagem de TEXTO simples. Só funciona DENTRO da janela de 24h
// (depois que o cliente te mandou msg). Fora dela, use sendTemplate.
async function sendMessage(phone, message){
  const to = normalizarTelefone(phone);
  if(!to) return { enviado:false, motivo:'telefone-invalido' };
  if(!message) return { enviado:false, motivo:'mensagem-vazia' };
  if(!estaConfigurado()){
    console.log('[whatsappService] API não configurada — texto não enviado para', to);
    return { enviado:false, motivo:'nao-configurado' };
  }
  return postToMeta({
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'text',
    text: { body: message },
  });
}

// Mensagem de TEMPLATE aprovado na Meta — é o que permite avisar o
// cliente PROATIVAMENTE (ex.: "seu pedido saiu para entrega"), fora
// da janela de 24h.
//   phone        -> telefone do cliente
//   templateName -> nome EXATO do template aprovado (ex.: 'pedido_saiu_entrega')
//   langCode     -> idioma do template (ex.: 'pt_BR')
//   bodyParams   -> array de strings que preenchem {{1}}, {{2}}, ... na ordem
async function sendTemplate(phone, templateName, langCode, bodyParams){
  const to = normalizarTelefone(phone);
  if(!to) return { enviado:false, motivo:'telefone-invalido' };
  if(!templateName) return { enviado:false, motivo:'template-vazio' };
  if(!estaConfigurado()){
    console.log('[whatsappService] API não configurada — template não enviado para', to);
    return { enviado:false, motivo:'nao-configurado' };
  }
  const components = [];
  if(Array.isArray(bodyParams) && bodyParams.length){
    components.push({
      type: 'body',
      parameters: bodyParams.map(v => ({ type: 'text', text: String(v == null ? '' : v) })),
    });
  }
  const template = { name: templateName, language: { code: langCode || 'pt_BR' } };
  if(components.length) template.components = components;
  return postToMeta({
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'template',
    template,
  });
}

module.exports = { sendMessage, sendTemplate, normalizarTelefone, estaConfigurado };
