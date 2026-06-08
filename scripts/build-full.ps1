# SuperTxt 离线完整版安装包构建（内嵌 WebView2 运行时，~197MB）
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot\..

# 添加 NSIS 到 PATH
$nsisBin = "C:\Program Files (x86)\NSIS\Bin"
if (Test-Path $nsisBin) { $env:Path = "$nsisBin;$env:Path" }

# 确保 webviewInstallMode 为 offlineInstaller
$confPath = "src-tauri\tauri.conf.json"
$conf = Get-Content $confPath -Raw
$conf = $conf -replace '"type":\s*"skip"', '"type": "offlineInstaller"'
$conf = $conf -replace '"type":\s*"embedBootstrapper"', '"type": "offlineInstaller"'
$conf | Set-Content $confPath -NoNewline

Write-Host "==> 构建离线完整版安装包 (offlineInstaller)..." -ForegroundColor Cyan
npx tauri build --bundles nsis

# 恢复默认配置为 skip
$conf = Get-Content $confPath -Raw
$conf = $conf -replace '"type":\s*"offlineInstaller"', '"type": "skip"'
$conf | Set-Content $confPath -NoNewline

# 重命名输出
$outDir = "src-tauri\target\release\bundle\nsis"
$setup = Get-ChildItem $outDir -Filter "SuperTxt_*_x64-setup.exe" | Select-Object -First 1
if ($setup) {
    $newName = $setup.Name -replace '_x64-setup\.exe$', '_x64-setup-full.exe'
    Rename-Item $setup.FullName $newName -Force
    Write-Host "==> 生成: $outDir\$newName" -ForegroundColor Green
}
