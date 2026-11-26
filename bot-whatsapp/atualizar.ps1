# Atualizacao automatica do atendente de WhatsApp.
# O INICIAR.bat roda este script a cada inicio. Ele le o manifesto publicado
# no site (download/bot-whatsapp.json) e, se houver versao nova, baixa o .zip
# da Release e copia por cima desta instalacao.
#
# Nao toca em pareamento.json, .env nem node_modules (nao vem no .zip).
# O INICIAR.bat novo e gravado como INICIAR.novo: o cmd le o .bat enquanto
# executa, entao quem troca o arquivo e o proprio INICIAR.bat, ja parado.
# Qualquer falha (sem internet, site fora) = segue com a versao atual.

$ErrorActionPreference = 'Stop'
try {
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  $aqui = $PSScriptRoot
  $raiz = Split-Path $aqui -Parent
  $local = (Get-Content (Join-Path $aqui 'package.json') -Raw | ConvertFrom-Json).version
  $m = Invoke-RestMethod -Uri ("https://tchoburguer.com/download/bot-whatsapp.json?v=" + [DateTime]::UtcNow.Ticks) -TimeoutSec 15 -UseBasicParsing
  if (-not $m.versao -or -not $m.url) { exit 0 }
  if ([version]$m.versao -le [version]$local) { Write-Host "  Versao $local (atual)."; exit 0 }

  Write-Host "  Baixando versao $($m.versao) (instalada: $local)..."
  $tmp = Join-Path $env:TEMP ("tcho-bot-" + [guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Force $tmp | Out-Null
  $zip = Join-Path $tmp 'pacote.zip'
  Invoke-WebRequest -Uri $m.url -OutFile $zip -TimeoutSec 300 -UseBasicParsing
  Expand-Archive -Path $zip -DestinationPath $tmp -Force
  $origem = Join-Path $tmp 'Tcho-Atendente-WhatsApp'
  if (-not (Test-Path (Join-Path $origem 'bot-whatsapp\index.js'))) { throw 'pacote sem bot-whatsapp\index.js' }

  Get-ChildItem $origem -Recurse -File | ForEach-Object {
    $rel = $_.FullName.Substring($origem.Length + 1)
    if ($rel -eq 'ABRIR-ATENDENTE.bat') { return }
    if ($rel -eq 'bot-whatsapp\INICIAR.bat') { $rel = 'bot-whatsapp\INICIAR.novo' }
    $dest = Join-Path $raiz $rel
    New-Item -ItemType Directory -Force (Split-Path $dest -Parent) | Out-Null
    Copy-Item $_.FullName $dest -Force
  }
  Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
  Write-Host "  Atualizado para a versao $($m.versao)."
  exit 0
} catch {
  Write-Host "  Nao deu para buscar atualizacao ($($_.Exception.Message)). Seguindo com a versao atual."
  exit 0
}
