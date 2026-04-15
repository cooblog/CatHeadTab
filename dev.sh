#!/usr/bin/env bash
set -euo pipefail

# 获取脚本所在目录（支持软链接）
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# 颜色定义
CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
MAGENTA='\033[0;35m'
GRAY='\033[0;90m'
WHITE='\033[1;37m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${CYAN}=============================${NC}"
echo -e "${CYAN}  CatHeadTab Dev Server      ${NC}"
echo -e "${CYAN}=============================${NC}"
echo ""
echo -e "${YELLOW}[Note] 数据库依赖：${NC}"
echo -e "${YELLOW}请确保本地已经运行了 PostgreSQL 并在 5432 端口监听。${NC}"
echo -e "${WHITE}如果没有本地 PostgreSQL，可以使用 docker 仅启动数据库：${NC}"
echo -e "${GRAY}docker compose up -d catheadtab-db${NC}"
echo ""

# 加载 .env 文件
ENV_FILE="$SCRIPT_DIR/.env"
if [ -f "$ENV_FILE" ]; then
  echo -e "${MAGENTA}=> 加载环境变量: $ENV_FILE${NC}"
  while IFS= read -r line || [ -n "$line" ]; do
    line="$(echo "$line" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
    if [ -z "$line" ] || [[ "$line" == \#* ]]; then
      continue
    fi
    if [[ "$line" == *=* ]]; then
      key="${line%%=*}"
      val="${line#*=}"
      key="$(echo "$key" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
      val="$(echo "$val" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
      export "$key=$val"
      echo -e "   ${GRAY}$key = $val${NC}"
    fi
  done < "$ENV_FILE"
  echo ""
else
  echo -e "${YELLOW}[Warn] 未找到 .env 文件，将使用程序内置默认值。${NC}"
  echo -e "${YELLOW}       可复制 .env.example 为 .env 并修改配置。${NC}"
  echo ""
fi

# 环境检查
echo -e "${CYAN}=> 检查依赖环境...${NC}"

if ! command -v go &>/dev/null; then
  echo -e "${RED}[Error] 未找到 go 命令，请先安装 Go: https://go.dev/dl/${NC}"
  exit 1
fi
echo -e "   ${GRAY}go: $(go version)${NC}"

if ! command -v node &>/dev/null || ! command -v npm &>/dev/null; then
  echo -e "${RED}[Error] 未找到 node/npm 命令，请先安装 Node.js: https://nodejs.org/${NC}"
  exit 1
fi
echo -e "   ${GRAY}node: $(node -v)${NC}"
echo -e "   ${GRAY}npm:  $(npm -v)${NC}"

if [ ! -d "$SCRIPT_DIR/frontend/node_modules" ]; then
  echo ""
  echo -e "${YELLOW}=> 前端 node_modules 不存在，正在安装依赖...${NC}"
  (cd "$SCRIPT_DIR/frontend" && npm install)
  echo -e "${GREEN}=> 前端依赖安装完成。${NC}"
fi
echo ""

# 杀掉监听指定端口的旧进程（仅 LISTEN 状态，不影响浏览器等客户端连接）
kill_port() {
  local port=$1
  local pids
  pids=$(lsof -ti :"$port" -sTCP:LISTEN 2>/dev/null || true)
  if [ -n "$pids" ]; then
    echo -e "${YELLOW}=> 端口 $port 被旧进程占用 (PID: $pids)，正在终止...${NC}"
    echo "$pids" | xargs kill 2>/dev/null || true
    sleep 1
    echo -e "${GREEN}   端口 $port 已释放。${NC}"
  fi
}

kill_port 8080
kill_port 5174

# Ctrl+C 时杀掉所有子进程
trap 'kill 0; exit 0' SIGINT SIGTERM

echo -e "${GREEN}=> 启动 Go 后端...${NC}"
(cd "$SCRIPT_DIR/backend" && go run ./cmd/server/main.go) &

echo -e "${GREEN}=> 启动 React 前端...${NC}"
(cd "$SCRIPT_DIR/frontend" && npm run dev) &

echo ""
echo -e "${CYAN}=============================${NC}"
echo -e "${WHITE}  Frontend: http://localhost:5174${NC}"
echo -e "${WHITE}  Backend:  http://localhost:8080${NC}"
echo -e "${CYAN}=============================${NC}"
echo -e "${GRAY}  按 Ctrl+C 停止所有服务${NC}"
echo ""

# 前台等待，任意子进程退出则全部退出
wait
