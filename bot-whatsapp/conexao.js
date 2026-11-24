// ═══════════════════════════════════════════════════════════════
// Conexão com o Firebase por PAREAMENTO (igual ao app de impressão)
// ───────────────────────────────────────────────────────────────
// Na primeira vez o bot pede o código de 6 dígitos gerado no painel
// (Configurações → WhatsApp). A function parearBot devolve um login de
// máquina (perfil 'whatsapp'), que fica salvo em pareamento.json nesta pasta.
// Sem serviceAccount.json: o PC da loja não guarda nenhuma chave do Firebase.
//
// Com esse login o bot:
//  • lê a chave do Gemini cadastrada no painel (botSegredos/gemini);
//  • publica o status e o QR Code em bots/{uid}, que o painel mostra;
//  • escuta bots/{uid}: se sumir (removido no painel), desliga e esquece o
//    pareamento.
// Pedidos, contador, estoque e CRM seguem as mesmas regras do site.
// ═══════════════════════════════════════════════════════════════

const fs = require('fs');
const os = require('os');
const path = require('path');
const readline = require('readline');
const firebase = require('firebase/compat/app');
require('firebase/compat/auth');
require('firebase/compat/firestore');
require('firebase/compat/functions');
const CONFIG = require('./firebase-config');

const REGIAO = 'southamerica-east1';
const ARQ = path.join(__dirname, 'pareamento.json');
const VERSAO = require('./package.json').version;

function lerPareamento() {
  try {
    const p = JSON.parse(fs.readFileSync(ARQ, 'utf8'));
    return p && p.email && p.senha ? p : null;
  } catch (e) { return null; }
}
function esquecerPareamento() { try { fs.unlinkSync(ARQ); } catch (e) {} }

function perguntar(txt) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((r) => rl.question(txt, (resp) => { rl.close(); r(String(resp || '').trim()); }));
}

async function parear() {
  console.log('\n══════════════════════════════════════════════════════');
  console.log('  PAREAR ESTE COMPUTADOR');
  console.log('  No painel do Tcho: Configurações → WhatsApp → "Gerar código".');
  console.log('══════════════════════════════════════════════════════\n');
  const nome = os.hostname();
  for (;;) {
    const codigo = (await perguntar('  Digite o código de 6 dígitos e aperte Enter: ')).replace(/\D/g, '');
    if (codigo.length !== 6) { console.log('  O código tem 6 números. Tente de novo.\n'); continue; }
    try {
      const { data } = await firebase.app().functions(REGIAO).httpsCallable('parearBot')({ codigo, nomeDispositivo: nome });
      const p = { uid: data.uid, email: data.email, senha: data.senha, nome, pareadoEm: new Date().toISOString() };
      fs.writeFileSync(ARQ, JSON.stringify(p, null, 2));
      console.log(`\n  ✅ Pareado com "${data.lojaNome}" (este PC aparece no painel como "${nome}").\n`);
      return p;
    } catch (e) {
      console.log(`  ⚠️  ${e.message || e}\n`);
    }
  }
}

// Erros de login que significam "esse pareamento não existe mais".
const PAREAMENTO_MORTO = /user-not-found|invalid-credential|invalid-login-credentials|user-disabled|wrong-password|invalid-email/i;

// Conecta e devolve { db, FieldValue, uid, status(), aoRemover(fn) }.
async function conectar() {
  if (!firebase.apps.length) firebase.initializeApp(CONFIG);
  const auth = firebase.auth();
  let par = lerPareamento();
  for (;;) {
    if (!par) par = await parear();
    try {
      await auth.signInWithEmailAndPassword(par.email, par.senha);
      break;
    } catch (e) {
      if (PAREAMENTO_MORTO.test(`${e.code} ${e.message}`)) {
        console.log('\n⚠️  Este computador não está mais pareado (foi removido no painel). Pareie de novo.');
        esquecerPareamento();
        par = null;
        continue;
      }
      throw new Error(`não conectou ao Firebase (${e.message})`);   // internet: o INICIAR.bat reinicia
    }
  }

  const uid = auth.currentUser.uid;
  const db = firebase.firestore();
  const FieldValue = firebase.firestore.FieldValue;
  const ref = db.collection('bots').doc(uid);

  // Status pro painel. Falha de status nunca derruba o atendimento.
  let ultimo = {};
  function status(campos) {
    ultimo = { ...ultimo, ...campos };
    return ref.update({ ...campos, versao: VERSAO, atualizadoEm: FieldValue.serverTimestamp() })
      .catch((e) => { if (!/not-found/i.test(e.code || '')) console.warn('[painel] status não atualizado:', e.message); });
  }
  // Batimento: o painel considera offline sem notícia há mais de 3 minutos.
  setInterval(() => status({}), 60000).unref();

  // Removido no painel → desliga.
  const aoRemover = [];
  ref.onSnapshot((d) => {
    if (d.exists) return;
    console.log('\n⚠️  Este computador foi removido no painel. Desligando o atendente.');
    esquecerPareamento();
    aoRemover.forEach((fn) => { try { fn(); } catch (e) {} });
  }, () => {});

  // Chave do Gemini: a do .env (se houver) tem preferência; senão a do painel.
  const chaveLocal = !!process.env.GEMINI_API_KEY;
  const aoChave = [];
  if (!chaveLocal) {
    db.collection('botSegredos').doc('gemini').onSnapshot((d) => {
      const chave = d.exists ? String(d.data().chave || '').trim() : '';
      if (!chave) console.warn('⚠️  Chave do Gemini não cadastrada. No painel: Configurações → WhatsApp → Chave do Gemini.');
      aoChave.forEach((fn) => fn(chave));
    }, (e) => console.warn('[painel] não leu a chave do Gemini:', e.message));
  }

  return {
    db, FieldValue, uid, status,
    nome: par.nome || os.hostname(),
    aoRemover: (fn) => aoRemover.push(fn),
    aoChave: (fn) => { if (chaveLocal) fn(process.env.GEMINI_API_KEY); else aoChave.push(fn); },
  };
}

module.exports = { conectar, VERSAO };
