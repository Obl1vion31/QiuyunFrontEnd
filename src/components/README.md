# `src/components/` 组件

本目录存放需要复用或具有独立交互逻辑的界面组件。

## 当前文件

- `ContentTunnel.tsx`：首页 React Island，负责滚动进度、封面循环、流程状态和首屏结构。
- `ContentTunnel.module.css`：负责 Hero 的封面纵深、统一遮罩、信息排版、流程轨道和响应式样式。

## 维护原则

- 页面文案优先放在 `src/data/home.ts`，不要直接散落进组件。
- 非直观的动画计算需要说明进度范围和视觉目的。
- 新增动效时继续支持 `prefers-reduced-motion`，并避免锁定正常滚动。
