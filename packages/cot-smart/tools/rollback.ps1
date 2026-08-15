# dsh-cot-smart safety tool: ROLLBACK
# Usage: powershell -File rollback.ps1 [timestamp]
#   no arg        : list available backups
#   with timestamp: restore profile + plugin from that backup, after saving current state to pre-rollback-<ts>.
# Note: all ASCII so Windows PowerShell 5.1 parses without BOM issues.
$ErrorActionPreference = "Stop"
$Stamp = if ($args.Count -gt 0) { $args[0] } else { "" }

$bakRoot = "C:\Users\Jupiter\.dsh\backups"
if (-not $Stamp) {
  Write-Host "Available backups:"
  Get-ChildItem $bakRoot -Directory -ErrorAction SilentlyContinue | Sort-Object Name -Descending | Select-Object -First 10 | ForEach-Object { Write-Host ("  " + $_.Name) }
  Write-Host "Usage: rollback.ps1 <timestamp>"
  exit 0
}
$bakDir = Join-Path $bakRoot $Stamp
if (-not (Test-Path $bakDir)) { Write-Host ("NOT FOUND: " + $bakDir); exit 1 }
Write-Host ("Restoring from " + $bakDir + "; saving current state first...")
$pre = Join-Path $bakRoot ("pre-rollback-" + $Stamp)
New-Item -ItemType Directory -Force -Path $pre | Out-Null
$prof = "C:\Users\Jupiter\.dsh\profiles\web"
$dshHome = "C:\Users\Jupiter\.dsh"
foreach ($f in @((Join-Path $prof "package.json"), (Join-Path $prof "cordis.patch.yml"), (Join-Path $dshHome "settings.yaml"))) {
  if (Test-Path $f) { Copy-Item $f $pre -Force }
}
$map = @{
  "profile-package.json" = (Join-Path $prof "package.json")
  "profile-cordis.patch.yml" = (Join-Path $prof "cordis.patch.yml")
  "settings.yaml" = (Join-Path $dshHome "settings.yaml")
}
foreach ($k in $map.Keys) {
  $src = Join-Path $bakDir $k
  if (Test-Path $src) { Copy-Item $src $map[$k] -Force; Write-Host ("  restored " + $k) }
}
$plugin = "C:\Users\Jupiter\projects\dsh-plugins\packages\cot-smart"
if (Test-Path (Join-Path $bakDir "plugin-lib")) { Copy-Item -Recurse -Force (Join-Path $bakDir "plugin-lib") $plugin; Write-Host "  restored plugin lib" }
if (Test-Path (Join-Path $bakDir "plugin-package.json")) { Copy-Item (Join-Path $bakDir "plugin-package.json") (Join-Path $plugin "package.json") -Force; Write-Host "  restored plugin package.json" }
if (Test-Path (Join-Path $bakDir "plugin-cordis.patch.yml")) { Copy-Item (Join-Path $bakDir "plugin-cordis.patch.yml") (Join-Path $plugin "cordis.patch.yml") -Force; Write-Host "  restored plugin cordis.patch.yml" }
Write-Host "Rollback done. Restart dsh web to apply."
