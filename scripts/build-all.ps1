# SuperTxt 一键构建两个安装包（轻量版 + 离线完整版）
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot\..

Write-Host "========================================" -ForegroundColor Magenta
Write-Host "  SuperTxt 安装包构建（双版本）" -ForegroundColor Magenta
Write-Host "========================================" -ForegroundColor Magenta

# 1. 轻量版
Write-Host "`n[1/2] 轻量版 (skip)" -ForegroundColor Yellow
& "$PSScriptRoot\build-lite.ps1"

# 2. 离线完整版
Write-Host "`n[2/2] 离线完整版 (offlineInstaller)" -ForegroundColor Yellow
& "$PSScriptRoot\build-full.ps1"

# 最终产物清单
Write-Host "`n========================================" -ForegroundColor Magenta
Write-Host "  构建完成！产物：" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Magenta
Get-ChildItem "src-tauri\target\release\bundle\nsis\*.exe" | ForEach-Object {
    $mb = [math]::Round($_.Length / 1MB, 2)
    Write-Host "  $($_.Name)  ($mb MB)" -ForegroundColor White
}
