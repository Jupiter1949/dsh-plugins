# dsh-cot-smart first aid: DISABLE plugin (escape hatch)
# Usage: powershell -File disable.ps1
# Adds disabled: true to the cot-smart entry -> dsh skips it on next start (nothing deleted, reversible).
# Why: DSH fail-loud only crashes on ENABLED entries that fail to load; disabled entries are the one legal exemption.
$ErrorActionPreference = "Stop"
$node = Join-Path $PSScriptRoot "firstaid-toggle.mjs"
$res = & node $node "off"
if ($LASTEXITCODE -ne 0) { Write-Host "FAILED to disable"; exit 1 }
Write-Host ("DISABLED cot-smart. entry: " + $res)
Write-Host "Restart dsh web to boot without the plugin."
Write-Host "Re-enable: powershell -File " + (Join-Path $PSScriptRoot "enable.ps1")
