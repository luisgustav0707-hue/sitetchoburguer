// ── PUSH (FCM) do admin ────────────────────────────────────────
// Notificações de novos pedidos no celular, mesmo com o app fechado.
// No iPhone só funciona com o admin INSTALADO como app (Safari → Compartilhar
// → "Adicionar à Tela de Início") e iOS 16.4+.
//
// A chave VAPID vem do Firebase Console → Configurações do projeto →
// Cloud Messaging → "Certificados push da Web" → Gerar par de chaves.
const VAPID_KEY = 'BPL3u_ADN0fVeFFRrpXkIUAwi3xejXE3QoxGbZdTPAB2uJumsf9x3CkgQhdSxJbWwHce9bgYEfSNF0T1GWRnEVU';

function pushSuportado(){
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}
// Detecta iPhone/iPad rodando fora do modo "app instalado" (aí o push não rola).
function iosPrecisaInstalar(){
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = window.navigator.standalone === true ||
    (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
  return ios && !standalone;
}

async function ativarPushCelular(){
  const btn = document.getElementById('btn-push');
  try{
    if(!pushSuportado()){
      alert('Este navegador não suporta notificações push.');
      return;
    }
    if(iosPrecisaInstalar()){
      alert('📱 No iPhone, primeiro INSTALE o painel como app:\n\n1) Abra pelo Safari\n2) Toque em Compartilhar (□↑)\n3) "Adicionar à Tela de Início"\n4) Abra pelo ícone novo e ative aqui de novo.');
      return;
    }
    if(!firebase.auth().currentUser){ alert('Faça login no admin primeiro.'); return; }
    if(btn) btn.disabled = true;

    const reg = await navigator.serviceWorker.register('/admin/firebase-messaging-sw.js', { scope: '/admin/' });
    const perm = await Notification.requestPermission();
    if(perm !== 'granted'){ alert('Permissão de notificação negada. Ative nas configurações do aparelho.'); return; }

    const msg = firebase.messaging();
    const token = await msg.getToken({ vapidKey: VAPID_KEY, serviceWorkerRegistration: reg });
    if(!token){ alert('Não consegui gerar o token. Tente de novo.'); return; }

    // Salva o token (id = próprio token, evita duplicar o mesmo aparelho).
    await db.collection('push_tokens').doc(token).set({
      criadoEm: firebase.firestore.FieldValue.serverTimestamp(),
      ua: navigator.userAgent,
      uid: firebase.auth().currentUser.uid
    }, { merge: true });

    // App aberto na frente → também mostra a notificação + toca o som.
    msg.onMessage(function(payload){
      const n = payload.notification || {};
      try{ new Notification(n.title || '🔔 Novo pedido', { body: n.body || '', icon: '/logo/logo.png' }); }catch(e){}
      try{ if(typeof tocarNotificacao === 'function') tocarNotificacao(); }catch(e){}
    });

    localStorage.setItem('tcho_push_on', '1');
    atualizarBotaoPush(true);
    alert('✅ Notificações ativadas neste aparelho! Você vai receber os novos pedidos aqui.');
  }catch(e){
    console.error('ativarPushCelular:', e);
    alert('Erro ao ativar: ' + (e && e.message ? e.message : e));
  }finally{
    if(btn) btn.disabled = false;
  }
}

function atualizarBotaoPush(on){
  const btn = document.getElementById('btn-push'); if(!btn) return;
  btn.style.borderColor = on ? '#27ae60' : '#3a3530';
  btn.style.color       = on ? '#27ae60' : 'var(--muted)';
  const t = document.getElementById('push-txt'); if(t) t.textContent = on ? 'Push on' : 'Ativar push';
}

// Estado inicial do botão ao carregar o painel.
(function(){
  const init = function(){
    const jaAtivo = localStorage.getItem('tcho_push_on') === '1' &&
      typeof Notification !== 'undefined' && Notification.permission === 'granted';
    atualizarBotaoPush(jaAtivo);
  };
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
