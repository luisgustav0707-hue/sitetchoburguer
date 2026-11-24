# Gera o pacote de download do atendente (Tcho-Atendente-WhatsApp.zip) e o
# manifesto que o painel lê (../download/bot-whatsapp.json).
#
# Uso (PowerShell, nesta pasta):   .\empacotar.ps1
# Depois publique o .zip:          gh release create bot-whatsapp-v<versão> dist\Tcho-Atendente-WhatsApp.zip
#
# Só entra o que está na lista abaixo: NUNCA serviceAccount.json, .env,
# pareamento.json, node_modules ou sessão do WhatsApp. O script confere isso
# no fim e falha se achar algum deles no .zip.

$ErrorActionPreference = 'Stop'
$aqui = $PSScriptRoot
$raiz = Split-Path $aqui -Parent
$pkg = Get-Content (Join-Path $aqui 'package.json') -Raw | ConvertFrom-Json
$versao = $pkg.version

$dist = Join-Path $aqui 'dist'
$stage = Join-Path $dist 'Tcho-Atendente-WhatsApp'
$zip = Join-Path $dist 'Tcho-Atendente-WhatsApp.zip'
if (Test-Path $dist) { Remove-Item $dist -Recurse -Force }
New-Item -ItemType Directory -Force (Join-Path $stage 'bot-whatsapp') | Out-Null
New-Item -ItemType Directory -Force (Join-Path $stage 'functions') | Out-Null
New-Item -ItemType Directory -Force (Join-Path $stage 'shared') | Out-Null

$arquivosBot = @(
  'index.js', 'conexao.js', 'firebase-config.js', 'atendente.js', 'cardapio.js', 'conversas.js',
  'ia.js', 'pedido.js', 'avisos.js', 'teste-local.js', 'package.json', 'package-lock.json',
  'INICIAR.bat', 'README.md', '.env.example'
)
foreach ($a in $arquivosBot) { Copy-Item (Join-Path $aqui $a) (Join-Path $stage "bot-whatsapp\$a") }
Copy-Item (Join-Path $raiz 'functions\conferencia.js') (Join-Path $stage 'functions\conferencia.js')
Copy-Item (Join-Path $raiz 'shared\dados.js') (Join-Path $stage 'shared\dados.js')
Copy-Item (Join-Path $aqui 'pacote\ABRIR-ATENDENTE.bat') $stage
Copy-Item (Join-Path $aqui 'pacote\LEIA-ME.txt') $stage

Compress-Archive -Path $stage -DestinationPath $zip -Force

# Conferência: nada de credencial dentro do pacote.
Add-Type -AssemblyName System.IO.Compression.FileSystem
$z = [System.IO.Compression.ZipFile]::OpenRead($zip)
$nomes = $z.Entries | ForEach-Object { $_.FullName }
$z.Dispose()
$proibidos = $nomes | Where-Object { $_ -match '(serviceAccount|pareamento)\.json$|(^|[\\/])\.env$|node_modules|\.wwebjs' }
if ($proibidos) { Remove-Item $zip -Force; throw "Arquivo proibido no pacote: $($proibidos -join ', ')" }

$tam = (Get-Item $zip).Length
$manifesto = [ordered]@{
  nome         = 'Tcho Burguer Atendente WhatsApp'
  versao       = $versao
  url          = "https://github.com/luisgustav0707-hue/sitetchoburguer/releases/download/bot-whatsapp-v$versao/Tcho-Atendente-WhatsApp.zip"
  tamanhoBytes = $tam
  publicadoEm  = (Get-Date -Format 'yyyy-MM-dd')
}
$json = $manifesto | ConvertTo-Json
[System.IO.File]::WriteAllText((Join-Path $raiz 'download\bot-whatsapp.json'), $json + "`n", (New-Object System.Text.UTF8Encoding $false))

Write-Host "Pacote: $zip ($([math]::Round($tam/1024)) KB, $($nomes.Count) arquivos)"
Write-Host "Manifesto: download\bot-whatsapp.json (versao $versao)"
Write-Host "Publicar: gh release create bot-whatsapp-v$versao `"$zip`" --title `"Atendente WhatsApp $versao`""
