#!/usr/bin/env bash
# ============================================================
#  本地 Mac 一键部署到 ECS：
#    1) rsync 上传源码（排除 node_modules/.env/.git/dist）
#    2) ssh 远程执行 deploy-ecs.sh
#  用法：
#    bash scripts/upload-and-deploy.sh root@115.190.55.1
#    或指定目录：
#    APP_DIR=/opt/seeddance-verify bash scripts/upload-and-deploy.sh root@115.190.55.1
# ============================================================
set -euo pipefail

TARGET="${1:-}"
if [ -z "$TARGET" ]; then
  echo "用法：bash $0 <user@ecs-ip>"
  echo "例  ：bash $0 root@115.190.55.1"
  exit 1
fi

APP_DIR="${APP_DIR:-/opt/seeddance-verify}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

log()  { echo -e "\033[32m[upload]\033[0m $*"; }
die()  { echo -e "\033[31m[upload][error]\033[0m $*" 1>&2; exit 1; }

command -v rsync >/dev/null 2>&1 || die "本地需要有 rsync（Mac 自带，检查是否在 PATH 中）"
command -v ssh   >/dev/null 2>&1 || die "本地需要有 ssh"

log "1/2 rsync 同步源码到 ${TARGET}:${APP_DIR}（排除 node_modules/.env/.git/本地编译产物）..."
ssh "${TARGET}" "mkdir -p ${APP_DIR}"
rsync -avz --partial --progress \
  --exclude='node_modules'        \
  --exclude='*/node_modules'      \
  --exclude='.env'                \
  --exclude='.env.*.local'        \
  --exclude='backend/.env'        \
  --exclude='frontend/.env'       \
  --exclude='.git'                \
  --exclude='.trae'               \
  --exclude='backend/dist'        \
  --exclude='frontend/dist'       \
  --exclude='*.log'               \
  "${PROJECT_ROOT}/" "${TARGET}:${APP_DIR}/"

log "2/2 在远程执行 deploy-ecs.sh..."
ssh -t "${TARGET}" "chmod +x ${APP_DIR}/scripts/deploy-ecs.sh && sudo bash ${APP_DIR}/scripts/deploy-ecs.sh"
