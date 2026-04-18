#!/bin/bash

# CatHeadTab 一键更新脚本
# 执行此脚本将拉取最新代码并重新构建 Docker 镜像

echo "🚀 Starting update..."

# 1. 拉取最新代码
echo "📥 Pulling latest changes from git..."
git pull

# 2. 重新构建并启动容器
echo "🏗️ Rebuilding and restarting containers..."
docker compose up -d --build

echo "✅ Update complete! CatHeadTab is now running the latest version."
