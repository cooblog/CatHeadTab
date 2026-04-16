#!/usr/bin/env bash
set -euo pipefail

# 获取脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RELEASE_DIR="$SCRIPT_DIR/release"

# 颜色定义
CYAN='\033[0;36m'
GREEN='\033[0;32m'
MAGENTA='\033[0;35m'
GRAY='\033[0;90m'
NC='\033[0m'

echo -e "${CYAN}=============================${NC}"
echo -e "${CYAN}  CatHeadTab Build Release   ${NC}"
echo -e "${CYAN}=============================${NC}"
echo ""

# 初始化输出目录
mkdir -p "$RELEASE_DIR"
rm -f "$RELEASE_DIR"/*

echo -e "${GREEN}=> 1. 打包前端 Chrome 扩展 (ZIP)...${NC}"
(
  cd "$SCRIPT_DIR/frontend"
  npm install
  npm run build:ext
  # 将成功生成的 zip 移到 release 目录
  mv catheadtab-v*.zip "$RELEASE_DIR/" 2>/dev/null || true
)

echo ""
echo -e "${MAGENTA}=> 打包完成！Chrome扩展ZIP包已输出到 $RELEASE_DIR 目录：${NC}"
ls -lh "$RELEASE_DIR" | grep -v "^total" | awk '{print "  - " $9}'
echo ""
