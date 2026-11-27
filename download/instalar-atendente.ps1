# Instala/atualiza o atendente de WhatsApp do Tcho no PC da loja, num comando:
#
#   powershell -NoProfile -ExecutionPolicy Bypass -Command "iex ((New-Object Net.WebClient).DownloadString('https://tchoburguer.com/download/instalar-atendente.ps1'))"
#
# - Fecha o atendente que estiver aberto.
# - Acha a instalacao antiga (pela pasta bot-whatsapp com pareamento.json) e
#   instala por cima dela, mantendo o pareamento. Sem instalacao antiga,
#   instala na Area de Trabalho e o atendente pede o codigo do painel.
# - Abre o atendente.

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

Write-Host ''
Write-Host '  Instalando o atendente de WhatsApp do Tcho...'

# 1. Fecha o atendente aberto (janela do INICIAR.bat + node + navegador dele).
cmd /c 'taskkill /F /T /FI "WINDOWTITLE eq TCHO BURGUER*" >NUL 2>NUL'
Start-Sleep -Seconds 2

# 2. Instalacao antiga.
$desktop = [Environment]::GetFolderPath('Desktop')
$lugares = @($desktop, (Join-Path $env:USERPROFILE 'Desktop'), (Join-Path $env:USERPROFILE 'Downloads'),
  [Environment]::GetFolderPath('MyDocuments'), $env:USERPROFILE) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -Unique
$achado = $null
foreach ($l in $lugares) {
  $achado = Get-ChildItem $l -Recurse -Depth 4 -Filter 'index.js' -ErrorAction SilentlyContinue |
    Where-Object { $_.Directory.Name -eq 'bot-whatsapp' -and (Test-Path (Join-Path $_.DirectoryName 'conexao.js')) } |
    Sort-Object { if (Test-Path (Join-Path $_.DirectoryName 'pareamento.json')) { 0 } else { 1 } }, LastWriteTime -Descending |
    Select-Object -First 1
  if ($achado) { break }
}
if ($achado) {
  $raiz = Split-Path $achado.DirectoryName -Parent
  Write-Host "  Instalacao encontrada: $raiz"
} else {
  $raiz = Join-Path $desktop 'Tcho-Atendente-WhatsApp'
  Write-Host "  Nenhuma instalacao antiga. Instalando em: $raiz"
}

# 3. Baixa a versao publicada e copia por cima (pareamento, .env e node_modules ficam).
$m = Invoke-RestMethod -Uri ('https://tchoburguer.com/download/bot-whatsapp.json?v=' + [DateTime]::UtcNow.Ticks) -UseBasicParsing
Write-Host "  Baixando a versao $($m.versao)..."
$tmp = Join-Path $env:TEMP ('tcho-bot-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force $tmp | Out-Null
$zip = Join-Path $tmp 'pacote.zip'
Invoke-WebRequest -Uri $m.url -OutFile $zip -UseBasicParsing
Expand-Archive -Path $zip -DestinationPath $tmp -Force
$origem = Join-Path $tmp 'Tcho-Atendente-WhatsApp'
New-Item -ItemType Directory -Force $raiz | Out-Null
Copy-Item (Join-Path $origem '*') $raiz -Recurse -Force
Remove-Item (Join-Path $raiz 'bot-whatsapp\INICIAR.novo') -Force -ErrorAction SilentlyContinue
Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue

# 4. Atalhos (Area de Trabalho com icone + abrir sozinho quando o PC liga)
#    e abre o atendente. O INICIAR.bat refaz os atalhos a cada inicio.
$atalhos = Join-Path $raiz 'bot-whatsapp\atalhos.ps1'
if (Test-Path $atalhos) {
  & powershell -NoProfile -ExecutionPolicy Bypass -File $atalhos
} else {
  try {
    $s = (New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path $desktop 'Atendente WhatsApp Tcho.lnk'))
    $s.TargetPath = Join-Path $raiz 'ABRIR-ATENDENTE.bat'
    $s.WorkingDirectory = $raiz
    $s.Save()
  } catch {}
}
Start-Process -FilePath (Join-Path $raiz 'ABRIR-ATENDENTE.bat') -WorkingDirectory $raiz
Write-Host ''
Write-Host '  Pronto! A janela do atendente abriu. O QR Code aparece nela e no painel.'
Write-Host ''
