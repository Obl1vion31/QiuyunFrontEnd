# 前端团队管理系统

这是一个面向前端业务工作的轻量网站。当前首页用于说明前端定位、工作链路和后续系统入口；它不是完整业务系统。

网站以部门工作流为叙事核心，呈现前端在内容、视觉、发布、用户触点和反馈回流中的职能与目标。

## 技术栈

- Astro 4
- React 18
- TypeScript
- pnpm

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

## 项目结构

```text
.
├── AGENTS.md
├── README.md
├── instruction.md
├── docs/
│   ├── DECISIONS.md
│   ├── DESIGN.md
│   └── ROADMAP.md
├── src/
│   ├── components/
│   ├── data/
│   └── pages/
├── astro.config.mjs
├── package.json
├── pnpm-lock.yaml
└── tsconfig.json
```

## 文档

- `docs/DECISIONS.md`：已经确认的产品、结构和技术结论。
- `docs/DESIGN.md`：已经确认的长期视觉与交互规则；当前等待新视觉方向选定。
- `docs/ROADMAP.md`：当前、下一步和暂缓事项。
- `AGENTS.md`：agent 在本仓库中的长期协作规则。
- `instruction.md`：通用 Codex 网站协作说明。

## 当前状态

已经完成：

- Astro + React + TypeScript 技术基线；
- 前端团队总枢纽首页；
- 首页内容配置；
- 本地构建与预览脚本。

当前进行：

- 审核“内容穿越总控台”新版首页；
- 用真实 3:4 帖子封面替换临时封面板；
- 检查桌面端和移动端的滚动观感。

尚未建设：

- 数据库和后台；
- 登录和权限；
- 真实业务模块；
- 自动采集和报告生成；
- 生产部署流程。
