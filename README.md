# 前端团队管理系统

这是一个面向前端业务工作的轻量网站。当前已实现总枢纽首页，用于说明前端内容工作台的定位、完整工作流和后续系统入口；它不是完整业务系统。

首页以部门工作流为叙事核心，呈现策划、内容、视觉、发布、用户触点和复盘如何持续衔接。首屏采用“内容穿越总控台”视觉：3:4 内容封面随页面滚动穿过工作台，底部轨道同步显示当前流程环节。

## 技术栈

- Astro `4.16.18`
- React `18.3.1`
- TypeScript
- pnpm `9.15.9`

当前依赖版本兼容本地 Node `18.19.1`。

## 本地运行

```bash
pnpm install
pnpm dev
```

常用检查：

```bash
pnpm check
pnpm build
pnpm preview
```

`pnpm build` 会先执行 Astro 类型检查，再生成静态站点到 `dist/`。

## 项目结构

```text
.
├── AGENTS.md
├── README.md
├── instruction.md
├── docs/
│   ├── README.md
│   ├── DECISIONS.md
│   ├── DESIGN.md
│   └── ROADMAP.md
├── public/
│   ├── README.md
│   └── images/home/        # 首页真实封面素材及目录说明
├── src/
│   ├── README.md
│   ├── components/
│   │   ├── ContentTunnel.tsx
│   │   └── ContentTunnel.module.css
│   ├── data/home.ts        # 首页文案、封面和入口配置
│   └── pages/index.astro   # 页面结构与后半段样式
├── astro.config.mjs
├── package.json
├── pnpm-lock.yaml
└── tsconfig.json
```

## 内容与素材维护

- 首页正文、六阶段工作流和系统入口统一修改 `src/data/home.ts`。
- 首页图片放在 `public/images/home/`，推荐 3:4 的 WebP 或 AVIF。
- 图片在配置中使用 `/images/home/文件名.webp`；未配置 `image` 时显示代码生成的临时封面。
- 系统入口有真实地址后，增加 `href`，并把 `status` 改为 `external`。
- `src/components/ContentTunnel.tsx` 负责滚动进度、封面循环和当前流程状态。
- `src/components/ContentTunnel.module.css` 负责 Hero 的层级、遮罩、3D 纵深和响应式排版。

## 首页交互说明

- 页面使用正常滚动，不锁定滚轮，也不强制翻页。
- 流程状态从 01 推进到 06；到达 06 后，封面在 Hero 离场期间仍继续循环。
- Hero 完全离开视口后，进入六阶段详细工作流和系统入口。
- `prefers-reduced-motion` 模式下封面保持静态纵深，不随滚动持续推进。

## 文档

- 主要内容目录均有对应的 `README.md` 说明用途、修改入口和安全边界；`src/pages/` 的说明位于 `src/README.md`，避免 Astro 自动生成额外页面。
- `docs/README.md`：核心文档导航及历史目录说明。
- `docs/DECISIONS.md`：已经确认的产品、结构和技术结论。
- `docs/DESIGN.md`：已经确认的长期视觉与交互规则。
- `docs/ROADMAP.md`：当前、下一步和暂缓事项。
- `AGENTS.md`：agent 在本仓库中的长期协作规则。
- `instruction.md`：通用 Codex 网站协作说明。

## 当前状态

已经完成：

- Astro + React + TypeScript 技术基线；
- 前端团队总枢纽首页；
- 首页内容配置；
- 八张真实 3:4 内容封面已接入首页内容流；
- 本地构建与预览脚本。

当前进行：

- 审核“内容穿越总控台”新版首页；
- 根据真实封面的色彩与文字密度检查遮罩和可读性；
- 检查桌面端、移动端和减少动态效果模式的滚动观感。

尚未建设：

- 数据库和后台；
- 登录和权限；
- 真实业务模块；
- 自动采集和报告生成；
- 生产部署流程。

## 当前边界

- 当前没有数据库、后台、登录、权限或自动采集。
- 首页不展示实时数据、项目明细或个人绩效薪资。
- 业务系统、组织与人员、绩效与报酬目前只保留入口概念。
- 当前只做本地验收，不包含生产部署配置。
