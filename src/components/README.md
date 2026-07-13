# `src/components/` 组件

本目录存放需要复用或具有独立交互逻辑的界面组件。

## 当前文件

- `ContentTunnel.tsx`：首页 React Island，负责滚动进度、封面循环、流程状态和首屏结构。
- `ContentTunnel.module.css`：负责 Hero 的封面纵深、统一遮罩、信息排版、流程轨道和响应式样式。

## 文件关系

```text
pages/index.astro
        │ Props
        ▼
ContentTunnel.tsx
        │ className 与 CSS 变量
        ▼
ContentTunnel.module.css
```

- 文案和封面数据来自 `src/data/home.ts`，组件不自行维护业务内容。
- TSX 负责“什么时候、移动到哪里”，CSS Module 负责“长什么样、层级在哪里”。
- `--scene-scale` 由 TSX 根据基准画布写入，CSS 用它整体缩放 3D 场景。

## 阅读方式

1. 先看两个文件顶部的说明卡。
2. 再看 TSX 的编号 1–3 和 5，理解输入、配置、状态和页面结构。
3. 最后看 TSX 编号 4 与 CSS 编号 1、3、5、6，理解动画和视觉层级。
4. 只想修改某项效果时，根据文件头的 `【修改入口】` 直接跳转，不必从头逐行阅读。

## 维护原则

- 页面文案优先放在 `src/data/home.ts`，不要直接散落进组件。
- 非直观的动画计算需要说明进度范围和视觉目的。
- 新增动效时继续支持 `prefers-reduced-motion`，并避免锁定正常滚动。
- 注释优先说明需求、关联和原因，不逐行复述能够直接看懂的语法。
