# dsh-cot-smart 安全工具：急救（禁用/启用插件）
# 用法: powershell -File firstaid.ps1 [off|on]
#   off (默认): 给 cot-smart entry 加 disabled: true -> dsh 跳过插件正常启动（不删任何东西，可逆）
#   on        : 移除 disabled -> 重新启用插件
# 原理: DSH fail-loud 只对"已启用且加载失败"的插件崩溃；disabled 的 entry 是唯一合法豁免。
# 注意: 用 $args[0] 读参数（param 绑定在本环境不可靠）。
$Action = if ($args.Count -gt 0) { $args[0] } else { "off" }

$node = "$PSScriptRoot\firstaid-toggle.mjs"
$res = & node $node $Action
if ($LASTEXITCODE -ne 0) { Write-Host "❌ 切换失败"; exit 1 }
Write-Host "插件 entry 现在是: $res"
if ($Action -eq "off") {
  Write-Host "✅ 已禁用 cot-smart。重启 dsh web 即可正常启动（插件被跳过，其余不受影响）。"
  Write-Host "   重新启用: powershell -File $PSScriptRoot\firstaid.ps1 on"
} else {
  Write-Host "✅ 已启用 cot-smart。重启 dsh web 生效。"
}
