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
NC='\033[0m' # No Color

echo -e "${CYAN}=============================${NC}"
echo -e "${CYAN}  CatHeadTab Dev Server      ${NC}"
echo -e "${CYAN}=============================${NC}"
echo ""
echo -e "${YELLOW}[Note] 数据库依赖：${NC}"
echo -e "${YELLOW}请确保本地已经运行了 PostgreSQL 并在 5432 端口监听。${NC}"
echo -e "${WHITE}如果没有本地 PostgreSQL，可以使用 docker 仅启动数据库：${NC}"
echo -e "${GRAY}docker-compose up -d catheadtab-db${NC}"
echo ""

# 加载 .env 文件
ENV_FILE="$SCRIPT_DIR/.env"
if [ -f "$ENV_FILE" ]; then
  echo -e "${MAGENTA}=> 加载环境变量: $ENV_FILE${NC}"
  while IFS= read -r line || [ -n "$line" ]; do
    # 去除首尾空白
    line="$(echo "$line" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
    # 跳过空行和注释
    if [ -z "$line" ] || [[ "$line" == \#* ]]; then
      continue
    fi
    # 解析 key=value
    if [[ "$line" == *=* ]]; then
      key="${line%%=*}"
      val="${line#*=}"
      # 去除 key/value 首尾空白
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

# 记录后台进程 PID，用于退出时清理
BACKEND_PID=""
FRONTEND_PID=""

cleanup() {
  echo ""
  echo -e "${YELLOW}=> 正在停止服务...${NC}"
  if [ -n "$BACKEND_PID" ] && kill -0 "$BACKEND_PID" 2>/dev/null; then
    kill "$BACKEND_PID" 2>/dev/null
    echo -e "${GREEN}   后端已停止 (PID: $BACKEND_PID)${NC}"
  fi
  if [ -n "$FRONTEND_PID" ] && kill -0 "$FRONTEND_PID" 2>/dev/null; then
    kill "$FRONTEND_PID" 2>/dev/null
    echo -e "${GREEN}   前端已停止 (PID: $FRONTEND_PID)${NC}"
  fi
  echo -e "${CYAN}=> 服务已全部停止。${NC}"
  exit 0
}

# 捕获退出信号，优雅停止子进程
trap cleanup SIGINT SIGTERM EXIT

# 环境检查
echo -e "${CYAN}=> 检查依赖环境...${NC}"

# 检查 go
if ! command -v go &>/dev/null; then
  echo -e "${RED}[Error] 未找到 go 命令，请先安装 Go: https://go.dev/dl/${NC}"
  exit 1
fi
echo -e "   ${GRAY}go: $(go version)${NC}"

# 检查 node / npm
if ! command -v node &>/dev/null || ! command -v npm &>/dev/null; then
  echo -e "${RED}[Error] 未找到 node/npm 命令，请先安装 Node.js: https://nodejs.org/${NC}"
  exit 1
fi
echo -e "   ${GRAY}node: $(node -v)${NC}"
echo -e "   ${GRAY}npm:  $(npm -v)${NC}"

# 检查前端依赖是否已安装
if [ ! -d "$SCRIPT_DIR/frontend/node_modules" ]; then
  echo ""
  echo -e "${YELLOW}=> 前端 node_modules 不存在，正在安装依赖...${NC}"
  (cd "$SCRIPT_DIR/frontend" && npm install)
  echo -e "${GREEN}=> 前端依赖安装完成。${NC}"
fi
echo ""

# 杀掉占用指定端口的旧进程
kill_port() {
  local port=$1
  local pids
  pids=$(lsof -ti :"$port" 2>/dev/null || true)
  if [ -n "$pids" ]; then
    echo -e "${YELLOW}=> 端口 $port 已被占用，正在终止旧进程 (PID: $pids)...${NC}"
    echo "$pids" | xargs kill -9 2>/dev/null || true
    # 等待端口释放
    sleep 1
    echo -e "${GREEN}   端口 $port 已释放。${NC}"
  fi
}

# 启动前先清理可能残留的旧进程
kill_port 8080
kill_port 5174

# 启动 Go 后端
echo -e "${GREEN}=> 启动 Go 后端...${NC}"
(cd "$SCRIPT_DIR/backend" && go run ./cmd/server/main.go) &
BACKEND_PID=$!

# 启动 React 前端
echo -e "${GREEN}=> 启动 React 前端...${NC}"
(cd "$SCRIPT_DIR/frontend" && npm run dev) &
FRONTEND_PID=$!

echo ""
echo -e "${CYAN}=> 前后端已在后台启动！${NC}"
echo -e "${WHITE}=> Frontend URL: http://localhost:5174${NC}"
echo -e "${WHITE}=> Backend API:  http://localhost:8080${NC}"
echo -e "${WHITE}=> 按 Ctrl+C 停止所有服务。${NC}"

# 等待子进程，任意一个退出则触发清理
wait -n "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true

# 如果有一个进程意外退出，提示并停止另一个
echo -e "${RED}=> 检测到某个服务已退出，正在停止剩余服务...${NC}"
cleanup
