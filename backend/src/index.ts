import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(process.cwd(), '.env') });

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { serve } from '@hono/node-server';
import { loadEnv } from './env';
import { requireAdmin } from './middleware/auth';
import { vendorRouter } from './routes/vendor';
import { verifyRouter } from './routes/verify';

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

// 404 fallback
app.notFound((c) =>
  c.json({ error: { code: 'NOT_FOUND', message: 'Not Found' } }, 404),
);
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
