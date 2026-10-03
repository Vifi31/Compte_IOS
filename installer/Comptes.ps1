# Lanceur de Comptes : démarre le serveur local (node.exe embarqué) puis ouvre le navigateur.
#   Comptes.ps1            démarre si nécessaire et ouvre l'application
#   Comptes.ps1 -Stop      arrête le serveur
#   Comptes.ps1 -NoBrowser démarre sans ouvrir le navigateur
param([switch]$Stop, [switch]$NoBrowser)
$ErrorActionPreference = 'SilentlyContinue'
$base = $PSScriptRoot
$port = if ($env:COMPTES_PORT) { [int]$env:COMPTES_PORT } else { 3210 }
$url  = "http://127.0.0.1:$port"
$home_ = if ($env:COMPTES_HOME) { $env:COMPTES_HOME } else { Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'Comptes' }

function Test-Server {
  try { $r = [Net.WebRequest]::Create("$url/api/ping"); $r.Timeout = 1500; $r.GetResponse().Close(); $true } catch { $false }
}

if ($Stop) {
  try { $r = [Net.WebRequest]::Create("$url/api/shutdown"); $r.Method = 'POST'; $r.ContentLength = 0; $r.Timeout = 3000; $r.GetResponse().Close() } catch { }
  return
}

if (-not (Test-Server)) {
  New-Item -ItemType Directory -Force $home_ | Out-Null
  $node = Join-Path $base 'runtime\node.exe'
  if (-not (Test-Path $node)) { Add-Type -AssemblyName System.Windows.Forms; [void][Windows.Forms.MessageBox]::Show("node.exe introuvable : $node", 'Comptes', 'OK', 'Error'); exit 1 }
  $env:COMPTES_HOME = $home_
  Start-Process -FilePath $node -ArgumentList 'server.mjs' -WorkingDirectory $base -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $home_ 'serveur.log') -RedirectStandardError (Join-Path $home_ 'serveur-erreurs.log')

  Add-Type -AssemblyName System.Windows.Forms, System.Drawing
  $form = New-Object Windows.Forms.Form
  $form.Text = 'Comptes'; $form.FormBorderStyle = 'FixedDialog'; $form.StartPosition = 'CenterScreen'; $form.ControlBox = $false
  $form.ClientSize = New-Object Drawing.Size 360, 96; $form.TopMost = $true
  $label = New-Object Windows.Forms.Label; $label.Text = "Démarrage de Comptes…`nChargement des relevés, un instant."; $label.SetBounds(16, 12, 330, 40)
  $bar = New-Object Windows.Forms.ProgressBar; $bar.Style = 'Marquee'; $bar.SetBounds(16, 60, 328, 18)
  $form.Controls.AddRange(@($label, $bar)); $form.Show()
  $t0 = Get-Date; $ok = $false
  while (((Get-Date) - $t0).TotalSeconds -lt 120) {
    [Windows.Forms.Application]::DoEvents()
    if (Test-Server) { $ok = $true; break }
    Start-Sleep -Milliseconds 400
  }
  $form.Close()
  if (-not $ok) {
    [void][Windows.Forms.MessageBox]::Show("Comptes ne répond pas.`nConsultez le journal :`n$(Join-Path $home_ 'serveur-erreurs.log')`n`nLe port $port est peut-être utilisé par un autre programme (variable COMPTES_PORT).", 'Comptes', 'OK', 'Warning')
    exit 2
  }
}
if (-not $NoBrowser) { Start-Process $url }
