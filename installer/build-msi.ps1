# Construit dist\Comptes-<version>.msi (installation par utilisateur, sans droits administrateur).
# Aucun outil externe : API Windows Installer (COM) et makecab, fournis avec Windows.
#   powershell -ExecutionPolicy Bypass -File installer\build-msi.ps1
param([string]$NodeExe = (Get-Command node).Source)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$root  = Split-Path -Parent $PSScriptRoot
$build = Join-Path $root 'build'
$stage = Join-Path $build 'stage'
$dist  = Join-Path $root 'dist'
$pkg   = Get-Content (Join-Path $root 'package.json') -Raw | ConvertFrom-Json
$version = $pkg.version
$UPGRADE_CODE = '{6B1E2F4A-3C7D-4E58-9A10-7D2C5B8E4F31}'   # fixe : identifie la famille de produits (mises à jour)
Write-Host "== Comptes $version"

# ------------------------------------------------------------------ 1. Arborescence à installer
if (Test-Path $build) { Remove-Item $build -Recurse -Force }
New-Item -ItemType Directory -Force $stage, $dist | Out-Null
foreach ($f in 'server.mjs', 'package.json', 'README.md', 'CHANGELOG.md') { if (Test-Path "$root\$f") { Copy-Item "$root\$f" $stage } }
Copy-Item "$root\lib"    "$stage\lib"    -Recurse
Copy-Item "$root\public" "$stage\public" -Recurse
New-Item -ItemType Directory "$stage\scripts" | Out-Null
Copy-Item "$root\scripts\parse.mjs" "$stage\scripts"

# modules Node (production) : sans @napi-rs (outil de développement), pdfjs-dist et chart.js réduits au nécessaire
$nm = "$root\node_modules"
New-Item -ItemType Directory "$stage\node_modules" | Out-Null
foreach ($d in Get-ChildItem $nm -Directory) {
  if ($d.Name -in '@napi-rs', 'pdfjs-dist', 'chart.js', '.bin') { continue }
  Copy-Item $d.FullName "$stage\node_modules\$($d.Name)" -Recurse
}
New-Item -ItemType Directory "$stage\node_modules\pdfjs-dist\legacy\build" -Force | Out-Null
Copy-Item "$nm\pdfjs-dist\package.json" "$stage\node_modules\pdfjs-dist"
Copy-Item "$nm\pdfjs-dist\legacy\build\pdf.mjs", "$nm\pdfjs-dist\legacy\build\pdf.worker.mjs" "$stage\node_modules\pdfjs-dist\legacy\build"
New-Item -ItemType Directory "$stage\node_modules\chart.js\dist" -Force | Out-Null
Copy-Item "$nm\chart.js\dist\chart.umd.js" "$stage\node_modules\chart.js\dist"
Copy-Item "$nm\chart.js\package.json" "$stage\node_modules\chart.js"
Get-ChildItem $stage -Recurse -File | Where-Object { $_.Extension -in '.map', '.md', '.ts', '.markdown' -and $_.FullName -notmatch '\\(README|CHANGELOG)\.md$' } | Remove-Item -Force

New-Item -ItemType Directory "$stage\runtime" | Out-Null
Copy-Item $NodeExe "$stage\runtime\node.exe"

