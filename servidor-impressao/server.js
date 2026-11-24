/**
 * TCHO BURGUER — Servidor de Impressão Automática
 * Roda em http://localhost:3333
 * Recebe pedidos do painel admin e imprime automaticamente
 */

const http = require('http');
const fs   = require('fs');
const path = require('path');
const { exec } = require('child_process');
const os   = require('os');

// ── Localiza Chrome ou Edge instalado no Windows ─────────────
function getChromePath() {
  const candidatos = [
    // Google Chrome — caminhos comuns
    process.env['PROGRAMFILES']        + '\\Google\\Chrome\\Application\\chrome.exe',
    process.env['PROGRAMFILES(X86)']   + '\\Google\\Chrome\\Application\\chrome.exe',
    (process.env['LOCALAPPDATA']||'')  + '\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    // Microsoft Edge (já vem no Windows 10/11)
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    (process.env['PROGRAMFILES(X86)']||'') + '\\Microsoft\\Edge\\Application\\msedge.exe',
    (process.env['PROGRAMFILES']||'')      + '\\Microsoft\\Edge\\Application\\msedge.exe',
  ];
  for (const p of candidatos) {
    try { if (p && fs.existsSync(p)) return p; } catch(e) {}
  }
  // Tenta localizar via registro do Windows
  try {
    const { execSync } = require('child_process');
    const resultado = execSync('reg query "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\chrome.exe" /ve', {encoding:'utf8'});
    const match = resultado.match(/REG_SZ\s+(.+\.exe)/i);
    if (match && fs.existsSync(match[1].trim())) return match[1].trim();
  } catch(e) {}
  return null;
}

// ── Imprime um HTML na impressora padrão via Chrome ───────────
function imprimirHTML(html, nomeArquivo) {
  const chrome = getChromePath();
  if (!chrome) {
    console.error('❌ Chrome não encontrado! Instale o Google Chrome.');
    return;
  }

  const tmpFile = path.join(os.tmpdir(), `tcho-${nomeArquivo}-${Date.now()}.html`);
  fs.writeFileSync(tmpFile, html, 'utf8');

  const cmd = `"${chrome}" --kiosk-printing --no-first-run --no-default-browser-check --disable-extensions "${tmpFile}"`;
  exec(cmd, (err) => {
    if (err) console.error('Erro ao imprimir:', err.message);
    // Apaga o arquivo temporário após 15 segundos
    setTimeout(() => fs.unlink(tmpFile, () => {}), 15000);
  });
}

// ── Papel da térmica no rolo contínuo (ajustar-papel.ps1) ─────
// Com o driver POS-80 no papel de fábrica (80x210), cupom de entrega comum
// passa de 210 mm, o Chrome divide em 2 páginas e a guilhotina corta no meio.
// O script põe o papel padrão no rolo do próprio driver (80x3276). Roda ao
// iniciar e a cada 30 min (se alguém mexer nas preferências, volta sozinho).
function ajustarPapel() {
  const { execFile } = require('child_process');
  const script = path.join(__dirname, 'ajustar-papel.ps1');
  if (!fs.existsSync(script)) return;
  execFile('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script],
    { windowsHide: true, timeout: 60000, encoding: 'utf8' }, (err, saida) => {
      if (err && !saida) { console.error('⚠️  Não ajustou o papel da impressora:', err.message); return; }
      String(saida || '').split(/\r?\n/).filter(Boolean).forEach((linha) => {
        try {
          const r = JSON.parse(linha);
          if (r.mudou) console.log(`📄 Papel da "${r.impressora}" ajustado: ${r.antes} → ${r.papel} mm (rolo contínuo, não corta mais o cupom)`);
          else if (!r.ok) console.error(`⚠️  Papel da "${r.impressora || 'impressora'}" não ajustado: ${r.erro}`);
          else if (r.impressora) console.log(`📄 Papel da "${r.impressora}": ${r.antes} mm — ok`);
          else console.log(`📄 ${r.motivo}`);
        } catch (e) { /* linha que não é JSON */ }
      });
    });
}
ajustarPapel();
setInterval(ajustarPapel, 30 * 60 * 1000);

// ── Servidor HTTP ─────────────────────────────────────────────
const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.method === 'POST' && req.url === '/imprimir') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { cozinha, entrega } = JSON.parse(body);
        console.log(`🖨️  Imprimindo pedido — ${new Date().toLocaleTimeString('pt-BR')}`);

        // Imprime cupom da cozinha imediatamente
        if (cozinha) imprimirHTML(cozinha, 'cozinha');

        // Imprime cupom de entrega 2 segundos depois
        if (entrega) setTimeout(() => imprimirHTML(entrega, 'entrega'), 2000);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        console.error('Erro ao processar pedido:', e.message);
        res.writeHead(500);
        res.end(JSON.stringify({ error: e.message }));
      }
    });
  } else if (req.method === 'GET' && req.url === '/ping') {
    res.writeHead(200);
    res.end('pong');
  } else {
    res.writeHead(404);
    res.end();
  }
});

server.listen(3333, '127.0.0.1', () => {
  console.log('');
  console.log('🍔 ================================');
  console.log('   TCHO BURGUER — Impressão Auto  ');
  console.log('================================ 🍔');
  console.log('');
  console.log('✅ Servidor rodando em localhost:3333');
  console.log(`🖨️  Chrome: ${getChromePath() || '❌ NÃO ENCONTRADO'}`);
  console.log('');
  console.log('Aguardando pedidos... (não feche esta janela)');
  console.log('');
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error('❌ Porta 3333 já está em uso. Feche a outra instância e tente novamente.');
  } else {
    console.error('Erro no servidor:', e.message);
  }
  process.exit(1);
});
