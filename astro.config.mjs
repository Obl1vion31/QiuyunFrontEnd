import { defineConfig } from 'astro/config';
import react from '@astrojs/react';

// Astro 项目配置。
// 当前只启用 React 集成，用于后续需要局部交互时使用 React Islands。
// Phase 01 首页本身主要是静态内容展示，没有强依赖复杂 React 状态。
export default defineConfig({
  integrations: [react()],
});
