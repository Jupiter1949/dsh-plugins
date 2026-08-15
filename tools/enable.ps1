# dsh-cot-smart first aid: RE-ENABLE plugin
# Usage: powershell -File enable.ps1
# Removes the disabled flag from the cot-smart entry -> plugin active again on next start.
$ErrorActionPreference = "Stop"
$node = Join-Path $PSScriptRoot "firstaid-toggle.mjs"
$res = & node $node "on"
if ($LASTEXITCODE -ne 0) { Write-Host "FAILED to enable"; exit 1 }
Write-Host ("ENABLED cot-smart. entry: " + $res)
Write-Host "Restart dsh web to apply."
