// ── MOTOR (janela oculta) ──────────────────────────────────────────
// Roda o Firebase (mesma API compat/v8 usada em admin/admin.js), fica
// escutando a coleção `impressoes` e manda o processo principal imprimir.
// Nunca decide layout de cupom: o HTML vem pronto da Cloud Function
// enfileirarImpressao (functions/index.js + functions/cupons-srv.js).
//
// nodeIntegration:true + contextIsolation:false SÓ nesta janela, porque ela
// nunca carrega conteúdo remoto nem de terceiros — só este engine.html.
const { ipcRenderer } = require('electron');

// Responde ao ping ANTES de qualquer coisa que possa falhar. Se o handler
// ficasse lá embaixo, um erro ao carregar o Firebase deixaria o motor mudo e a
// tela de pareamento culparia o servidor ("não respondeu") por um defeito que
// é do próprio app. Com o ping aqui, o principal sempre distingue os dois.
ipcRenderer.on('ping', () => ipcRenderer.send('pong'));
window.onerror = (msg, src, linha, col, err) => {
  ipcRenderer.send('motor-erro', String((err && err.stack) || msg));
};

const os = require('os');
const firebaseConfig = require('./firebase-config.js');

// `firebase` vem dos <script> do engine.html (build de navegador) — ver o
// comentário lá sobre por que não dá pra usar require() aqui.
const REGION = 'southamerica-east1';
let auth, db;
try {
  firebase.initializeApp(firebaseConfig);
  auth = firebase.auth();
  db = firebase.firestore();
  ipcRenderer.send('motor-pronto');   // deixa rastro no log de que o motor subiu inteiro
} catch (e) {
  ipcRenderer.send('motor-erro', 'Falha ao iniciar o Firebase: ' + ((e && e.message) || e));
  throw e;
}
function chamar(nome) { return firebase.app().functions(REGION).httpsCallable(nome); }

let unsubFila = null;
function pararEscuta() {
  if (unsubFila) { unsubFila(); unsubFila = null; }
}

async function parear(codigo, nomeDispositivo) {
  const nome = (nomeDispositivo || os.hostname() || 'PC sem nome').slice(0, 60);
  // A function devolve um e-mail/senha gerados só pra ESTE computador (ver o
  // comentário dela em functions/index.js sobre por que não é custom token).
  const { data } = await chamar('pareiarImpressora')({ codigo, nomeDispositivo: nome });
  // Sessão normal do Firebase Auth — e como a janela usa uma partition
  // persistente, ela sobrevive a reinícios do PC sozinha. A senha não é
  // guardada em lugar nenhum: quem lembra do login é o IndexedDB.
  await auth.signInWithEmailAndPassword(data.email, data.senha);
  return data;
}

ipcRenderer.on('parear', async (event, { codigo, nomeDispositivo }) => {
  try {
    // Timeout próprio: quando firewall ou antivírus engole a conexão, o SDK do
    // Firebase fica pendurado indefinidamente — sem erro, sem timeout — e a
    // janela travava em "Pareando…" pra sempre.
    const r = await Promise.race([
      parear(codigo, nomeDispositivo),
      new Promise((_, rej) => setTimeout(
        () => rej(new Error('O servidor não respondeu em 20s. O firewall ou o antivírus deste PC pode estar bloqueando.')), 20000)),
    ]);
    ipcRenderer.send('pareamento-ok', r);
  } catch (e) {
    const cod = e && e.code ? ` (${e.code})` : '';
    ipcRenderer.send('pareamento-erro', ((e && e.message) || String(e)) + cod);
  }
});

ipcRenderer.on('desparear', async () => {
  pararEscuta();
  await auth.signOut().catch(() => {});
});

function escutarFila() {
  pararEscuta();
  unsubFila = db.collection('impressoes').where('status', '==', 'pendente')
    .onSnapshot((snap) => {
      snap.docChanges().forEach((change) => {
        if (change.type !== 'added') return;
        const d = change.doc.data();
        // Cada via tem sua FINALIDADE, e cada finalidade pode sair numa
        // impressora diferente (pedido na térmica da cozinha, conta no caixa).
        const vias = ['cozinha', 'entrega', 'caixa']
          .filter((tipo) => d[tipo])
          .map((tipo) => ({ tipo, html: d[tipo] }));
        if (!vias.length) return;
        ipcRenderer.send('imprimir', { id: change.doc.id, pedidoId: d.pedidoId || null, vias });
      });
    }, (err) => ipcRenderer.send('motor-erro', 'fila: ' + ((err && err.message) || err)));
}

auth.onAuthStateChanged(async (user) => {
  pararEscuta();
  if (!user) { ipcRenderer.send('status', { conectado: false }); return; }
  try {
    // Confere o claim antes de escutar: sem ele o Firestore recusaria a query e
    // o app ficaria "conectado" sem nunca imprimir nada — o pior dos estados,
    // porque parece que está tudo certo.
    const token = await user.getIdTokenResult();
    if (token.claims.perfil !== 'impressora') {
      ipcRenderer.send('status', { conectado: false, erro: 'Esta conta não é de impressora. Pareie de novo.' });
      return;
    }
    ipcRenderer.send('status', { conectado: true, lojaNome: 'Tcho Burguer' });
    escutarFila();
  } catch (e) {
    ipcRenderer.send('status', { conectado: false, erro: (e && e.message) || String(e) });
  }
});

// O principal avisa aqui quando terminou de mandar os cupons pra impressora:
// fecha o trabalho na fila e marca o pedido, pro Kanban do navegador (se
// estiver aberto) não achar que falta imprimir.
ipcRenderer.on('impresso', (event, { id, pedidoId }) => {
  db.collection('impressoes').doc(id)
    .update({ status: 'impresso', impressoEm: firebase.firestore.FieldValue.serverTimestamp() })
    .catch(() => {});
  // Cupom de teste e reimpressão avulsa não têm pedido pra marcar.
  if (pedidoId) {
    db.collection('pedidos').doc(pedidoId).update({ impresso: true }).catch(() => {});
  }
});
