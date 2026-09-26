// Única janela visível do app. Só aparece quando não há pareamento — depois
// disso o app vive na bandeja e o operador nunca mais vê nada.
const { ipcRenderer } = require('electron');
const os = require('os');

const codigoEl = document.getElementById('codigo');
const nomeEl = document.getElementById('nome');
const btnEl = document.getElementById('btn');
const msgEl = document.getElementById('msg');
const btnTesteEl = document.getElementById('btn-teste');
const btnLogEl = document.getElementById('btn-log');

// Sugere o nome do PC: é o que vai aparecer na lista de computadores pareados
// do painel, então precisa identificar a máquina sem o dono ter que pensar.
nomeEl.value = os.hostname() || '';

codigoEl.addEventListener('input', () => {
  codigoEl.value = codigoEl.value.replace(/\D/g, '').slice(0, 6);
});

function setMsg(texto, tipo) {
  msgEl.textContent = texto || '';
  msgEl.className = 'msg' + (tipo ? ' ' + tipo : '');
}

// Rede de segurança da janela: sem isso, qualquer engasgo na ponte com o motor
// (ou internet caída) deixava a tela travada em "Pareando…" pra sempre, sem
// erro e sem poder tentar de novo. São 25s — mais que os 20s do motor, pra o
// erro específico dele ganhar a corrida quando ele consegue responder.
let timeoutPareamento = null;
function destravar() {
  if (timeoutPareamento) { clearTimeout(timeoutPareamento); timeoutPareamento = null; }
  btnEl.disabled = false;
}

function enviar() {
  const codigo = codigoEl.value.trim();
  if (codigo.length !== 6) { setMsg('Digite os 6 números do código.', 'err'); return; }
  btnEl.disabled = true;
  setMsg('Pareando…');
  if (timeoutPareamento) clearTimeout(timeoutPareamento);
  timeoutPareamento = setTimeout(() => {
    destravar();
    setMsg('⚠️ Sem resposta do servidor. Confira a internet deste PC e tente de novo — '
      + 'se o código já passou de 10 minutos, gere outro no painel.', 'err');
  }, 25000);
  ipcRenderer.send('pedido-pareamento', { codigo, nomeDispositivo: nomeEl.value.trim() });
}
btnEl.addEventListener('click', enviar);
codigoEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') enviar(); });
nomeEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') enviar(); });

// Testa a conexão pelo processo principal (https do Node), sem passar pelo
// Firebase: separa "este PC não alcança o servidor" de "o app está com defeito".
btnTesteEl.addEventListener('click', () => {
  btnTesteEl.disabled = true;
  setMsg('Testando conexão com o servidor…');
  ipcRenderer.send('testar-conexao');
});
btnLogEl.addEventListener('click', () => ipcRenderer.send('abrir-log'));
ipcRenderer.on('resultado-conexao', (event, { ok, detalhe }) => {
  btnTesteEl.disabled = false;
  if (ok) setMsg('✅ Conexão OK. ' + detalhe + ' Pode parear.', 'ok');
  else setMsg('❌ ' + detalhe + ' Libere o app no firewall/antivírus deste PC.', 'err');
});

ipcRenderer.on('pareamento-resultado', (event, { ok, lojaNome, erro }) => {
  destravar();
  if (ok) {
    setMsg(`✅ Pareado com "${lojaNome}"! Pode fechar esta janela.`, 'ok');
  } else {
    // O código vale uma vez só: errou, tem que gerar outro no painel.
    const dica = /inválido|usado|expirado/i.test(erro || '')
      ? ' Gere um código novo no painel e tente de novo.' : '';
    setMsg('⚠️ ' + (erro || 'Não foi possível parear.') + dica, 'err');
    codigoEl.value = '';
    codigoEl.focus();
  }
});
