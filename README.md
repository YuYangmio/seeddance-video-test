# Seedance 产物溯源验证工具

通过调用第三方视频生成厂商 API 生成视频，并使用火山方舟（Ark）的官方鉴伪接口验证视频是否由 Seedance 系列模型生成，用于溯源对比测试。

## 功能

- 支持多个视频生成厂商：
  - **MiniMax** (H3 模型)
  - **Seedance** (火山方舟 doubao-seedance-2.0)
  - 自定义厂商（可配置 endpoint/model）
- 输入 Prompt → 厂商生成视频 → 自动提交方舟鉴伪 → 返回溯源结果
- 轻量 BFF 架构，前端通过相对路径请求后端，无 CORS 困扰
- 治愈系 UI（字节蓝品牌色 + 毛玻璃效果）

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | React 18 + TypeScript + Vite + Tailwind CSS |
| 后端 | Node.js + TypeScript + Hono + tsx |
| 鉴权 | X-Admin-Token 简单令牌模式 |
| 方舟 API | SigV4 HMAC-SHA256 签名（AK/SK） |

## 目录结构

```
.
├── backend/                # BFF 服务 (Hono)
│   ├── src/
│   │   ├── clients/        # 方舟 API 客户端 (SigV4 签名)
│   │   ├── middleware/     # 鉴权中间件
│   │   ├── routes/         # 路由 (/vendor/*, /verify/*)
│   │   ├── vendors/        # 厂商适配器 (minimax, seedance)
│   │   ├── env.ts          # 环境变量加载
│   │   ├── index.ts        # 入口
│   │   └── types.ts
│   ├── .env.example
│   └── package.json
├── frontend/               # React 前端
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── api.ts          # API 封装 + 轮询
│   │   └── types.ts
│   ├── .env.example
│   └── package.json
├── package.json            # Monorepo workspaces 根配置
└── .gitignore
```

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置后端环境变量

```bash
cd backend
cp .env.example .env
```

编辑 `backend/.env`，填入必要配置：

```env
# ---- 方舟 OpenAPI（产物验证接口）----
# 火山引擎 IAM 长期凭证：
VOLCENGINE_ACCESS_KEY=你的AK
VOLCENGINE_SECRET_KEY=你的SK
# 使用 API Explorer 临时凭证时还需填：
# VOLCENGINE_SESSION_TOKEN=

ARK_REGION=cn-beijing

# ---- 鉴权 ----
AUTH_MODE=simple
VERIFY_ADMIN_TOKEN=自定义一个强随机字符串

# ---- 服务端口 ----
PORT=8787
```

**获取 AK/SK**：火山引擎控制台 → 右上角头像 → API 访问密钥 → 创建密钥。

### 3. 配置前端环境变量（可选）

```bash
cd ../frontend
cp .env.example .env
```

默认无需修改，前端 Vite dev server 监听 5173，代理到后端 8787。

### 4. 启动开发服务

**方式一：分别启动（推荐调试时使用）**

终端 A - 后端：
```bash
npm run dev:backend
```

终端 B - 前端：
```bash
npm run dev:frontend
```

**方式二：自定义端口**
```bash
PORT=9000 npm run dev:backend       # 后端用 9000
VITE_PORT=3000 npm run dev:frontend # 前端用 3000
# 同时修改 frontend/.env 中 VITE_BFF_PORT=9000
```

### 5. 使用

1. 打开浏览器访问 `http://localhost:5173`
2. 在顶部输入 `VERIFY_ADMIN_TOKEN` 的值（与 `.env` 一致），点击确认鉴权
3. 选择厂商（MiniMax / Seedance）
4. 填入对应厂商的 API Key：
   - **MiniMax Key**：MiniMax 控制台 → API 密钥管理 → 创建密钥
   - **Seedance Key**：方舟控制台 → API Key 管理 → 创建 API Key（格式 `ark-xxx`，不是 IAM AK/SK）
