# syntax=docker/dockerfile:1.6

# ============================================================
# Stage 1: 构建前端
# ============================================================
FROM node:20-alpine AS builder-frontend

WORKDIR /app

# 1. 复制 Workspace 配置文件 (利用缓存层)
COPY package.json package-lock.json* ./
COPY frontend/package.json frontend/
# 虽然不需要构建后端，但 npm workspaces 校验时需要所有 workspace 存在，否则会报错
COPY backend/package.json backend/

# 2. 安装依赖 (前后端依赖都会在根 node_modules 提升)
# 注意：即使只构建前端，monorepo 也通常需要完整 install 以保持 hoisted 依赖树一致
RUN \
  if [ -f package-lock.json ]; then \
    npm ci --registry=https://registry.npmmirror.com --no-audit --no-fund || npm ci --no-audit --no-fund; \
  else \
    npm install --registry=https://registry.npmmirror.com --no-audit --no-fund || npm install --no-audit --no-fund; \
  fi

# 3. 复制源码
COPY frontend/ frontend/

# 4. 执行构建 (使用 npm workspace 命令)
RUN npm run build -w frontend

# ============================================================
# Stage 2: 构建后端 (TypeScript -> JavaScript)
# ============================================================
FROM node:20-alpine AS builder-backend

WORKDIR /app

# 1. 复制 Workspace 配置文件
COPY package.json package-lock.json* ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/

# 2. 安装依赖
RUN \
  if [ -f package-lock.json ]; then \
    npm ci --registry=https://registry.npmmirror.com --no-audit --no-fund || npm ci --no-audit --no-fund; \
  else \
    npm install --registry=https://registry.npmmirror.com --no-audit --no-fund || npm install --no-audit --no-fund; \
  fi

# 3. 复制源码
COPY backend/ backend/

# 4. 执行构建
RUN npm run build -w backend

# ============================================================
# Stage 3: 最终运行镜像 (仅包含后端运行时依赖和产物)
# ============================================================
FROM node:20-alpine AS runner

ENV NODE_ENV=production \
    PORT=8787

WORKDIR /app

# 1. 准备安装生产依赖的文件
# 必须包含根 package.json (workspace 定义) 和 backend package.json
COPY package.json package-lock.json* ./
COPY backend/package.json backend/

# 2. 仅安装后端的生产依赖 (忽略 devDeps 且不装前端依赖)
# `--include-workspace-root` 确保根目录依赖(若有)也装上
RUN \
  if [ -f package-lock.json ]; then \
    npm ci --omit=dev -w backend --include-workspace-root --registry=https://registry.npmmirror.com --no-audit --no-fund || \
    npm ci --omit=dev -w backend --include-workspace-root --no-audit --no-fund; \
  else \
    npm install --omit=dev -w backend --include-workspace-root --registry=https://registry.npmmirror.com --no-audit --no-fund || \
    npm install --omit=dev -w backend --include-workspace-root --no-audit --no-fund; \
  fi \
  && npm cache clean --force

# 3. 复制后端编译产物 (TypeScript -> JavaScript)
# 路径: backend/dist -> /app/backend/dist
COPY --from=builder-backend /app/backend/dist backend/dist

# 4. 复制前端编译产物到 backend/dist/client
# index.ts 中配置的 STATIC_DIR: resolve(__dirname, 'client')
# 即: backend/dist/index.js -> backend/dist/client
COPY --from=builder-frontend /app/frontend/dist backend/dist/client

# 工作目录设为 backend，这样启动路径更直观 (dotenv 读取 cwd/.env)
WORKDIR /app/backend

# 暴露端口
EXPOSE 8787

# 健康检查
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:8787/health || exit 1

# 5. 启动命令 (相对于 /app/backend)
CMD ["node", "dist/index.js"]
