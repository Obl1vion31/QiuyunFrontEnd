import { defineConfig } from 'astro/config';
import { fileURLToPath } from 'node:url';
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
  adapter: process.env.VERCEL === '1' ? vercel({includeFiles:['chromium.br','fonts.tar.br','al2023.tar.br','swiftshader.tar.br'].map(name=>'node_modules/@sparticuz/chromium/bin/'+name)}) : node({ mode: 'standalone' }),
  integrations: [react()],
  security: { allowedDomains },
  // 动态业务链接显式关闭HTML预取，实际导航由ClientRouter读取；静态资源沿用默认行为。
  prefetch: { prefetchAll: false, defaultStrategy: 'hover' },
  vite: {
    // PDF仅在服务端运行；开发预打包不应按旧浏览器目标处理其Node专用依赖。
    optimizeDeps: { exclude: ['puppeteer-core', '@sparticuz/chromium'] },
    // Quick Tunnel 每次生成不同子域名，只允许 Cloudflare 官方临时预览域。
    server: {
      allowedHosts: ['.trycloudflare.com'],
      // 只排除当前项目自己的工具与验收归档，不匹配工作树所在的父级.tools。
      watch: { ignored: ['.tools', 'verified'].map(directory => fileURLToPath(new URL(`./${directory}/**`, import.meta.url))) },
    },
  },
});
