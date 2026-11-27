# Atalhos do atendente de WhatsApp. O INICIAR.bat roda este script a cada
# inicio (e o instalador tambem), entao ele se corrige sozinho:
# - Area de Trabalho: "Atendente WhatsApp Tcho" com o icone do atendente.
# - Inicializar do Windows: abre o atendente sozinho quando o PC liga
#   (depois que alguem entra no Windows).
# Para o atendente NAO abrir sozinho quando o PC liga: crie um arquivo
# chamado SEM-INICIO-AUTOMATICO na pasta Tcho-Atendente-WhatsApp (a mesma
# do ABRIR-ATENDENTE.bat). O atalho do Inicializar e removido.
# Qualquer falha aqui e ignorada: nao atrapalha o atendente.

$ErrorActionPreference = 'Stop'
try {
  $aqui = $PSScriptRoot
  $raiz = Split-Path $aqui -Parent
  $alvo = Join-Path $raiz 'ABRIR-ATENDENTE.bat'
  $pasta = $raiz
  if (-not (Test-Path $alvo)) { $alvo = Join-Path $aqui 'INICIAR.bat'; $pasta = $aqui }
  $icone = Join-Path $aqui 'atendente.ico'
  $sh = New-Object -ComObject WScript.Shell
  $nome = 'Atendente WhatsApp Tcho.lnk'

  function Set-AtalhoTcho($arquivo) {
    $s = $sh.CreateShortcut($arquivo)
    $s.TargetPath = $alvo
    $s.WorkingDirectory = $pasta
    if (Test-Path $icone) { $s.IconLocation = "$icone,0" }
    $s.WindowStyle = 1
    $s.Description = 'Atendente de WhatsApp do Tcho Burguer'
    $s.Save()
  }

  Set-AtalhoTcho (Join-Path ([Environment]::GetFolderPath('Desktop')) $nome)

  $inicializar = Join-Path ([Environment]::GetFolderPath('Startup')) $nome
  if (Test-Path (Join-Path $raiz 'SEM-INICIO-AUTOMATICO')) {
    Remove-Item $inicializar -Force -ErrorAction SilentlyContinue
  } else {
    Set-AtalhoTcho $inicializar
  }
} catch {
  Write-Host "  (atalhos nao atualizados: $($_.Exception.Message))"
}
exit 0
