# 前端团队管理系统

这是一个面向前端业务工作的轻量网站。当前包含静态总枢纽首页，以及受临时共享凭据保护、支持新做帖与改帖版本链的内容发布排期。

首页以部门工作流为叙事核心，呈现策划、内容、视觉、发布、用户触点和复盘如何持续衔接。首屏采用“内容穿越总控台”视觉：3:4 内容封面随页面滚动穿过工作台，底部轨道同步显示当前流程环节。

## 技术栈

- Astro `4.16.18`
- React `18.3.1`
- TypeScript
- pnpm `9.15.9`
- Neon PostgreSQL + Drizzle ORM
- Astro Node adapter（动态排期页和接口）

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
pnpm start
pnpm db:generate
pnpm db:check
pnpm db:migrate
pnpm db:import                 # 只读预检 Excel
pnpm db:import -- --apply      # 确认开发库迁移完成后写入
```

`pnpm build` 会先执行 Astro 类型检查，再生成静态站点到 `dist/`。

## 数据库和数据更新操作

先区分两个概念：

- `pnpm db:migrate` 更新的是数据库结构，例如新增字段、索引或数据修正规则。它不是用来同步每一条业务数据的。
- 新增、编辑排期属于数据内容变化。数据成功保存到 Neon 后会立即生效，不需要再执行 `migrate`、`build` 或其他同步命令。

所有数据库命令都必须在项目根目录执行，并先确认 `.env` 中的 `DATABASE_URL` 指向隔离的 Neon 开发分支，不能误连生产数据库。

### 第一次初始化项目

只在新电脑、全新 Neon 开发分支或数据库尚未初始化时执行：

```bash
pnpm install
pnpm db:check
pnpm db:migrate
pnpm dev
```

命令含义：

1. `pnpm install` 安装项目依赖。
2. `pnpm db:check` 检查数据库结构定义和迁移文件是否一致，不写入数据库。
3. `pnpm db:migrate` 把尚未执行的结构迁移和受控数据修正应用到 `.env` 指向的数据库。
4. `pnpm dev` 启动本地网站；访问 `/business/operations-schedule` 查看排期。

### 初版 Excel 一次性录入

Excel 只用于初始化现有排期，不是后续维护数据的长期入口。推荐先确认 Excel 内容，再一次性写入：

```bash
pnpm db:check
pnpm db:migrate
pnpm db:import
pnpm db:import -- --apply
```

执行顺序不能颠倒：先运行迁移，确保数据库具有最新字段，再导入数据。

- `pnpm db:import` 只读取固定 Excel 并显示校验结果，不连接或修改数据库。
- 确认数量和状态正确后，`pnpm db:import -- --apply` 才真正写入 Neon 开发数据库。
- 导入成功后不需要再次执行 `pnpm db:migrate`，刷新排期页面即可看到数据。
- 当前一次性导入以“Excel 来源 + 行号”作为唯一标识；重复执行会跳过已经导入的行，不会用后来修改的 Excel 覆盖数据库现有记录。

因此，如果 Excel 在真正执行 `--apply` 之前发生变化，可以替换文件后重新预检；如果已经成功导入，后续少量修正应直接在排期页面点击“编辑”完成，不要依赖重复导入覆盖旧数据。

### 日常新做帖、改帖和编辑排期

日常工作不再使用 Excel。启动网站后直接在排期页面新增或编辑：

```bash
pnpm dev
```

“新做帖”会创建 V0；“改帖”从原版本派生 V1/V2 并保留来源；“编辑排期”只更正当前记录。保存成功后只需刷新或继续操作，不需要执行以下命令：

```text
pnpm db:migrate
pnpm db:import
pnpm build
```

### 收到新的代码或迁移文件

只有拉取或收到的新代码中包含新的 `drizzle/*.sql` 迁移时，才需要执行：

```bash
pnpm install
pnpm db:check
pnpm db:migrate
pnpm check
pnpm dev
```

`pnpm db:migrate` 会记录已经执行过的迁移，因此重复运行不会重复应用旧迁移。当前推广状态和自动完成状态的数据修正也通过迁移执行；确认连接开发库后运行一次最新的 `pnpm db:migrate` 即可。

### 最常见情况速查

| 发生的事情 | 需要执行的命令 |
| --- | --- |
| 在网页新增或编辑排期 | 不需要数据库命令，保存后立即生效 |
| Excel 尚未正式导入，只修改了 Excel | 重新运行 `pnpm db:import` 预检，确认后执行 `pnpm db:import -- --apply` |
| Excel 已导入，又修改了同一批旧行 | 在网页编辑；重复导入不会覆盖旧记录 |
| 代码新增了数据库迁移 | `pnpm db:check`，然后 `pnpm db:migrate` |
| 数据已经成功写入 Neon | 不需要 `migrate`，刷新页面即可 |
| 只是修改前端样式或文案 | 本地开发只需 `pnpm dev`，不需要数据库命令 |

## 项目结构

```text
.
├── AGENTS.md
├── README.md
├── docs/
│   ├── README.md
│   ├── DECISIONS.md
│   ├── DESIGN.md
│   └── ROADMAP.md
├── public/
│   ├── README.md
│   └── images/home/        # 首页真实封面素材及目录说明
├── drizzle/                   # 数据库迁移
├── scripts/                    # 受控 Excel 导入预检与写入脚本
├── src/
│   ├── README.md
│   ├── components/
│   │   ├── ContentTunnel.tsx
│   │   └── ContentTunnel.module.css
│   ├── data/home.ts        # 首页文案、封面和入口配置
│   ├── db/                   # 排期表、校验与数据库连接
│   └── pages/                # 静态首页、动态排期页与写入接口
├── astro.config.mjs
├── package.json
├── pnpm-lock.yaml
└── tsconfig.json
```

## 内容与素材维护

- 首页正文、六阶段工作流和系统入口统一修改 `src/data/home.ts`。
- 首页图片放在 `public/images/home/`，推荐 3:4 的 WebP 或 AVIF。
- 图片在配置中使用 `/images/home/文件名.webp`；未配置 `image` 时显示代码生成的备用封面。
- 系统入口有真实地址后，增加 `href`，并把 `status` 改为 `external`。
- `src/components/ContentTunnel.tsx` 负责滚动进度、封面循环和当前流程状态。
- `src/components/ContentTunnel.module.css` 负责 Hero 的层级、遮罩、3D 纵深和响应式排版。

## 排期 MVP

复制 `.env.example` 为 `.env`，填写 Neon 开发分支连接串和共享访问凭据，然后执行 `pnpm db:migrate`。访问 `/business/operations-schedule` 时浏览器会要求输入共享账号密码。生产环境必须使用 HTTPS；真实 `.env` 不得提交。

## 首页交互说明

- 页面使用正常滚动，不锁定滚轮，也不强制翻页。
- 初始画面通过两层顺时针排列和渐进尺寸形成静态螺旋感；开始滚动后回归原有向前展开轨迹。
- 流程状态从 01 推进到 06；到达 06 后，封面在 Hero 离场期间仍继续循环。
- Hero 完全离开视口后，进入六阶段详细工作流和系统入口。
- `prefers-reduced-motion` 模式下封面保持静态纵深，不随滚动持续推进。

## 文档

- 主要内容目录均有对应的 `README.md` 说明用途、修改入口和安全边界；`src/pages/` 的说明位于 `src/README.md`，避免 Astro 自动生成额外页面。
- `docs/README.md`：核心文档导航和文档保存原则。
- `docs/DECISIONS.md`：已经确认的产品、结构和技术结论。
- `docs/DESIGN.md`：已经确认的长期视觉与交互规则。
- `docs/ROADMAP.md`：当前、下一步和暂缓事项。
- `AGENTS.md`：agent 在本仓库中的长期协作规则。

## 当前状态

已经完成：

- Astro + React + TypeScript 技术基线；
- 前端团队总枢纽首页；
- 首页内容配置；
- 八张真实 3:4 内容封面已接入首页内容流；
- 本地构建与预览脚本。
- 运营内容新做帖 V0、改帖 V1+、完整编辑、推广中视图与月度台账/月历；
- 非推广、待推广、测试中、放量中、已结束和测试淘汰六类推广状态；
- 分钟级应发/实发时间、自动完成状态、12 小时延期校验与 Excel 历史数据导入预检；
- Neon PostgreSQL 迁移、服务端校验与临时 HTTP Basic Auth。

当前进行：

- 审核“内容穿越总控台”新版首页；
- 根据真实封面的色彩与文字密度检查遮罩和可读性；
- 检查桌面端、移动端和减少动态效果模式的滚动观感。

尚未建设：

- 正式登录、多人权限与操作者审计；
- 排期删除、通用上传导入和导出；
- 自动采集和报告生成；
- 生产部署流程。

## 当前边界

- 当前仅排期 MVP 使用数据库和临时共享凭据，没有正式后台、登录或细粒度权限。
- 首页不展示实时数据、项目明细或个人绩效薪资。
- 业务系统入口已连接排期 MVP；组织与人员、绩效与报酬仍只保留入口概念。
- 当前只做本地验收，不包含生产部署配置。
- 本地 `public/excel/20260715 运营内容导入.xlsx` 通过受控脚本一次性导入；原始 `.xlsx` 被 Git 忽略，不上传到公开仓库。非推广帖不会因“非推广投放中”被识别成推广，完成情况按应发/实发时间计算。默认命令只预检，显式传入 `--apply` 才写入开发数据库。
