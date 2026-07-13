import { defineConfig } from 'astro/config';
import react from '@astrojs/react';

// 当前只启用 React 集成：首页的 ContentTunnel 以 React Island 实现滚动映射，
// 其余页面结构继续由 Astro 静态输出。
export default defineConfig({
  integrations: [react()],
});
