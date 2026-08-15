# dsh-cot-smart safety tool: BACKUP
# Usage: powershell -File backup.ps1 [keep=N]
# Backs up profile + plugin files to a timestamped dir under ~/.dsh/backups,
# then prunes old backups to keep only the newest N (default keep=10).
# Note: keep all content ASCII (no Chinese/emoji) so Windows PowerShell 5.1 can
# parse without BOM issues.
param([int]$keep = 10)
$ErrorActionPreference = "Stop"
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$prof = "C:\Users\Jupiter\.dsh\profiles\web"
$dshHome = "C:\Users\Jupiter\.dsh"
$bakRoot = "C:\Users\Jupiter\.dsh\backups"
$bakDir = Join-Path $bakRoot $stamp
New-Item -ItemType Directory -Force -Path $bakDir | Out-Null

$files = @(
  @{ src=Join-Path $prof "package.json";     name="profile-package.json" },
  @{ src=Join-Path $prof "cordis.patch.yml"; name="profile-cordis.patch.yml" },
  @{ src=Join-Path $dshHome "settings.yaml"; name="settings.yaml" }
)
foreach ($f in $files) { if (Test-Path $f.src) { Copy-Item $f.src (Join-Path $bakDir $f.name) -Force } }
$plugin = "C:\Users\Jupiter\projects\dsh-cot-smart"
if (Test-Path (Join-Path $plugin "lib")) { Copy-Item -Recurse (Join-Path $plugin "lib") (Join-Path $bakDir "plugin-lib") }
Copy-Item (Join-Path $plugin "package.json") (Join-Path $bakDir "plugin-package.json") -Force
Copy-Item (Join-Path $plugin "cordis.patch.yml") (Join-Path $bakDir "plugin-cordis.patch.yml") -Force

# ---- prune old backups: keep newest $keep ----
$all = @(Get-ChildItem $bakRoot -Directory | Sort-Object Name -Descending)
$toDelete = $all | Select-Object -Skip $keep
foreach ($d in $toDelete) { Remove-Item -Recurse -Force $d.FullName; Write-Host ("pruned old backup: " + $d.Name) }

Write-Host ("backup done -> " + $bakDir)
Write-Host ("kept newest " + $keep + "; pruned " + $toDelete.Count + " old")
Write-Host ("rollback: powershell -File C:\Users\Jupiter\projects\dsh-cot-smart\tools\rollback.ps1 " + $stamp)
