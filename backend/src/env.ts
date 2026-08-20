import { z } from 'zod';

const envSchema = z.object({
  VOLCENGINE_ACCESS_KEY: z.string().min(1, 'VOLCENGINE_ACCESS_KEY 不能为空'),
  VOLCENGINE_SECRET_KEY: z.string().min(1, 'VOLCENGINE_SECRET_KEY 不能为空'),
  VOLCENGINE_SESSION_TOKEN: z.string().optional(),
  ARK_REGION: z.string().default('cn-beijing'),

  PORT: z.coerce.number().default(8787),
});

export type Env = z.infer<typeof envSchema>;

let cachedEnv: Env | null = null;

export function loadEnv(): Env {
  if (cachedEnv) return cachedEnv;

  // 手动读取 process.env，不引入 dotenv 依赖（Hono/node 在启动时可由 --env-file 或上层注入）
  const raw = {
    VOLCENGINE_ACCESS_KEY: process.env.VOLCENGINE_ACCESS_KEY,
    VOLCENGINE_SECRET_KEY: process.env.VOLCENGINE_SECRET_KEY,
    VOLCENGINE_SESSION_TOKEN: process.env.VOLCENGINE_SESSION_TOKEN,
    ARK_REGION: process.env.ARK_REGION,
    PORT: process.env.PORT,
  };

  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    throw new Error(`环境变量校验失败: ${issues}`);
  }
  cachedEnv = parsed.data;
  return cachedEnv;
}
