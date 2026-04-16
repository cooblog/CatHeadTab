Write-Host "=============================" -ForegroundColor Cyan
Write-Host "  CatHeadTab Build Release   " -ForegroundColor Cyan
Write-Host "=============================" -ForegroundColor Cyan
Write-Host ""

$releaseDir = Join-Path $PSScriptRoot "release"
if (!(Test-Path $releaseDir)) {
    New-Item -ItemType Directory -Path $releaseDir | Out-Null
} else {
    Remove-Item (Join-Path $releaseDir "*") -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host "=> 1. Building frontend Chrome extension (ZIP)..." -ForegroundColor Green
Set-Location (Join-Path $PSScriptRoot "frontend")
npm install
npm run build:ext

# 将生成的 zip 移到 release 目录
Move-Item -Path "catheadtab-v*.zip" -Destination $releaseDir -Force -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "=> Build complete! Chrome extension ZIP saved to release/ directory:" -ForegroundColor Magenta
Get-ChildItem $releaseDir | ForEach-Object { Write-Host "  - $($_.Name)" }

# 返回到根目录
Set-Location $PSScriptRoot
Write-Host ""
