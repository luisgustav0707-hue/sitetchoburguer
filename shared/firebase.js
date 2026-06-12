// ── CONFIGURAÇÃO FIREBASE ─────────────────────────────────────────
const firebaseConfig = {
  apiKey:            "AIzaSyAQSUTgLuviU94_SfeRyVh_nLZBDeCzV0Y",
  authDomain:        "tcho-burguer-app.firebaseapp.com",
  projectId:         "tcho-burguer-app",
  storageBucket:     "tcho-burguer-app.firebasestorage.app",
  messagingSenderId: "163710694948",
  appId:             "1:163710694948:web:c8d578b95bb472316ccab1"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
