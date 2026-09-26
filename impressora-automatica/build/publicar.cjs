// Copia o instalador gerado pelo electron-builder para a pasta pública
// `download/` e atualiza o manifesto que o painel lê em
// Configurações → App de impressão.
//
// O nome publicado é FIXO (Tcho-Impressao.exe) de propósito: o link do painel
// não pode quebrar a cada versão nova. Quem diz qual é a versão é o
// app-impressao.json, não o nome do arquivo.
const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
const dist = path.join(raiz, 'dist');
const destinoDir = path.join(raiz, '..', 'download');
const NOME_PUBLICADO = 'Tcho-Impressao.exe';

if (!fs.existsSync(dist)) {
  console.error('✗ Pasta dist/ não existe. Rode `npm run dist` antes.');
  process.exit(1);
}

// Pega o .exe mais recente: o electron-builder deixa o nome com a versão
// (Tcho-Impressao-Setup-1.0.0.exe), então varrer por data é mais confiável do
// que montar o nome esperado e errar por um dígito.
const exes = fs.readdirSync(dist)
  .filter((f) => f.toLowerCase().endsWith('.exe'))
  .map((f) => ({ f, mtime: fs.statSync(path.join(dist, f)).mtimeMs }))
  .sort((a, b) => b.mtime - a.mtime);

if (!exes.length) {
  console.error('✗ Nenhum .exe em dist/. Rode `npm run dist` antes.');
  process.exit(1);
}

const origem = path.join(dist, exes[0].f);
fs.mkdirSync(destinoDir, { recursive: true });
const destino = path.join(destinoDir, NOME_PUBLICADO);
fs.copyFileSync(origem, destino);

const pkg = JSON.parse(fs.readFileSync(path.join(raiz, 'package.json'), 'utf8'));
const manifestoPath = path.join(destinoDir, 'app-impressao.json');

fs.writeFileSync(manifestoPath, JSON.stringify({
  nome: pkg.productName || 'Tcho Burguer Impressão',
  versao: pkg.version,
  arquivo: NOME_PUBLICADO,
  tamanhoBytes: fs.statSync(destino).size,
  publicadoEm: new Date().toISOString().slice(0, 10),
}, null, 2) + '\n');

const mb = (fs.statSync(destino).size / 1024 / 1024).toFixed(1);
console.log(`✓ ${exes[0].f} → download/${NOME_PUBLICADO} (${mb} MB, v${pkg.version})`);
console.log('  Agora suba a pasta download/ junto com o site (o .exe NÃO vai pro git).');
