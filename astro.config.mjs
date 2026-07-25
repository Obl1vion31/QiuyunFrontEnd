import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import node from '@astrojs/node';

// 当前只启用 React 集成：首页的 ContentTunnel 以 React Island 实现滚动映射，
// 其余页面结构继续由 Astro 静态输出。
export default defineConfig({
  output: 'hybrid',
  adapter: node({ mode: 'standalone' }),
  integrations: [react()],
  vite: {
    // Quick Tunnel 每次生成不同子域名，只允许 Cloudflare 官方临时预览域。
    server: { allowedHosts: ['.trycloudflare.com'] },
  },
});
