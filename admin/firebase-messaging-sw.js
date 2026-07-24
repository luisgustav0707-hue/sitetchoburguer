/* Service worker do Firebase Cloud Messaging — recebe notificações de novos
   pedidos mesmo com o painel FECHADO (no iPhone, só funciona com o admin
   instalado como app pelo Safari → "Adicionar à Tela de Início").
   Este SW NÃO faz cache de nada (não intercepta fetch), então não interfere
   no anti-cache do site. */
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey:            "AIzaSyAQSUTgLuviU94_SfeRyVh_nLZBDeCzV0Y",
  authDomain:        "tcho-burguer-app.firebaseapp.com",
  projectId:         "tcho-burguer-app",
  storageBucket:     "tcho-burguer-app.firebasestorage.app",
  messagingSenderId: "163710694948",
  appId:             "1:163710694948:web:c8d578b95bb472316ccab1"
});

const messaging = firebase.messaging();

// Mensagem chegando com o app em segundo plano / fechado → mostra a notificação.
messaging.onBackgroundMessage(function(payload){
  const n = payload.notification || {};
  const d = payload.data || {};
  self.registration.showNotification(n.title || '🔔 Novo pedido', {
    body:     n.body || 'Toque para abrir o painel',
    icon:     '/logo/logo.png',
    badge:    '/logo/logo.png',
    tag:      'novo-pedido-' + (d.pedidoId || Date.now()),
    renotify: true,
    vibrate:  [300, 120, 300],
    data:     { url: d.url || '/admin/index.html' }
  });
});

// Toque na notificação → foca o painel se já estiver aberto, senão abre.
self.addEventListener('notificationclick', function(event){
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/admin/index.html';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(list){
      for(const c of list){ if(c.url.includes('/admin') && 'focus' in c) return c.focus(); }
      if(clients.openWindow) return clients.openWindow(url);
    })
  );
});
