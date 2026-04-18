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

Set-Location $PSScriptRoot

# Ensure that the build uses the correct API URL from .env file
$env:VITE_API_URL = ""
$envProdFile = Join-Path $PSScriptRoot ".env.production"
$envFile = Join-Path $PSScriptRoot ".env"

$targetEnvFile = if (Test-Path $envProdFile) { $envProdFile } else { $envFile }

if (Test-Path $targetEnvFile) {
    foreach ($line in Get-Content $targetEnvFile) {
        if ($line -match '^\s*VITE_API_URL\s*=\s*(.*)$') {
            $env:VITE_API_URL = $matches[1].Trim()
        }
    }
}
if ($env:VITE_API_URL) {
    Write-Host "=> Using VITE_API_URL from $(Split-Path $targetEnvFile -Leaf): $($env:VITE_API_URL)" -ForegroundColor DarkGray
} else {
    Write-Host "=> VITE_API_URL is empty, using default configuration." -ForegroundColor DarkGray
}

npm install
# Clear build caches so env vars are always re-evaluated from .env files
Remove-Item -Path "tsconfig.app.tsbuildinfo", "tsconfig.node.tsbuildinfo" -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force "node_modules\.vite" -ErrorAction SilentlyContinue
npm run build:ext

# 将生成的 zip 移到 release 目录
Move-Item -Path "catheadtab-v*.zip" -Destination $releaseDir -Force -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "=> Build complete! Chrome extension ZIP saved to release/ directory:" -ForegroundColor Magenta
Get-ChildItem $releaseDir | ForEach-Object { Write-Host "  - $($_.Name)" }
Write-Host ""
