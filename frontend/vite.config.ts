import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// 统一端口/代理来源：允许通过 .env 或 CLI 环境变量覆盖
// 优先级：VITE_PORT > PORT > 默认 5173
export default defineConfig(({ mode }) => {
  // 读取 VITE_ / 非 VITE_ 前缀的 env（mode=development 时读 .env.development.local 等）
  const env = loadEnv(mode, process.cwd(), '');
  const uiPort = Number(env.VITE_PORT ?? env.PORT ?? 5173);
  const bffHost = env.VITE_BFF_HOST ?? 'http://localhost';
  const bffPort = Number(env.VITE_BFF_PORT ?? env.BFF_PORT ?? 8787);
  const bffTarget = `${bffHost}:${bffPort}`;

  // Vite 官方：strictPort=true 表示端口被占则直接退出，不偷偷漂移到下一个
  // 避免出现"用户以为在 5173，实际 Vite 跳到 5175 导致跨域白名单失效"的问题
  const strictPort = (env.VITE_STRICT_PORT ?? 'true') === 'true';

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      host: '0.0.0.0',
      port: uiPort,
      strictPort,
      proxy: {
        '/vendor': {
          target: bffTarget,
          changeOrigin: true,
        },
        '/verify': {
          target: bffTarget,
          changeOrigin: true,
        },
        '/health': {
          target: bffTarget,
          changeOrigin: true,
        },
      },
    },
  };
});
