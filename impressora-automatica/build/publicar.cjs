// Publica o instalador gerado pelo electron-builder como um **GitHub Release**
// e atualiza o manifesto que o painel lê em Configurações → 🖨️ Impressão.
//
// Por que Release e não uma pasta no repositório: o site do Tcho é servido pelo
// GitHub Pages, que só entrega arquivo commitado — e o instalador tem ~87 MB.
// Cada versão no git ficaria pra sempre no histórico (o .git inteiro hoje tem
// 60 MB), e o limite duro do GitHub por arquivo é 100 MB: um upgrade do Electron
// e o push começaria a falhar. No Release não entra no histórico, não tem esse
// limite, e o link é servido pelo CDN do GitHub.
//
// O painel nunca aponta pro Release direto: ele lê a URL do
// download/app-impressao.json (que é minúsculo e esse sim fica no repo). Essa
// indireção é o que faz o botão de download continuar funcionando a cada versão
// nova, sem ninguém editar HTML.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const raiz = path.join(__dirname, '..');
const dist = path.join(raiz, 'dist');
const destinoDir = path.join(raiz, '..', 'download');
const NOME_PUBLICADO = 'Tcho-Impressao.exe';

if (!fs.existsSync(dist)) {
  console.error('✗ Pasta dist/ não existe. Rode `npm run dist` antes.');
  process.exit(1);
}

// Pega o .exe mais recente: o electron-builder põe a versão no nome, então
// varrer por data é mais confiável do que montar o nome esperado e errar por um
// dígito.
const exes = fs.readdirSync(dist)
  .filter((f) => f.toLowerCase().endsWith('.exe'))
  // Ignora a cópia da publicação anterior: ela também é .exe e, se um build
  // falhar, seria a "mais recente" — republicaríamos a versão velha sem avisar.
  .filter((f) => f !== NOME_PUBLICADO)
  .map((f) => ({ f, mtime: fs.statSync(path.join(dist, f)).mtimeMs }))
  .sort((a, b) => b.mtime - a.mtime);

if (!exes.length) {
  console.error('✗ Nenhum .exe em dist/. Rode `npm run dist` antes.');
  process.exit(1);
}

const pkg = JSON.parse(fs.readFileSync(path.join(raiz, 'package.json'), 'utf8'));
const origem = path.join(dist, exes[0].f);
const tamanho = fs.statSync(origem).size;
const mb = (tamanho / 1024 / 1024).toFixed(1);

// O asset sobe com nome fixo, independente do nome do arquivo em dist/ — é o
// que o usuário vê salvando na pasta de Downloads dele.
const envio = path.join(dist, NOME_PUBLICADO);
fs.copyFileSync(origem, envio);

const gh = (...args) => execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim();
const repo = gh('repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner');
const tag = `app-impressao-v${pkg.version}`;

// Já existe um Release dessa versão? Então é republicação: troca o asset.
let existe = true;
try { gh('release', 'view', tag, '--repo', repo, '--json', 'tagName'); }
catch (e) { existe = false; }

if (existe) {
  console.log(`· Release ${tag} já existe — substituindo o instalador.`);
  gh('release', 'upload', tag, envio, '--repo', repo, '--clobber');
} else {
  gh('release', 'create', tag, envio,
    '--repo', repo,
    '--title', `App de impressão ${pkg.version}`,
    '--notes', `Instalador do app de impressão automática do Tcho Burguer (Windows, ${mb} MB).\n\n`
      + 'O instalador não é assinado: o Windows mostra "editor desconhecido". '
      + 'Em **Mais informações → Executar assim mesmo**.');
}

const url = `https://github.com/${repo}/releases/download/${tag}/${NOME_PUBLICADO}`;

fs.mkdirSync(destinoDir, { recursive: true });
fs.writeFileSync(path.join(destinoDir, 'app-impressao.json'), JSON.stringify({
  nome: pkg.productName || 'Tcho Burguer Impressão',
  versao: pkg.version,
  url,
  tamanhoBytes: tamanho,
  publicadoEm: new Date().toISOString().slice(0, 10),
}, null, 2) + '\n');

console.log(`✓ ${exes[0].f} → Release ${tag} (${mb} MB)`);
console.log(`  ${url}`);
console.log('  Falta commitar download/app-impressao.json e dar push pro main (GitHub Pages).');
