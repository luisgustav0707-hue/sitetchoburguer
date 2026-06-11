// ── CONFIGURAÇÃO FIREBASE ─────────────────────────────────────────
// Substitua pelos dados do seu projeto em:
// console.firebase.google.com → Seu projeto → ⚙️ Configurações → Apps → Adicionar app web
const firebaseConfig = {
  apiKey:            "AIzaSyDgHsEkqkYg4BT6xtLJKMefegKu49xhVTM",
  authDomain:        "tcho-burguer.firebaseapp.com",
  projectId:         "tcho-burguer",
  storageBucket:     "tcho-burguer.firebasestorage.app",
  messagingSenderId: "452780220212",
  appId:             "1:452780220212:web:56e47063c8fad07224cf61"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
db.settings({ experimentalForceLongPolling: true, experimentalAutoDetectLongPolling: false, merge: true });
