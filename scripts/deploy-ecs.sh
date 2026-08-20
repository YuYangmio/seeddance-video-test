#!/usr/bin/env bash
# ============================================================
#  ECS 一键部署脚本（源码部署，无需 Docker）
#  目标系统：Ubuntu 22.04 LTS (x86_64)  —— 对应火山镜像：Ubuntu 22.04 64位
#  在 ECS 上执行：sudo bash deploy-ecs.sh
# ============================================================
set -euo pipefail

# ---------- 配置 ----------
APP_USER="${APP_USER:-root}"
APP_DIR="${APP_DIR:-/opt/seeddance-verify}"
APP_PORT="${APP_PORT:-8787}"
NODE_MAJOR="${NODE_MAJOR:-20}"

log()  { echo -e "\033[32m[deploy-ecs]\033[0m $*"; }
warn() { echo -e "\033[33m[deploy-ecs][warn]\033[0m $*" 1>&2; }
die()  { echo -e "\033[31m[deploy-ecs][error]\033[0m $*" 1>&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "请使用 sudo 或 root 身份运行此脚本"

# ---------- 0. 系统依赖 ----------
log "1/7 安装系统基础依赖 (curl ca-certificates gnupg build-essential)..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y --no-install-recommends curl ca-certificates gnupg build-essential tzdata

# ---------- 1. 安装 Node.js 20 (NodeSource) ----------
if ! command -v node >/dev/null 2>&1 || [[ "$(node -v | cut -d. -f1 | tr -d 'v')" -lt "$NODE_MAJOR" ]]; then
  log "2/7 安装 Node.js $NODE_MAJOR LTS （NodeSource 仓库）..."
  mkdir -p /etc/apt/keyrings
  rm -f /etc/apt/keyrings/nodesource.gpg
  curl -fsSL "https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key" \
    | gpg --dearmor --yes -o /etc/apt/keyrings/nodesource.gpg 2>/dev/null
  echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_${NODE_MAJOR}.x nodistro main" \
    > /etc/apt/sources.list.d/nodesource.list
  apt-get update -y
  apt-get install -y --no-install-recommends nodejs
fi
log "   Node: $(node -v)   npm: $(npm -v)"

# ---------- 2. 安装 PM2（进程守护 + 开机自启）----------
if ! command -v pm2 >/dev/null 2>&1; then
  log "3/7 安装 PM2（进程管理器）..."
  npm install -g pm2 --registry=https://registry.npmmirror.com || npm install -g pm2
fi
pm2 install pm2-logrotate >/dev/null 2>&1 || true
log "   pm2: $(pm2 -v)"

# ---------- 3. 准备项目目录 ----------
log "4/7 准备项目目录 ${APP_DIR}..."
mkdir -p "${APP_DIR}"
chown -R "${APP_USER}":"${APP_USER}" "${APP_DIR}"

# 源码必须已上传到 ${APP_DIR}（通过 scp / rsync / git clone 任一方式）
# 检测标志：根目录下必须有 package.json
if [ ! -f "${APP_DIR}/package.json" ]; then
  cat <<EOF

  $(warn "源码还未上传到 ${APP_DIR}。请在本地 Mac 执行：")

  方式 A — rsync 上传（推荐，增量）：
    rsync -avz --exclude='node_modules' --exclude='.env' --exclude='*/.env' \
      --exclude='.git' --exclude='backend/dist' --exclude='frontend/dist' \
      /本地/项目路径/ root@<ECS公网IP>:${APP_DIR}/

  方式 B — scp 上传（第一次）：
    tar czf seeddance-src.tar.gz \
      --exclude=node_modules --exclude=.git \
      --exclude='*/.env*' --exclude='backend/dist' --exclude='frontend/dist' .
    scp seeddance-src.tar.gz root@<ECS公网IP>:/tmp/
    ssh root@<ECS公网IP> "tar xzf /tmp/seeddance-src.tar.gz -C ${APP_DIR}"

  上传完成后，重新运行本脚本： sudo bash deploy-ecs.sh

EOF
  exit 2
fi

# ---------- 4. 安装依赖 ----------
log "5/7 安装 npm 依赖（monorepo）..."
cd "${APP_DIR}"
# 先清理旧的 node_modules 避免跨平台编译残留
# （不做也行，除非有 Mac/Linux 原生模块差异）
if [ -f package-lock.json ]; then
  npm ci --registry=https://registry.npmmirror.com --no-audit --no-fund \
    || npm ci --no-audit --no-fund
else
  npm install --registry=https://registry.npmmirror.com --no-audit --no-fund \
    || npm install --no-audit --no-fund
fi

# ---------- 5. 构建前后端 + 组装静态目录 ----------
log "6/7 构建前后端并组装静态文件目录..."
npm run build -w backend  2>&1 | tail -5
npm run build -w frontend 2>&1 | tail -5
# Dockerfile 内等价逻辑：frontend/dist -> backend/dist/client
mkdir -p backend/dist/client
rm -rf backend/dist/client/*
cp -R frontend/dist/. backend/dist/client/
log "   前端静态文件已复制到 backend/dist/client (${APP_DIR})"

# ---------- 6. 生成 / 校验 .env（放到 backend 下，因为 index.ts 读 process.cwd()/.env）----------
ENV_FILE="${APP_DIR}/backend/.env"
if [ ! -f "${ENV_FILE}" ]; then
  warn "未找到 ${ENV_FILE}，基于模板生成 .env，请务必编辑后再启动"
  cp -f "${APP_DIR}/.env.ecs.example" "${ENV_FILE}"
  chmod 600 "${ENV_FILE}"
  cat <<EOF

  ============================================================
   ⚠️  请先编辑管理员凭据与 AK/SK 后再启动：
       nano ${ENV_FILE}
   必填项：
     VOLCENGINE_ACCESS_KEY
     VOLCENGINE_SECRET_KEY
     VERIFY_ADMIN_TOKEN
  ============================================================

EOF
  NEED_EDIT=1
else
  NEED_EDIT=0
fi

# ---------- 7. PM2 启动服务 ----------
log "7/7 通过 PM2 启动服务（监听 ${APP_PORT}）..."
cd "${APP_DIR}/backend"

PORT="$APP_PORT" pm2 start dist/index.js \
  --name seeddance-verify \
  --cwd "${APP_DIR}/backend" \
  -i 1 \
  --update-env \
  || PORT="$APP_PORT" pm2 restart seeddance-verify --update-env

pm2 save
# 让 PM2 在重启后自启（根据当前 init 系统生成 systemd/upstart）
pm2 startup systemd -u "${APP_USER}" --hp "/${APP_USER}" 2>&1 | tail -3 || true
# 对 root 直接执行
if [ "${APP_USER}" = "root" ]; then
  pm2 startup systemd 2>&1 | tail -3 || true
fi

# ---------- 8. 健康检查 ----------
sleep 5
if curl -fsS --max-time 5 "http://127.0.0.1:${APP_PORT}/health" >/dev/null; then
  log ""
  log "✅ 部署成功！健康检查通过。"
else
  warn "⚠️ 健康检查未通过（可能还在启动，或 .env 未填）。查看日志："
  warn "   pm2 logs seeddance-verify --lines 50"
fi

log ""
log "常用命令："
log "  看日志   : pm2 logs seeddance-verify --lines 100"
log "  重启     : pm2 restart seeddance-verify"
log "  停止     : pm2 stop seeddance-verify"
log "  看状态   : pm2 status"
log "  重新部署 : 本脚本已幂等，上传新源码后再次运行 sudo bash deploy-ecs.sh 即可"

if [ "${NEED_EDIT:-0}" -eq 1 ]; then
  warn "还记得编辑 nano ${ENV_FILE} 后执行： pm2 restart seeddance-verify"
fi
