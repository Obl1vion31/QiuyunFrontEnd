import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import node from '@astrojs/node';
import vercel from '@astrojs/vercel';
import 'dotenv/config';

const authHost = process.env.BETTER_AUTH_URL ? new URL(process.env.BETTER_AUTH_URL).hostname : undefined;
// 预构建会读取本机 .env，正式入口不能依赖构建机的认证 URL 才进入信任列表。
const allowedDomains = [
  { hostname: 'localhost' },
  { hostname: '127.0.0.1' },
  { hostname: 'qiuyun-frontend.vercel.app', protocol: 'https' },
  ...(authHost && !['localhost', '127.0.0.1', 'qiuyun-frontend.vercel.app'].includes(authHost) ? [{ hostname: authHost }] : []),
];

// 当前只启用 React 集成：首页的 ContentTunnel 以 React Island 实现滚动映射，
// 其余页面结构继续由 Astro 静态输出。
export default defineConfig({
  output: 'server',
  adapter: process.env.VERCEL === '1' ? vercel() : node({ mode: 'standalone' }),
  integrations: [react()],
  security: { allowedDomains },
  // 控制台只在用户表达导航意图时预取，避免首屏并发触发全部动态页面查询。
  prefetch: { prefetchAll: false, defaultStrategy: 'hover' },
  vite: {
    // Quick Tunnel 每次生成不同子域名，只允许 Cloudflare 官方临时预览域。
    server: { allowedHosts: ['.trycloudflare.com'] },
  },
});
