# 前端团队管理系统

本仓库用于建设一个轻量、清晰、便于 AI 协作的前端业务系统网站。

当前项目处于 Phase 01 首页基线阶段：已建立第一套技术基线、结构基线和设计基线，并完成“前端团队总枢纽首页”的本地版本。

## 当前技术栈

- Astro 4
- React 18
- TypeScript
- pnpm

说明：当前本地 Node 版本为 `18.19.1`，依赖版本已固定，避免安装到要求更高 Node 版本的 Astro 5。

## 安装和启动

```bash
pnpm install
pnpm dev
```

启动后打开终端输出的本地地址。若默认端口被占用，Astro 会自动切换到下一个可用端口。

## 常用开发命令

```bash
pnpm dev
pnpm build
pnpm preview
pnpm check
```

## 当前开发状态

已完成：

- 项目文档结构；
- Codex 使用说明；
- 简版产品定义；
- 参考资料目录；
- 执行计划目录；
- Astro + React + TypeScript 技术基线；
- 前端团队总枢纽首页；
- 首页内容配置；
- 本地构建和预览脚本。

尚未建立：

- 数据库；
- 后台管理系统；
- 登录和权限系统；
- 生产部署流程；
- 业务系统、组织人员系统、绩效报酬系统的真实模块。

## 项目结构

```text
frontend-system/
├── AGENTS.md
├── README.md
├── instruction.md
├── docs/
│   ├── PRODUCT.md
│   ├── STRUCTURE.md
│   ├── DESIGN.md
│   ├── ROADMAP.md
│   ├── DECISIONS.md
│   ├── exec-plans/
│   │   ├── README.md
│   │   └── phase-01-homepage.md
│   ├── exec-results/
│   │   └── phase-01-homepage.md
│   └── references/
│       └── README.md
├── src/
│   ├── components/
│   ├── data/
│   └── pages/
├── astro.config.mjs
├── package.json
├── pnpm-lock.yaml
├── tsconfig.json
├── .gitignore
└── ...
```

## 文档索引

### 项目入口

- `README.md`：项目级入口，说明状态、技术栈、命令、目录和文档索引。
- `AGENTS.md`：Codex/agents 的协作规则和必读路径。
- `instruction.md`：如何更有效地让 Codex 参与网站规划、设计、实现、调试和优化。

### 产品和架构文档

- `docs/PRODUCT.md`：产品定位、目标用户、核心问题、能力地图、产品边界和开放问题。
- `docs/STRUCTURE.md`：信息架构、页面结构、导航关系和模块边界。
- `docs/DESIGN.md`：长期设计原则、视觉语言、中文阅读体验和响应式原则。
- `docs/ROADMAP.md`：阶段规划、后续功能、暂缓事项和里程碑。
- `docs/DECISIONS.md`：已经批准、会影响后续产品或技术实现的重要决定。

### 执行文档

- `docs/exec-plans/README.md`：执行计划目录说明。
- `docs/exec-plans/phase-01-homepage.md`：Phase 01 首页计划文件。
- `docs/exec-results/phase-01-homepage.md`：Phase 01 首页执行结果。

### 参考资料

- `docs/references/README.md`：参考资料目录说明。
- `docs/references/Hero_Ref.md`：总枢纽首页应包含的内容范围。它不是样式参考，也不要求复刻 Markdown 格式。

## 根目录文件管理说明

根目录保留少量技术框架必须放置的文件：

- `package.json`：项目脚本和依赖声明。
- `pnpm-lock.yaml`：依赖锁定文件，保证安装结果一致。
- `astro.config.mjs`：Astro 配置。
- `tsconfig.json`：TypeScript 配置。
- `.gitignore`：Git 忽略规则。

以下目录是本地生成内容，已被 `.gitignore` 忽略，不应提交到仓库：

- `node_modules/`
- `dist/`
- `.astro/`

业务文档统一放在 `docs/`。页面源码统一放在 `src/`。

## Phase 索引

| Phase | 计划文件 | 结果文件 | 状态 |
| --- | --- | --- | --- |
| Phase 01：首页基线 | `docs/exec-plans/phase-01-homepage.md` | `docs/exec-results/phase-01-homepage.md` | 本地完成，待审核 |

## 当前优先级

1. 审核 Phase 01 首页结果。
2. 确认三个系统入口的真实去向或继续保持建设中状态。
3. 决定是否配置预览环境。
4. 决定是否提交并推送当前 Phase 01 改动。
5. 再进入后续业务模块规划。