5. 输入 Prompt，选择分辨率/时长/比例，点击「开始」
6. 等待 2-5 分钟，视频生成完成后自动提交方舟验证，页面会显示：
   - 🟢 **True**：确认是 Seedance 生成
   - 🔴 **False**：确认不是 Seedance 生成
   - ⚪ **Null**：信息不足无法判断（第三方模型常见）

## 厂商 API Key 说明

| 厂商 | Key 类型 | 获取地址 | 计费 |
|------|---------|---------|------|
| MiniMax | Bearer Token (sk-xxx) | https://platform.minimaxi.com/user-center/basic-information/interface-key | 需充值「按量付费」余额（非 TokenPlan/Credits） |
| Seedance | Bearer Token (ark-xxx) | https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey | 方舟账户需有余额（>200元或资源包） |

> 厂商 API Key 仅在浏览器 sessionStorage 中临时保存，不入库、不持久化到服务器。

## 方舟验证 API 说明

方舟 `CreateArkOfficialResultQuery` / `GetArkOfficialResult` 接口使用 **IAM AK/SK + SigV4 签名**鉴权（与推理接口的 Bearer API Key 不同），配置在后端 `.env` 中。

支持验证的模型范围：
- 视频：Seedance 2.0 / 2.0 fast / 2.0 mini 及后续模型
- 图片：Seedream 5.0 及后续模型
- 列表外模型返回 `isOfficial: "Null"`

## 生产部署

建议使用 Docker + Nginx 反向代理部署（前端静态资源 + 后端 BFF 同源）：

- Nginx 对外暴露 80/443
- `/vendor/*`、`/verify/*`、`/health` 反向代理到 BFF（端口 8787）
- 静态资源由 Nginx 直接 serve
- `proxy_read_timeout` 设置为 120s-180s（视频生成轮询耗时长）
- `try_files $uri $uri/ /index.html` 支持 React Router SPA 路由

## 环境变量参考

### Backend (`backend/.env`)

| 变量 | 必填 | 默认值 | 说明 |
|------|------|--------|------|
| `VOLCENGINE_ACCESS_KEY` | ✅ | - | 火山引擎 IAM Access Key |
| `VOLCENGINE_SECRET_KEY` | ✅ | - | 火山引擎 IAM Secret Key |
| `VOLCENGINE_SESSION_TOKEN` | ❌ | - | 临时凭证 Session Token（使用 STS 时） |
| `ARK_REGION` | ❌ | `cn-beijing` | 方舟区域 |
| `AUTH_MODE` | ❌ | `simple` | `simple`(Token鉴权) / `system`(预留) |
| `VERIFY_ADMIN_TOKEN` | ✅ | - | 管理员 Token，前端请求通过 `X-Admin-Token` 头传递 |
| `PORT` | ❌ | `8787` | BFF 监听端口 |
| `CORS_ORIGINS` | ❌ | 空 | 生产模式 CORS 白名单，逗号分隔；留空仅允许同源 |

### Frontend (`frontend/.env`)

| 变量 | 必填 | 默认值 | 说明 |
|------|------|--------|------|
| `VITE_PORT` | ❌ | `5173` | Vite dev server 端口 |
| `VITE_BFF_HOST` | ❌ | `http://127.0.0.1` | 后端 BFF 地址（dev 代理用） |
| `VITE_BFF_PORT` | ❌ | `8787` | 后端 BFF 端口 |
| `VITE_STRICT_PORT` | ❌ | `true` | 端口占用时是否严格报错（防止自动漂移） |

## 安全提醒

- ⚠️ **不要提交 `.env` 文件**（已在 `.gitignore` 中排除）
- ⚠️ 生产环境 `VERIFY_ADMIN_TOKEN` 必须设置为足够长的随机字符串
- ⚠️ `VOLCENGINE_*` 密钥是服务端凭证，仅存于后端环境变量
- ⚠️ 厂商 API Key 由用户在页面临时输入，不经过服务端持久化
