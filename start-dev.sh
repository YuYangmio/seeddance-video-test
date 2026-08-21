#!/bin/bash
set -e

# ====== Seedance Verify 本地开发启动脚本 ======
# 用法: bash start-dev.sh

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"

# 1. 加载 nvm
export NVM_DIR="$HOME/.nvm"
if [ -s "$NVM_DIR/nvm.sh" ]; then
  . "$NVM_DIR/nvm.sh"
  nvm use 20 > /dev/null 2>&1
else
  echo "⚠️  nvm 未找到，尝试直接使用 node..."
fi

# 2. 检查 node/npm
if ! command -v npm &> /dev/null; then
  echo "❌ npm 未找到，请先安装 Node.js (推荐 nvm)"
  echo "   curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash"
  exit 1
fi

echo "✅ Node $(node -v) / npm $(npm -v)"

# 3. 清理旧端口
kill_port() {
  local pid=$(lsof -ti:$1 2>/dev/null)
  [ -n "$pid" ] && kill -9 $pid 2>/dev/null && echo "   已清理端口 $1 (pid=$pid)"
}
kill_port 8787
kill_port 5173

# 4. 启动后端
echo ""
echo "🚀 启动后端 (端口 8787)..."
cd "$PROJECT_DIR/backend"
npm run dev &
BACKEND_PID=$!
sleep 2

# 5. 启动前端
echo "🚀 启动前端 (端口 5173)..."
cd "$PROJECT_DIR/frontend"
npm run dev &
FRONTEND_PID=$!

# 6. 等待前端就绪
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✅ 前后端已启动"
echo "  前端:  http://localhost:5173"
echo "  后端:  http://localhost:8787"
echo "  PID:   后端=$BACKEND_PID 前端=$FRONTEND_PID"
echo "  停止:  kill $BACKEND_PID $FRONTEND_PID"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 保持前台运行，Ctrl+C 停止两个服务
trap "echo '停止服务...'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit 0" INT TERM
wait