# ------------------------------------------------------------------ 2. Icône
$ico = Join-Path $build 'Comptes.ico'
function New-IconPng([int]$size) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'; $g.TextRenderingHint = 'AntiAliasGridFit'
  $r = New-Object System.Drawing.Rectangle 0, 0, $size, $size
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $rad = [int]($size * 0.22)
  $path.AddArc(0, 0, $rad * 2, $rad * 2, 180, 90); $path.AddArc($size - $rad * 2 - 1, 0, $rad * 2, $rad * 2, 270, 90)
  $path.AddArc($size - $rad * 2 - 1, $size - $rad * 2 - 1, $rad * 2, $rad * 2, 0, 90); $path.AddArc(0, $size - $rad * 2 - 1, $rad * 2, $rad * 2, 90, 90); $path.CloseFigure()
  $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush $r, ([System.Drawing.Color]::FromArgb(99, 102, 241)), ([System.Drawing.Color]::FromArgb(236, 72, 153)), 45
  $g.FillPath($brush, $path)
  $font = New-Object System.Drawing.Font 'Segoe UI', ([single]($size * 0.56)), ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
  $sf = New-Object System.Drawing.StringFormat; $sf.Alignment = 'Center'; $sf.LineAlignment = 'Center'
  $g.DrawString([string][char]0x20AC, $font, [System.Drawing.Brushes]::White, (New-Object System.Drawing.RectangleF 0, ($size * 0.02), $size, $size), $sf)
  $ms = New-Object System.IO.MemoryStream; $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png); $g.Dispose(); $bmp.Dispose()
  , $ms.ToArray()
}
$sizes = 16, 32, 48, 256
$pngs = foreach ($s in $sizes) { , (New-IconPng $s) }
$out = New-Object System.IO.MemoryStream; $bw = New-Object System.IO.BinaryWriter $out
$bw.Write([uint16]0); $bw.Write([uint16]1); $bw.Write([uint16]$sizes.Count)
$off = 6 + 16 * $sizes.Count
for ($i = 0; $i -lt $sizes.Count; $i++) {
  $s = $sizes[$i]; $wb = if ($s -ge 256) { 0 } else { $s }
  $bw.Write([byte]$wb); $bw.Write([byte]$wb); $bw.Write([byte]0); $bw.Write([byte]0); $bw.Write([uint16]1); $bw.Write([uint16]32)
  $bw.Write([uint32]$pngs[$i].Length); $bw.Write([uint32]$off); $off += $pngs[$i].Length
}
foreach ($p in $pngs) { $bw.Write($p) }
[IO.File]::WriteAllBytes($ico, $out.ToArray())

Copy-Item "$PSScriptRoot\Comptes.ps1" "$stage\Comptes.ps1"

& node "$root\scripts\manifest.mjs" $stage --installed | Out-Host

# ------------------------------------------------------------------ 3. Tables Windows Installer
$files = Get-ChildItem $stage -Recurse -File | Sort-Object FullName
Write-Host "   $($files.Count) fichiers, $([math]::Round(($files | Measure-Object Length -Sum).Sum / 1MB, 1)) Mo"

function Get-Short([string]$name, [hashtable]$used) {
  $valid = '^[A-Za-z0-9_\$!#%&''@\^`\{\}~\(\)\-]{1,8}(\.[A-Za-z0-9_\$!#%&''@\^`\{\}~\(\)\-]{1,3})?$'
  if ($name -match $valid -and -not $used.ContainsKey($name.ToUpper())) { $used[$name.ToUpper()] = 1; return $name }
  $ext = [IO.Path]::GetExtension($name).TrimStart('.'); $base = [IO.Path]::GetFileNameWithoutExtension($name)
  $clean = { param($t, $n) (($t.ToUpper() -replace '[^A-Z0-9_]', '') + 'XXXXXX').Substring(0, [math]::Min($n, [math]::Max(1, ($t.ToUpper() -replace '[^A-Z0-9_]', '').Length))) }
  $b = & $clean $base 6; $e = if ($ext) { (& $clean $ext 3) } else { '' }
  for ($n = 1; ; $n++) { $cand = "$b~$n" + $(if ($e) { ".$e" } else { '' }); if (-not $used.ContainsKey($cand.ToUpper())) { $used[$cand.ToUpper()] = 1; return $cand } }
}
function Get-DosName([string]$name, [hashtable]$used) {
  $s = Get-Short $name $used
  if ($s -ceq $name) { return $name } else { return "$s|$name" }
}
function New-Guid5([string]$text) {
  $md5 = [Security.Cryptography.MD5]::Create(); $h = $md5.ComputeHash([Text.Encoding]::UTF8.GetBytes($text))
  $h[6] = ($h[6] -band 0x0F) -bor 0x30; $h[8] = ($h[8] -band 0x3F) -bor 0x80
  '{' + ([guid]::new($h)).ToString().ToUpper() + '}'
}

