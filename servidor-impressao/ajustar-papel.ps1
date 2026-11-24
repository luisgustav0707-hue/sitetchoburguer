# ═══════════════════════════════════════════════════════════════
# Ajusta o papel das impressoras térmicas para o ROLO CONTÍNUO
# ───────────────────────────────────────────────────────────────
# ⚠️ CÓPIA IDÊNTICA em impressora-automatica/ajustar-papel.ps1 — mexeu num,
#    replique no outro.
#
# Por que existe: o cupom é impresso pelo Chrome/Edge (kiosk ou janela do
# painel), e o Chrome usa o papel PADRÃO do driver. O CSS do cupom não
# consegue escolher o papel (`@page{size:80mm auto}` nem é CSS válido). Com o
# driver POS-80 em 80x210 (padrão de fábrica), um cupom de entrega comum
# (~220 mm; ~320 mm com muitos itens) vira 2 páginas, e a guilhotina corta
# entre elas — o "cupom cortado".
#
# O que faz: em cada impressora do Windows, procura entre os papéis QUE O
# PRÓPRIO DRIVER OFERECE um rolo de 50–90 mm de largura e mais de 1 m de
# altura (no POS-80: "Printer Paper(80 x 3276mm)") e o coloca como padrão do
# usuário — o mesmo que Preferências de impressão → Papel. O driver térmico
# imprime só até o fim do conteúdo e corta ali.
#
#  • Usa a opção do driver, nunca tamanho personalizado: tamanho livre é o que
#    deixou o cupom em branco na Goldsky (ver functions/cupons-srv.js).
#  • Impressora sem esse rolo (A4, PDF, jato de tinta...) não é tocada.
#  • Já está no rolo: não mexe.
#  • Por usuário (UserPrintTicket): não precisa de administrador.
#
# Uso:  powershell -ExecutionPolicy Bypass -File ajustar-papel.ps1 [-Simular]
# Saída: uma linha JSON por impressora térmica (quem chama registra no log).
# ═══════════════════════════════════════════════════════════════
param([switch]$Simular)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$PSF = 'http://schemas.microsoft.com/windows/2003/08/printing/printschemaframework'
function Mm($px) { [math]::Round($px * 25.4 / 96) }   # Print Schema do .NET: 1/96 pol.

function Ajustar($fila) {
  $fila.Refresh()
  # Capacidades do driver em XML (Print Schema): é onde estão os nomes exatos
  # das opções de papel, inclusive as próprias do driver (ns0000:...).
  $caps = New-Object System.Xml.XmlDocument
  $caps.Load($fila.GetPrintCapabilitiesAsXml())
  $nsm = New-Object System.Xml.XmlNamespaceManager($caps.NameTable)
  $nsm.AddNamespace('psf', $PSF)
  $feature = $caps.SelectSingleNode("//psf:Feature[@name='psk:PageMediaSize']", $nsm)
  if (-not $feature) { return $null }

  # Rolo: 50–90 mm de largura e mais de 1 m de altura; havendo vários, o maior.
  $rolo = $null; $roloAlt = 0; $roloLarg = 0
  foreach ($opt in $feature.SelectNodes('psf:Option', $nsm)) {
    $vl = $opt.SelectSingleNode("psf:ScoredProperty[@name='psk:MediaSizeWidth']/psf:Value", $nsm)
    $va = $opt.SelectSingleNode("psf:ScoredProperty[@name='psk:MediaSizeHeight']/psf:Value", $nsm)
    if (-not $vl -or -not $va) { continue }
    $l = [double]$vl.InnerText / 1000; $a = [double]$va.InnerText / 1000   # mícrons → mm
    if ($l -ge 50 -and $l -le 90 -and $a -ge 1000 -and $a -gt $roloAlt) { $rolo = $opt; $roloAlt = $a; $roloLarg = $l }
  }
  if (-not $rolo) { return $null }                     # não é térmica: não mexe

  $ticket = $fila.UserPrintTicket
  if (-not $ticket) { $ticket = $fila.DefaultPrintTicket }
  $atual = $ticket.PageMediaSize
  $atualAlt = if ($atual -and $atual.Height) { Mm $atual.Height } else { 0 }
  $atualTxt = if ($atualAlt) { "$(Mm $atual.Width)x$atualAlt" } else { '?' }
  $base = @{ impressora = $fila.FullName; padrao = ($fila.FullName -eq $script:padrao); antes = $atualTxt }

  if ($atualAlt -ge 1000) { return $base + @{ ok = $true; mudou = $false; motivo = 'já está no rolo' } }
  if ($Simular) { return $base + @{ ok = $true; mudou = $false; motivo = "simulação: iria para $([math]::Round($roloLarg))x$([math]::Round($roloAlt)) ($($rolo.GetAttribute('name')))" } }

  # Ticket parcial só com o papel, com os mesmos namespaces das capacidades
  # (o nome da opção usa o prefixo do driver, ex.: ns0000:ZIJIPAPER420).
  $delta = New-Object System.Xml.XmlDocument
  $raiz = $delta.CreateElement('psf', 'PrintTicket', $PSF)
  foreach ($at in $caps.DocumentElement.Attributes) { if ($at.Prefix -eq 'xmlns') { $raiz.SetAttribute($at.Name, $at.Value) } }
  $raiz.SetAttribute('version', '1')
  $delta.AppendChild($raiz) | Out-Null
  $f = $delta.CreateElement('psf', 'Feature', $PSF); $f.SetAttribute('name', 'psk:PageMediaSize'); $raiz.AppendChild($f) | Out-Null
  $o = $delta.CreateElement('psf', 'Option', $PSF); $o.SetAttribute('name', $rolo.GetAttribute('name')); $f.AppendChild($o) | Out-Null
  foreach ($sp in $rolo.SelectNodes('psf:ScoredProperty', $nsm)) { $o.AppendChild($delta.ImportNode($sp, $true)) | Out-Null }

  $buf = New-Object System.IO.MemoryStream
  $delta.Save($buf); $buf.Position = 0
  $r = $fila.MergeAndValidatePrintTicket($ticket, (New-Object System.Printing.PrintTicket($buf)))
  $fila.UserPrintTicket = $r.ValidatedPrintTicket
  $fila.Commit()

  # Confere lendo de volta.
  $fila.Refresh()
  $novo = $fila.UserPrintTicket.PageMediaSize
  $novoAlt = if ($novo -and $novo.Height) { Mm $novo.Height } else { 0 }
  return $base + @{ ok = ($novoAlt -ge 1000); mudou = ($novoAlt -ge 1000); papel = "$(Mm $novo.Width)x$novoAlt" }
}

try {
  Add-Type -AssemblyName System.Printing
  Add-Type -AssemblyName ReachFramework
  $servidor = New-Object System.Printing.LocalPrintServer
  $script:padrao = try { $servidor.DefaultPrintQueue.FullName } catch { '' }
  $tipos = [System.Printing.EnumeratedPrintQueueTypes[]]@('Local', 'Connections')
  $achou = $false
  foreach ($fila in $servidor.GetPrintQueues($tipos)) {
    try {
      $r = Ajustar $fila
      if ($r) { $achou = $true; $r | ConvertTo-Json -Compress }
    } catch {
      @{ ok = $false; impressora = $fila.FullName; erro = $_.Exception.Message } | ConvertTo-Json -Compress
    }
  }
  if (-not $achou) { @{ ok = $true; mudou = $false; motivo = 'nenhuma impressora térmica (com rolo) instalada' } | ConvertTo-Json -Compress }
} catch {
  @{ ok = $false; erro = $_.Exception.Message } | ConvertTo-Json -Compress
}
