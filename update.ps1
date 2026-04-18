# CatHeadTab 一键更新脚本 (PowerShell 版)
# 执行此脚本将拉取最新代码并重新构建 Docker 镜像

Write-Host "🚀 Starting update..." -ForegroundColor Cyan

# 1. 拉取最新代码
Write-Host "📥 Pulling latest changes from git..." -ForegroundColor Yellow
git pull

# 2. 重新构建并启动容器
Write-Host "🏗️ Rebuilding and restarting containers..." -ForegroundColor Yellow
docker compose up -d --build

Write-Host "✅ Update complete! CatHeadTab is now running the latest version." -ForegroundColor Green
