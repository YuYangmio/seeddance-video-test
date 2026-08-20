import { config } from 'dotenv';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';

config({ path: resolve(process.cwd(), '.env') });

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { loadEnv } from './env';
import { requireAdmin } from './middleware/auth';
import { vendorRouter } from './routes/vendor';
import { verifyRouter } from './routes/verify';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 静态资源目录：
// - 本地开发 (tsx src/index.ts): 通常没构建前端，不会命中，走 Vite 代理
// - 部署构建: Dockerfile 会把前端 dist 复制到 `./client` (相对于 dist/index.js)
const STATIC_DIR = process.env.STATIC_DIR || resolve(__dirname, 'client');

const app = new Hono();

// 基础 middleware
app.use('*', logger());

function isLocalhostOrigin(origin: string | undefined): boolean {
  if (!origin) return false;
  // 允许 http(s)://localhost:<任意端口> / 127.0.0.1:<任意端口> / [::1]:<port>
  try {
    const u = new URL(origin);
    const host = u.hostname;
    const protocol = u.protocol;
    if (protocol !== 'http:' && protocol !== 'https:') return false;
    return (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '::1' ||
      host.endsWith('.localhost')
    );
  } catch {
    return false;
  }
}

const NODE_ENV = (process.env.NODE_ENV ?? 'development').toLowerCase();

app.use(
  '*',
  cors({
    origin: (origin) => {
      // 1) 用户显式配置 CORS_ORIGINS 白名单 → 严格按白名单（优先级最高，生产用）
      const allowList = (process.env.CORS_ORIGINS ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (allowList.length > 0) {
        // 白名单模式下：精确命中才放行；否则返回 list[0]（令浏览器拒绝）
        if (allowList.includes('*')) return '*'; // 允许用户显式写通配
        return origin && allowList.includes(origin) ? origin : allowList[0];
      }

      // 2) 未配置白名单时：
      //    - development: 宽松放行 localhost / 127.0.0.1 任意端口 → 用户改 VITE_PORT 不用动 CORS
      //    - production  : 严格回显同源 origin 或拒绝（写第一个）
      if (NODE_ENV === 'development') {
        if (!origin) return '*'; // 非浏览器请求
        if (isLocalhostOrigin(origin)) return origin;
        // 非本地源：开发期默认也回显（方便临时联调 docker host / LAN IP）
        return origin;
      }

      // production 无白名单：仅回显原 origin（等价于"同源单实例部署"场景）
      return origin ?? '*';
    },
    credentials: true,
    allowHeaders: ['Content-Type', 'Authorization', 'X-Admin-Token'],
    allowMethods: ['GET', 'POST', 'OPTIONS'],
  }),
);

// Health
app.get('/health', (c) =>
  c.json({
    ok: true,
    service: 'seedance-verify-bff',
    ts: Date.now(),
  }),
);

// Admin-only 路由组
const admin = new Hono();
admin.route('/vendor', vendorRouter);
admin.route('/verify', verifyRouter);
app.use('/vendor/*', requireAdmin);
app.use('/verify/*', requireAdmin);
app.route('/', admin);

// --- 静态资源托管 (生产部署) ---
// Docker 构建时，前端产物会放在 backend/dist/client 下
if (existsSync(STATIC_DIR)) {
  app.use(
    '/*',
    serveStatic({
      root: STATIC_DIR,
      index: 'index.html',
      // 如果路径找不到文件，交给下一个中间件或 404 (fallback 逻辑在 notFound 里处理)
    }),
  );
}

// 404 fallback
app.notFound((c) => {
  // --- SPA 路由回退 ---
  // 如果是浏览器发起的页面请求 (GET + Accept: text/html) 且存在静态文件目录，则返回 index.html
  const accept = c.req.header('Accept') || '';
  const isPageRequest = c.req.method === 'GET' && accept.includes('text/html');
  if (isPageRequest && existsSync(STATIC_DIR)) {
    try {
      const indexPath = join(STATIC_DIR, 'index.html');
      if (existsSync(indexPath)) {
        const content = readFileSync(indexPath, 'utf-8');
        return c.html(content);
      }
    } catch (e) {
      console.error('[SPA Fallback Error]', e);
    }
  }
  // --- API 默认 404 ---
  return c.json({ error: { code: 'NOT_FOUND', message: 'Not Found' } }, 404);
});
app.onError((err, c) => {
  // eslint-disable-next-line no-console
  console.error('[UnhandledError]', err);
  return c.json(
    {
      error: {
        code: 'INTERNAL_ERROR',
        message: err?.message?.slice(0, 500) ?? 'Internal Server Error',
      },
    },
    500,
  );
});

const env = loadEnv();
const port = env.PORT;

// 仅在直接启动时 serve；测试框架可 import app
if (process.env.NODE_ENV !== 'test') {
  serve({
    fetch: app.fetch,
    port,
  });
  // eslint-disable-next-line no-console
  console.log(`[seedance-verify-bff] listening on http://localhost:${port}`);
  // eslint-disable-next-line no-console
  console.log(
    `[seedance-verify-bff] AUTH_MODE=${process.env.AUTH_MODE ?? 'simple'}`,
  );
}

export { app };