# annuaire des dossiers
$dirRows = New-Object System.Collections.ArrayList     # Directory, Parent, DefaultDir
$dirId = @{ '' = 'INSTALLFOLDER' }
$dirUsed = @{ 'INSTALLFOLDER' = @{} }
$dirSeq = 0
function Ensure-Dir([string]$rel) {
  if ($dirId.ContainsKey($rel)) { return $dirId[$rel] }
  $parentRel = if ($rel.Contains('\')) { $rel.Substring(0, $rel.LastIndexOf('\')) } else { '' }
  $parent = Ensure-Dir $parentRel
  $leaf = Split-Path $rel -Leaf
  $script:dirSeq++; $id = "D$($script:dirSeq)"
  $dirId[$rel] = $id; $dirUsed[$id] = @{}
  [void]$dirRows.Add(@($id, $parent, (Get-DosName $leaf $dirUsed[$parent])))
  return $id
}
$fileRows = New-Object System.Collections.ArrayList     # File, Component, FileName, Size, Sequence
$compFiles = [ordered]@{}                               # dirId -> first file key
$compDirRel = @{}
$n = 0
foreach ($f in $files) {
  $n++
  $rel = $f.FullName.Substring($stage.Length + 1)
  $dRel = if ($rel.Contains('\')) { $rel.Substring(0, $rel.LastIndexOf('\')) } else { '' }
  $d = Ensure-Dir $dRel
  $key = "F$n"
  if (-not $compFiles.Contains($d)) { $compFiles[$d] = $key; $compDirRel[$d] = $dRel }
  [void]$fileRows.Add(@($key, "C_$d", (Get-DosName $f.Name $dirUsed[$d]), [int]$f.Length, $n, $f.FullName))
}

# cabinet unique
$cab = Join-Path $build 'Comptes.cab'; $ddf = Join-Path $build 'cab.ddf'
$lines = @('.OPTION EXPLICIT', '.Set CabinetNameTemplate=Comptes.cab', ".Set DiskDirectoryTemplate=$build", '.Set Cabinet=on', '.Set Compress=on', '.Set CompressionType=LZX', '.Set CompressionMemory=21', '.Set MaxDiskSize=0', '.Set FolderSizeThreshold=2000000000')
foreach ($r in $fileRows) { $lines += ('"{0}" "{1}"' -f $r[5], $r[0]) }
[IO.File]::WriteAllLines($ddf, $lines, [Text.Encoding]::Default)
Write-Host '   compression du cabinet...'
Push-Location $build
$null = & makecab.exe /F $ddf /V0
Pop-Location
if (-not (Test-Path $cab)) { throw 'makecab a échoué' }
Write-Host "   cabinet : $([math]::Round((Get-Item $cab).Length / 1MB, 1)) Mo"

# ------------------------------------------------------------------ 4. Base MSI
$msi = [string](Join-Path $dist "Comptes-$version.msi")
if (Test-Path $msi) { Remove-Item $msi -Force }
$inst = New-Object -ComObject WindowsInstaller.Installer
function Call($obj, [string]$name, $arguments = @()) { $obj.GetType().InvokeMember($name, 'InvokeMethod', $null, $obj, $arguments) }
function SetProp($obj, [string]$name, $arguments) { [void]$obj.GetType().InvokeMember($name, 'SetProperty', $null, $obj, $arguments) }
function GetProp($obj, [string]$name, $arguments = @()) { $obj.GetType().InvokeMember($name, 'GetProperty', $null, $obj, $arguments) }
$db = Call $inst 'OpenDatabase' @($msi, 3)

function Sql([string]$sql) { try { $v = Call $db 'OpenView' @($sql); [void](Call $v 'Execute'); [void](Call $v 'Close') } catch { throw "SQL en échec : $sql -> $($_.Exception.InnerException.Message)" } }
function Row([string]$table, [string[]]$cols, [object[]]$vals, [hashtable]$streams = @{}) {
  $sql = 'INSERT INTO `' + $table + '` (' + (($cols | ForEach-Object { '`' + $_ + '`' }) -join ', ') + ') VALUES (' + (($cols | ForEach-Object { '?' }) -join ', ') + ')'
  $view = Call $db 'OpenView' @($sql)
  $rec = Call $inst 'CreateRecord' @($cols.Count)
  for ($i = 0; $i -lt $vals.Count; $i++) {
    $v = $vals[$i]; if ($null -eq $v) { continue }
    if ($v -is [int]) { SetProp $rec 'IntegerData' @(($i + 1), $v) } else { SetProp $rec 'StringData' @(($i + 1), [string]$v) }
  }
  foreach ($k in $streams.Keys) { [void](Call $rec 'SetStream' @([int]$k, [string]$streams[$k])) }
  try { [void](Call $view 'Execute' @($rec)); [void](Call $view 'Close') } catch { throw "INSERT $table ($($vals -join ' | ')) -> $($_.Exception.InnerException.Message)" }
}

$tables = @(
  'CREATE TABLE `Property` (`Property` CHAR(72) NOT NULL, `Value` LONGCHAR NOT NULL LOCALIZABLE PRIMARY KEY `Property`)',
  'CREATE TABLE `Directory` (`Directory` CHAR(72) NOT NULL, `Directory_Parent` CHAR(72), `DefaultDir` CHAR(255) NOT NULL LOCALIZABLE PRIMARY KEY `Directory`)',
  'CREATE TABLE `Component` (`Component` CHAR(72) NOT NULL, `ComponentId` CHAR(38), `Directory_` CHAR(72) NOT NULL, `Attributes` INT NOT NULL, `Condition` CHAR(255), `KeyPath` CHAR(72) PRIMARY KEY `Component`)',
  'CREATE TABLE `Feature` (`Feature` CHAR(38) NOT NULL, `Feature_Parent` CHAR(38), `Title` CHAR(64) LOCALIZABLE, `Description` CHAR(255) LOCALIZABLE, `Display` INT, `Level` INT NOT NULL, `Directory_` CHAR(72), `Attributes` INT NOT NULL PRIMARY KEY `Feature`)',
  'CREATE TABLE `FeatureComponents` (`Feature_` CHAR(38) NOT NULL, `Component_` CHAR(72) NOT NULL PRIMARY KEY `Feature_`, `Component_`)',
  'CREATE TABLE `File` (`File` CHAR(72) NOT NULL, `Component_` CHAR(72) NOT NULL, `FileName` CHAR(255) NOT NULL LOCALIZABLE, `FileSize` LONG NOT NULL, `Version` CHAR(72), `Language` CHAR(20), `Attributes` INT, `Sequence` INT NOT NULL PRIMARY KEY `File`)',
  'CREATE TABLE `Media` (`DiskId` INT NOT NULL, `LastSequence` INT NOT NULL, `DiskPrompt` CHAR(64) LOCALIZABLE, `Cabinet` CHAR(255), `VolumeLabel` CHAR(32), `Source` CHAR(72) PRIMARY KEY `DiskId`)',
  'CREATE TABLE `Registry` (`Registry` CHAR(72) NOT NULL, `Root` SHORT NOT NULL, `Key` CHAR(255) NOT NULL LOCALIZABLE, `Name` CHAR(255) LOCALIZABLE, `Value` LONGCHAR LOCALIZABLE, `Component_` CHAR(72) NOT NULL PRIMARY KEY `Registry`)',
  'CREATE TABLE `Shortcut` (`Shortcut` CHAR(72) NOT NULL, `Directory_` CHAR(72) NOT NULL, `Name` CHAR(128) NOT NULL LOCALIZABLE, `Component_` CHAR(72) NOT NULL, `Target` CHAR(72) NOT NULL, `Arguments` CHAR(255), `Description` CHAR(255) LOCALIZABLE, `Hotkey` INT, `Icon_` CHAR(72), `IconIndex` INT, `ShowCmd` INT, `WkDir` CHAR(72) PRIMARY KEY `Shortcut`)',
  'CREATE TABLE `RemoveFolder` (`FolderId` CHAR(72) NOT NULL, `Component_` CHAR(72) NOT NULL, `DirProperty` CHAR(72) NOT NULL, `InstallMode` INT NOT NULL PRIMARY KEY `FolderId`)',
  'CREATE TABLE `Icon` (`Name` CHAR(72) NOT NULL, `Data` OBJECT NOT NULL PRIMARY KEY `Name`)',
  'CREATE TABLE `Upgrade` (`UpgradeCode` CHAR(38) NOT NULL, `VersionMin` CHAR(20), `VersionMax` CHAR(20), `Language` CHAR(255), `Attributes` LONG NOT NULL, `Remove` CHAR(255), `ActionProperty` CHAR(72) NOT NULL PRIMARY KEY `UpgradeCode`, `VersionMin`, `VersionMax`, `Language`, `Attributes`)',
  'CREATE TABLE `CustomAction` (`Action` CHAR(72) NOT NULL, `Type` SHORT NOT NULL, `Source` CHAR(72), `Target` CHAR(255), `ExtendedType` LONG PRIMARY KEY `Action`)',
  'CREATE TABLE `InstallExecuteSequence` (`Action` CHAR(72) NOT NULL, `Condition` CHAR(255), `Sequence` SHORT PRIMARY KEY `Action`)',
  'CREATE TABLE `InstallUISequence` (`Action` CHAR(72) NOT NULL, `Condition` CHAR(255), `Sequence` SHORT PRIMARY KEY `Action`)',
  'CREATE TABLE `AdminExecuteSequence` (`Action` CHAR(72) NOT NULL, `Condition` CHAR(255), `Sequence` SHORT PRIMARY KEY `Action`)',
  'CREATE TABLE `AdvtExecuteSequence` (`Action` CHAR(72) NOT NULL, `Condition` CHAR(255), `Sequence` SHORT PRIMARY KEY `Action`)'
)
$tables | ForEach-Object { Sql $_ }

$productCode = '{' + [guid]::NewGuid().ToString().ToUpper() + '}'
$props = [ordered]@{
  ProductCode = $productCode; ProductName = 'Comptes'; ProductVersion = $version; ProductLanguage = '1036'; Manufacturer = 'Comptes'
  UpgradeCode = $UPGRADE_CODE; ARPPRODUCTICON = 'Comptes.ico'; ARPCOMMENTS = 'Gestion des dépenses à partir des relevés La Banque Postale'
  SecureCustomProperties = 'PREVIOUSVERSIONSINSTALLED'; INSTALLLEVEL = '1'; REBOOT = 'ReallySuppress'; ARPNOMODIFY = '1'
}
foreach ($k in $props.Keys) { Row 'Property' @('Property', 'Value') @($k, $props[$k]) }

# dossiers système + arborescence
$sysDirs = @(
  @('TARGETDIR', $null, 'SourceDir'), @('LocalAppDataFolder', 'TARGETDIR', '.'), @('ProgramsSub', 'LocalAppDataFolder', 'Programs'),
  @('INSTALLFOLDER', 'ProgramsSub', 'Comptes'), @('ProgramMenuFolder', 'TARGETDIR', '.'), @('AppMenuFolder', 'ProgramMenuFolder', 'Comptes'), @('DesktopFolder', 'TARGETDIR', '.')
)
foreach ($d in $sysDirs) { Row 'Directory' @('Directory', 'Directory_Parent', 'DefaultDir') $d }
foreach ($d in $dirRows) { Row 'Directory' @('Directory', 'Directory_Parent', 'DefaultDir') $d }

# composants (un par dossier) + raccourcis
$allComps = @()
foreach ($d in $compFiles.Keys) {
  $cid = "C_$d"; $allComps += $cid
  Row 'Component' @('Component', 'ComponentId', 'Directory_', 'Attributes', 'KeyPath') @($cid, (New-Guid5 "Comptes|$($compDirRel[$d])"), $d, 0, $compFiles[$d])
}
Row 'Component' @('Component', 'ComponentId', 'Directory_', 'Attributes', 'KeyPath') @('AppShortcuts', (New-Guid5 'Comptes|shortcuts-menu'), 'AppMenuFolder', 4, 'reg_menu')
Row 'Component' @('Component', 'ComponentId', 'Directory_', 'Attributes', 'KeyPath') @('DesktopShortcut', (New-Guid5 'Comptes|shortcut-desktop'), 'DesktopFolder', 4, 'reg_desktop')
$allComps += 'AppShortcuts', 'DesktopShortcut'
Row 'Registry' @('Registry', 'Root', 'Key', 'Name', 'Value', 'Component_') @('reg_menu', 1, 'Software\Comptes', 'Menu', '#1', 'AppShortcuts')
Row 'Registry' @('Registry', 'Root', 'Key', 'Name', 'Value', 'Component_') @('reg_desktop', 1, 'Software\Comptes', 'Bureau', '#1', 'DesktopShortcut')
Row 'Feature' @('Feature', 'Title', 'Description', 'Display', 'Level', 'Directory_', 'Attributes') @('MainFeature', 'Comptes', 'Application Comptes', 1, 1, 'INSTALLFOLDER', 0)
foreach ($c in $allComps) { Row 'FeatureComponents' @('Feature_', 'Component_') @('MainFeature', $c) }

$sd = Get-DosName 'Arrêter Comptes.lnk' @{}
Row 'Shortcut' @('Shortcut', 'Directory_', 'Name', 'Component_', 'Target', 'Arguments', 'Description', 'Icon_', 'IconIndex', 'ShowCmd', 'WkDir') @('lnkStart', 'AppMenuFolder', 'Comptes.lnk', 'AppShortcuts', '[WindowsFolder]System32\WindowsPowerShell\v1.0\powershell.exe', '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "[INSTALLFOLDER]Comptes.ps1"', 'Ouvrir Comptes', 'Comptes.ico', 0, 7, 'INSTALLFOLDER')
Row 'Shortcut' @('Shortcut', 'Directory_', 'Name', 'Component_', 'Target', 'Arguments', 'Description', 'Icon_', 'IconIndex', 'ShowCmd', 'WkDir') @('lnkStop', 'AppMenuFolder', $sd, 'AppShortcuts', '[WindowsFolder]System32\WindowsPowerShell\v1.0\powershell.exe', '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "[INSTALLFOLDER]Comptes.ps1" -Stop', 'Arrêter le serveur Comptes', 'Comptes.ico', 0, 7, 'INSTALLFOLDER')
Row 'Shortcut' @('Shortcut', 'Directory_', 'Name', 'Component_', 'Target', 'Arguments', 'Description', 'Icon_', 'IconIndex', 'ShowCmd', 'WkDir') @('lnkDesk', 'DesktopFolder', 'Comptes.lnk', 'DesktopShortcut', '[WindowsFolder]System32\WindowsPowerShell\v1.0\powershell.exe', '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "[INSTALLFOLDER]Comptes.ps1"', 'Ouvrir Comptes', 'Comptes.ico', 0, 7, 'INSTALLFOLDER')
Row 'RemoveFolder' @('FolderId', 'Component_', 'DirProperty', 'InstallMode') @('rmAppMenu', 'AppShortcuts', 'AppMenuFolder', 2)
Row 'Icon' @('Name', 'Data') @('Comptes.ico', $null) @{ 2 = $ico }

# fichiers + média
foreach ($r in $fileRows) { Row 'File' @('File', 'Component_', 'FileName', 'FileSize', 'Sequence') @($r[0], $r[1], $r[2], [int]$r[3], [int]$r[4]) }
Row 'Media' @('DiskId', 'LastSequence', 'Cabinet') @(1, $fileRows.Count, '#Comptes.cab')
Row '_Streams' @('Name', 'Data') @('Comptes.cab', $null) @{ 2 = $cab }

# mise à jour majeure + arrêt du serveur avant remplacement/désinstallation
Row 'Upgrade' @('UpgradeCode', 'VersionMin', 'VersionMax', 'Attributes', 'ActionProperty') @($UPGRADE_CODE, '0.0.0', $version, 768, 'PREVIOUSVERSIONSINSTALLED')
Row 'CustomAction' @('Action', 'Type', 'Source', 'Target') @('StopApp', 98, 'INSTALLFOLDER', '"[WindowsFolder]System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "[INSTALLFOLDER]Comptes.ps1" -Stop')
$seq = [ordered]@{
  LaunchConditions = 100; FindRelatedProducts = 200; CostInitialize = 800; FileCost = 900; CostFinalize = 1000; MigrateFeatureStates = 1200
  InstallValidate = 1400; StopApp = 1401; RemoveExistingProducts = 1450; InstallInitialize = 1500; ProcessComponents = 1600; UnpublishFeatures = 1800
  RemoveShortcuts = 3200; RemoveRegistryValues = 2600; RemoveFiles = 3500; RemoveFolders = 3600; CreateFolders = 3700; InstallFiles = 4000
  CreateShortcuts = 4500; WriteRegistryValues = 5000; RegisterUser = 6000; RegisterProduct = 6100; PublishFeatures = 6300; PublishProduct = 6400; InstallFinalize = 6600
}
foreach ($k in $seq.Keys) { Row 'InstallExecuteSequence' @('Action', 'Sequence') @($k, [int]$seq[$k]) }
foreach ($k in 'FindRelatedProducts', 'CostInitialize', 'FileCost', 'CostFinalize', 'MigrateFeatureStates') { Row 'InstallUISequence' @('Action', 'Sequence') @($k, [int]$seq[$k]) }
Row 'InstallUISequence' @('Action', 'Sequence') @('ExecuteAction', 1300)
foreach ($k in 'CostInitialize', 'FileCost', 'CostFinalize', 'InstallValidate', 'InstallInitialize', 'InstallFiles', 'InstallFinalize') { Row 'AdminExecuteSequence' @('Action', 'Sequence') @($k, [int]$seq[$k]) }
foreach ($k in 'CostInitialize', 'CostFinalize', 'InstallValidate', 'InstallInitialize', 'PublishFeatures', 'PublishProduct', 'InstallFinalize') { Row 'AdvtExecuteSequence' @('Action', 'Sequence') @($k, [int]$seq[$k]) }

# informations de résumé
$si = GetProp $db 'SummaryInformation' @(20)
$sum = @{ 2 = 'Installation de Comptes'; 3 = 'Comptes'; 4 = 'Comptes'; 5 = 'Installer'; 6 = "Comptes $version - gestion des dépenses"; 7 = 'Intel;1036'; 9 = ('{' + [guid]::NewGuid().ToString().ToUpper() + '}'); 14 = 200; 15 = 10; 18 = 'Comptes build-msi.ps1' }
foreach ($k in $sum.Keys) { SetProp $si 'Property' @([int]$k, $sum[$k]) }
[void](Call $si 'Persist')
[void](Call $db 'Commit')
[Runtime.InteropServices.Marshal]::ReleaseComObject($db) | Out-Null
[Runtime.InteropServices.Marshal]::ReleaseComObject($inst) | Out-Null

Write-Host "== MSI : $msi ($([math]::Round((Get-Item $msi).Length / 1MB, 1)) Mo)"
