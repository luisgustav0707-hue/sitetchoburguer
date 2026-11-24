// Gera download/AJUSTAR-PAPEL-IMPRESSORA.bat a partir de ajustar-papel.ps1.
// Uso:  node servidor-impressao/gerar-ajustar-papel-bat.cjs
//
// Por que um .bat: o PC da loja que só imprime pela janela do painel não tem
// o servidor-impressao nem o app instalados. Este arquivo de ~8 KB, baixado
// no painel (Configurações → Impressão), faz o mesmo ajuste com dois cliques.
//
// O .ps1 vai inteiro depois da marca, e o próprio .bat se lê, grava o script
// no %TEMP% e roda. Não dá pra usar -EncodedCommand: o cmd.exe corta a linha
// em 8191 caracteres e o script em base64 passa disso.
// Mudou o ajustar-papel.ps1? Rode este gerador de novo e commite o .bat.
const fs = require('fs');
const path = require('path');

const ps1 = fs.readFileSync(path.join(__dirname, 'ajustar-papel.ps1'), 'utf8').replace(/^﻿/, '');
const MARCA = ':::AJUSTAR-PAPEL-PS1:::';
if (ps1.includes(MARCA)) throw new Error('o .ps1 não pode conter a marca');

// Mostra o resultado de cada impressora em português simples.
const mostrar = [
  "$r=$_|ConvertFrom-Json;",
  "if($r.mudou){Write-Host ('  OK: '+$r.impressora+' agora no papel de rolo ('+$r.papel+' mm). O cupom nao corta mais.') -ForegroundColor Green}",
  "elseif(-not $r.ok){Write-Host ('  ERRO: '+$r.impressora+' - '+$r.erro) -ForegroundColor Red}",
  "elseif($r.impressora){Write-Host ('  OK: '+$r.impressora+' ja estava certa ('+$r.antes+' mm).') -ForegroundColor Green}",
  "else{Write-Host ('  '+$r.motivo) -ForegroundColor Yellow}",
].join('');

const cabecalho = [
  '@echo off',
  'title Tcho Burguer - Ajustar papel da impressora termica',
  'echo.',
  'echo  TCHO BURGUER - Ajustar papel da impressora termica',
  'echo  Deixa a impressora no papel de rolo continuo para o cupom nao sair cortado.',
  'echo.',
  // LastIndexOf: a marca também aparece nesta linha; a última é a de verdade.
  `powershell -NoProfile -ExecutionPolicy Bypass -Command "$c=[IO.File]::ReadAllText('%~f0',[Text.Encoding]::UTF8);$i=$c.LastIndexOf('${MARCA}');$p=Join-Path $env:TEMP 'tcho-ajustar-papel.ps1';[IO.File]::WriteAllText($p,$c.Substring($i+${MARCA.length}),(New-Object Text.UTF8Encoding $true));& $p | ForEach-Object {${mostrar}}"`,
  'echo.',
  'echo  Pronto. Pode fechar esta janela.',
  'pause >nul',
  'exit /b',
  MARCA,
].join('\r\n');

const saida = path.join(__dirname, '..', 'download', 'AJUSTAR-PAPEL-IMPRESSORA.bat');
fs.writeFileSync(saida, cabecalho + '\r\n' + ps1.replace(/\r?\n/g, '\r\n'), 'utf8');
console.log('gerado:', saida, fs.statSync(saida).size, 'bytes');
