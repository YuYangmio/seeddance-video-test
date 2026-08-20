import { createMiddleware } from 'hono/factory';
import type { Context } from 'hono';

/**
 * 管理员权限中间件
 *
 * 当前设计：与现有系统会话 / Cookie 校验一致。
 * 为便于独立部署 / 本地联调，采用分层策略：
 *   1) 优先走现有系统：读取 Cookie 并 requireAuthentication -> requireRole('admin' | 'superAdmin')
 *   2) 如未接入现有认证（例如本地开发 / 独立部署），则允许通过 x-admin-token 头匹配
 *      env 中的 VERIFY_ADMIN_TOKEN（可选，生产强烈建议接入正式认证）
 *
 * 这里将"认证 + 鉴权"封装为一个单一的 createAdminOnly() 中间件，
 * 并通过 env 变量切换模式：
 *   AUTH_MODE = 'system' (默认，需要接入后启用 requireAuthentication) | 'simple' (本地/独立，x-admin-token)
 */

type AuthMode = 'system' | 'simple';

function getAuthMode(): AuthMode {
  const m = (process.env.AUTH_MODE ?? 'simple').toLowerCase();
  return m === 'system' ? 'system' : 'simple';
}

export interface AdminUser {
  id: string;
  role: 'admin' | 'superAdmin';
  name?: string;
}

/**
 * 从 cookie / header 中提取会话身份并要求 admin / superAdmin
 */
export const requireAdmin = createMiddleware<{
  Variables: { user: AdminUser };
}>(async (c: Context, next) => {
  const mode = getAuthMode();

  if (mode === 'system') {
    // --- 正式接入现有系统时的占位 ---
    // 此处调用: requireAuthentication(cookie) -> getUser -> checkRole in ['admin','superAdmin']
    // 未接入前先返回 501，避免误放行
    return c.json(
      { error: { code: 'AUTH_NOT_IMPLEMENTED', message: 'AUTH_MODE=system 尚未接入现有认证' } },
      501,
    );
  }

  // --- simple 模式：x-admin-token 匹配 ---
  const expectedToken = process.env.VERIFY_ADMIN_TOKEN;
  if (!expectedToken) {
    return c.json(
      {
        error: {
          code: 'AUTH_MISCONFIGURED',
          message: 'simple 模式需要配置 VERIFY_ADMIN_TOKEN 环境变量',
        },
      },
      500,
    );
  }
  const given = c.req.header('x-admin-token') ?? '';
  if (!given || given.trim() !== expectedToken.trim()) {
    return c.json(
      { error: { code: 'FORBIDDEN', message: '需要管理员权限' } },
      403,
    );
  }

  c.set('user', { id: 'local-admin', role: 'admin', name: 'Local Admin' });
  await next();
});
