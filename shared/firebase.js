// ── CONFIGURAÇÃO FIREBASE ─────────────────────────────────────────
// Substitua pelos dados do seu projeto em:
// console.firebase.google.com → Seu projeto → ⚙️ Configurações → Apps → Adicionar app web
const firebaseConfig = {
  apiKey:            "COLE_AQUI",
  authDomain:        "COLE_AQUI.firebaseapp.com",
  projectId:         "COLE_AQUI",
  storageBucket:     "COLE_AQUI.appspot.com",
  messagingSenderId: "COLE_AQUI",
  appId:             "COLE_AQUI"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
