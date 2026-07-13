// ═══════════════════════════════════════════════════════════════
// whatsappService — camada de envio pela API OFICIAL do WhatsApp
// Business (Meta Cloud API / Graph API). NÃO usa WhatsApp Web nem
// métodos não oficiais. Roda no servidor (Cloud Functions), pois o
// token é secreto e não pode ficar no front-end.
// ───────────────────────────────────────────────────────────────
// Configurar depois (variáveis de ambiente / secrets do Functions):
//   WHATSAPP_TOKEN     -> token de acesso do app Meta (permanente)
//   WHATSAPP_PHONE_ID  -> Phone Number ID do número no WhatsApp Business
//   WHATSAPP_API_VER   -> versão da Graph API (padrão v21.0)
//
// Enquanto não estiver configurado, sendMessage() NÃO envia nada —
// só registra e retorna {enviado:false, motivo:'nao-configurado'}.
// Assim o scaffold pode ir pro ar sem quebrar nada.
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

// Envia uma mensagem de texto simples. Retorna {enviado, id?, motivo?}.
// OBS: mensagens fora da janela de 24h exigem TEMPLATE aprovado na Meta
// (ver sendTemplate abaixo, a implementar quando houver template).
async function sendMessage(phone, message){
  const to = normalizarTelefone(phone);
  if(!to) return { enviado:false, motivo:'telefone-invalido' };
  if(!message) return { enviado:false, motivo:'mensagem-vazia' };
  if(!estaConfigurado()){
    console.log('[whatsappService] API não configurada — não enviado para', to);
    return { enviado:false, motivo:'nao-configurado' };
  }
  const url = `https://graph.facebook.com/${API_VER}/${process.env.WHATSAPP_PHONE_ID}/messages`;
  const body = {
    messaging_product: 'whatsapp',
    to,
    type: 'text',
    text: { body: message },
  };
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
      console.error('[whatsappService] erro Meta API:', resp.status, data);
      return { enviado:false, motivo:'erro-api', status:resp.status, data };
    }
    return { enviado:true, id: data && data.messages && data.messages[0] && data.messages[0].id };
  }catch(e){
    console.error('[whatsappService] falha na requisição:', e);
    return { enviado:false, motivo:'excecao', erro:String(e) };
  }
}

// A IMPLEMENTAR quando houver template aprovado na Meta (mensagens
// proativas fora da janela de 24h). Deixado documentado de propósito.
async function sendTemplate(/* phone, templateName, idioma, componentes */){
  throw new Error('sendTemplate ainda não implementado — criar quando o template for aprovado na Meta.');
}

module.exports = { sendMessage, sendTemplate, normalizarTelefone, estaConfigurado };
