# 前端团队管理系统

这是一个面向前端业务工作的轻量网站。当前包含静态总枢纽首页，以及受用户名登录与管理员／员工权限保护的 `THE PLAN` 年度总周期规划和内容发布排期。

首页以部门工作流为叙事核心，呈现策划、内容、视觉、发布、用户触点和复盘如何持续衔接。首屏采用“内容穿越总控台”视觉：3:4 内容封面随页面滚动穿过工作台，底部轨道同步显示当前流程环节。

## 技术栈

- Astro `5.18.2`
- React `18.3.1`
- TypeScript
- pnpm `9.15.9`
- Neon PostgreSQL + Drizzle ORM
- Better Auth `1.7.7`（用户名、数据库会话与角色）
- Astro Node / Vercel adapters（本机服务与公网 Node 函数）

项目使用 Node 22，版本入口为 `.nvmrc`；Vercel 也固定使用 22.x。保留 React 18。

## 本地运行

```bash
pnpm install
pnpm dev
```

业务页面：

- `/business/annual-plan`：`THE PLAN` 年度内容总周期规划，统一查看自动总规划和各学科细致规划；
- `/business/operations-schedule`：具体内容与发布排期。
- `/business/daily-promotion-review`：推广帖逐日指标、生命周期与历史总览。
- `/business/non-promotion-review`：非推广帖首轮（约 7 天）/二轮（约 15 天）顺序复盘与同类基准。
- `/business/meeting-review`：例会总复盘，在现有周度总览上提供非推广推荐榜，支持按节点自主勾选和二次复盘。
- `/business/settings`：分类名称、可选状态和默认推广用途的全局规则版本。

## 临时公网预览

本机已将 Cloudflare Quick Tunnel 工具下载到 `.tools/cloudflared`，该目录被 Git 忽略，不会提交二进制文件。需要让其他人临时访问本地网站时，在项目根目录打开两个终端。

终端一启动本地网站：

```bash
pnpm dev
```

终端二启动临时公网隧道：

```bash
./.tools/cloudflared tunnel --url http://localhost:4321 --no-autoupdate
```

终端二会输出一个随机的 HTTPS 地址，例如 `https://random-name.trycloudflare.com`。把该地址发给访问者即可；本机仍然使用 `http://localhost:4321`。

- 两个终端都必须保持运行；关闭任一进程或电脑休眠后，公网地址就会失效。
- 每次重新启动 Quick Tunnel 都会生成不同地址，它只用于临时预览，不是正式部署。
- 以终端一实际显示的 `Local` 端口为准；如果 `4321` 被占用并自动改为 `4322`，终端二的 URL 也要同步改成 `http://localhost:4322`。
- 首页公开；业务页面使用网页登录。临时域名登录需要将 `BETTER_AUTH_URL` 改为实际 HTTPS 根地址并重启服务，结束后恢复本机地址。不要发送数据库连接串、认证密钥或 `.env`。
- 如果 `.tools/cloudflared` 不存在，可在当前 Linux x86_64 环境重新下载：

```bash
mkdir -p .tools
curl -fL --retry 3 \
  -o .tools/cloudflared \
  https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64
chmod 0755 .tools/cloudflared
./.tools/cloudflared --version
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
```

`pnpm build` 会先执行 Astro 类型检查，再构建静态首页与动态业务服务到 `dist/`。本机默认使用 Node adapter；Vercel 构建自动选择 Vercel adapter。

## 数据库和数据更新操作

先区分两个概念：

- `pnpm db:migrate` 更新的是数据库结构，例如新增字段、索引或数据修正规则。它不是用来同步每一条业务数据的。
- 新增、编辑排期属于数据内容变化。数据成功保存到 Neon 后会立即生效，不需要再执行 `migrate`、`build` 或其他同步命令。

所有数据库命令都必须在项目根目录执行，并确认目标分支。本项目公网与本地已明确共用当前 Neon 分支，因此本地数据修改也会影响公网；需要试验结构、批量修改或使用虚构数据时，先复制临时分支。

### 首次接入已有项目

使用 Node 22，执行 `pnpm install`，配置 `.env` 中的数据库连接、独立认证密钥和本机认证 URL，再运行 `pnpm db:check`、`pnpm db:migrate`、`pnpm dev`。

历史迁移包含已完成导入的数量校验，不能在空库中重放为日常初始化。新的开发环境从已有 Neon 分支复制；已应用迁移不修改，后续结构变化只追加迁移。

需要新增内部账号时运行：

```bash
pnpm account:create
```

脚本询问用户名、角色和密码；TTY 密码输入不显示。重复创建不重置密码或角色。网站关闭公开注册。

### 日常维护 THE PLAN

- 总规划是从启用的细致规划实时计算出的只读结果，不单独填写；
- 细致规划按照学科与帖子分类建立，一条规划行可以包含多个不重叠时间块；
- 时间块按半月设置起止，条幅直接显示自由备注；深色表示付费推广，浅色表示自然流或观察；
- 同一周期可设置多个付费子区间；总规划分别汇总内容流动周期和付费推广周期；
- 新建规划行为 V0，有效修改与历史恢复追加版本，已有历史不覆盖；
- “复制年度”将配置复制到空白年度，包含备注、推广区间、SOP 和启停状态；目标年度已有配置时不能覆盖；
- 网页保存更新当前连接的共享分支；公网与本地立即看到同一结果。其他 Neon 分支不会自动同步。

### 日常新做帖、改帖、编辑和删除排期

启动网站后直接在排期页面新增或编辑：

```bash
pnpm dev
```

“新做帖”会创建 V0；“改帖”从原版本派生 V1/V2 并保留来源；“编辑排期”只更正当前记录。这三个动作都允许项目文档暂缺；帖子发布后从 Inspector 进入“实发登记”，同时填写实发日期和 HTTP/HTTPS 项目文档链接，补齐截至实发时刻的逐日延期理由。保存成功后只需刷新或继续操作，不需要执行以下命令：

删除排期收进 Inspector 底部的弱化危险操作；已有改帖版本链、推广活动、非推广指标、复盘或用途变更记录时会拒绝删除，以保护业务历史。

```text
pnpm db:migrate
pnpm build
```

学科与帖子分类分别使用固定字典，并通过映射决定各学科可用的分类。面试课使用面试课、推广讲义帖、成功案例、喜报、面试信息、面试准备须知和创新帖七类；各学科可选“临时帖”，无法确定学科时选“临时学科 / 临时帖”；历史空分类归入临时帖，新建或编辑时必须选择。创建改帖只需填写一项“具体改动说明”。

### 延期与改期

应发满 8 小时进入延期第 1 天，此后每满 24 小时增加一天。逐日理由选择“自身原因 / 需求端原因”并填写文字；实发后停止累计。左上角提醒和排期页的延期、待补理由、待审批队列跨月份显示，填写理由不会提前消除尚未实发的延期提醒。

员工从帖子详情提交新发送时间和理由，管理员在待审批队列中处理；批准前原排期继续生效，批准后按新时间重新计时，旧理由和欠填记录保留。管理员直接改期同样填写理由。历史原因逐日复制，空原因补“未知”，标记历史补齐；历史详情默认折叠。

非推广复盘先选学科、再选帖子分类。数据无法获取时可按首轮或二轮选择“不复盘”并填写原因，后续可以恢复；跳过不生成零指标，也不计入同类基准。

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


| 发生的事情                   | 需要执行的命令                                                    |
| ----------------------- | ---------------------------------------------------------- |
| 在网页新增或编辑年度规划、排期         | 不需要数据库命令，保存后在当前连接分支立即生效                                    |
| 代码新增了数据库迁移              | `pnpm db:check`，然后 `pnpm db:migrate`                       |
| 数据已经成功写入 Neon           | 不需要 `migrate`，刷新页面即可                                       |
| 只是修改前端样式或文案             | 本地开发只需 `pnpm dev`，不需要数据库命令                                 |


## 项目结构

```text
.
├── AGENTS.md
├── README.md
├── docs/
│   ├── README.md
│   ├── DECISIONS.md
│   ├── DESIGN.md
│   ├── CURRENT-STAGE-SUMMARY.md
│   ├── data-model/                # 数据模型说明与 ER / 状态 / 版本图
│   ├── database-basics/README.md # Neon 工作台与数据库调试学习指南
│   ├── exec-plans/               # 用户要求长期保存的阶段计划
│   ├── exec-results/             # 用户要求长期保存的阶段结果
│   └── ROADMAP.md
├── public/
│   ├── README.md
│   └── images/home/        # 首页真实封面素材及目录说明
├── drizzle/                   # 数据库迁移
├── scripts/                    # 临时维护脚本的安全边界说明
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

## 业务控制台与登录

首页“登录工作台”进入 `/login`。未登录访问业务页面会转到登录表单，登录后返回原页面；接口返回 JSON 401，权限不足返回 403。会话有效期 7 天；退出、服务端撤销和过期立即生效，旧 Basic Auth 配置不再提供访问权限。

- 管理员可以使用现有全部业务操作。
- 员工可以查看规划、录入和编辑排期、登记实发、填写指标与复盘；已有排期的应发时间只能申请改期，经管理员同意后生效。
- 系统规则、年度规划写入／恢复、删除、已有笔记 ID 更正，以及删除或重建历史、改用途强制结束推广的操作只允许管理员执行。
- 两个角色共用团队业务数据。版本记录采用已验证的用户名，尚不等同于完整个人审计。
- 登录和退出提供等待、错误及重试反馈；会话失效保留表单输入，可在新标签页重新登录后重试。

## 公网托管与更新

正式入口：[内容工作台](https://qiuyun-frontend.vercel.app)。Vercel 项目为 `qiuyun-frontend`，与 Formward 使用同一账号、独立配置；当前通过 CLI 手动发布，Git 推送不自动部署。

Production 变量为 `DATABASE_URL`、`BETTER_AUTH_SECRET`、`BETTER_AUTH_URL` 和 `ENABLE_EXPERIMENTAL_COREPACK=1`。数据库连接与认证密钥设为 Secret；认证 URL 使用正式 HTTPS 根地址。本机 `.env` 保留本机 URL，预览环境不连接共享业务库。

更新代码时先执行 `pnpm check`、`pnpm test`、`pnpm db:check`、`pnpm build`；认证和权限变化还需要隔离浏览器验收。安装并登录 Vercel CLI 后，在已关联的仓库根目录运行：

```bash
vercel deploy --prod
```

新增迁移时先运行 `pnpm db:backup` 保存私有数据备份，核对待执行迁移，再运行 `pnpm db:migrate`；确认既有业务事实保持一致后发布。构建不执行迁移，后续结构变更需兼容仍运行的旧版本。

`.vercelignore` 排除环境配置、原始表格、参考截图和本机工具。备份位于被忽略的 `.tools/backups/`，不得公开。网站故障可通过 Vercel 回滚应用部署；应用回滚不自动恢复数据库，不删除新增表或历史事实。

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
- `docs/CURRENT-STAGE-SUMMARY.md`：当前视觉、功能、数据库结构和 development 数据摘要。
- `docs/data-model/DATA-MODEL.md`：当前数据表、主外键、版本链和推广生命周期逻辑。
- `docs/exec-results/phase-04-the-plan.md`：Phase 04 Executive Result、数据核对与最终验收结论。
- `docs/exec-results/phase-05-daily-promotion-review.md`：已正式完结的 Phase 05 Daily Promotion Review 交付结论。
- `docs/exec-plans/phase-05-daily-promotion-review.md`：Phase 05 Daily Promotion Review 简化计划。
- `docs/exec-plans/phase-06-meeting-and-weekly-review.md`：Phase 06 Meeting and Weekly Review 分步计划。
- `docs/exec-results/phase-06-meeting-and-weekly-review.md`：Phase 06 Meeting and Weekly Review 实施结果与收尾验收入口。
- `docs/database-basics/README.md`：Neon 工作台、数据库查询、恢复和账号协作学习指南。
- `AGENTS.md`：agent 在本仓库中的长期协作规则。

## 当前状态

已经完成：

- Astro + React + TypeScript 技术基线；
- 前端团队总枢纽首页；
- 首页内容配置；
- 八张真实 3:4 内容封面已接入首页内容流；
- 本地构建与预览脚本。
- 运营内容新做帖 V0、改帖 V1+、完整编辑、独立排期受保护删除、推广状态筛选与月度台账/月历；
- TMUA、STEP、面试课学科字典、共享帖子分类及学科可用分类映射；
- `THE PLAN` 统一年度总周期规划矩阵、自动总规划、学科细致规划、多时间块、行级文档链接和完整版本历史；
- 总规划与细致规划已统一固定业务列和 1—12 月轨道，支持临界宽度安全横向滚动；
- 年度矩阵已加入季度节奏、整行选中反馈和同尺度 Inspector 年度轨道；
- 年度规划初始化历史已统一归档为 V0，后续真实修改从 V1 开始；
- 年度规划支持自由备注、半月起止和块内付费区间，以深浅显示付费推广与自然流，并可复制到空白年度；未确定内容直接填写“待定”；
- 内容发布控制台的桌面端 Sidebar / Toolbar / Inspector / Sheet、统一推广筛选和移动端底部导航；
- 控制台共享 Sidebar 跨页持久化、按下即反馈、按导航意图预取，以及业务页 `Server-Timing` 性能观测；
- 非推广、待推广、推广测试中、推广放量中、等待行动、推广周期已结束、测试淘汰和放量淘汰八类推广状态；当天复盘选择“等待行动”后，次日以五项零值进入待确认队列且不计入测试或放量天数；
- 分钟级应发/实发时间、自动完成状态与 8 小时延期校验；
- 推广帖 Daily Promotion Review：全宽相对生命周期卡片、T+1 日度复盘、历史事实更正，以及默认 90 天的帖子/日双粒度历史总览；
- Phase 06A 非推广双阶段复盘：按首轮 → 二轮顺序补录点击率和 3 秒阅读率，保留真实数据截止日、同类基准与修订历史；
- Neon PostgreSQL 迁移、服务端校验、Better Auth 用户名登录与管理员／员工权限；
- Vercel 固定 HTTPS 托管，公网和本地共享当前业务分支。

当前进行：

- 审核“内容穿越总控台”新版首页；
- 根据真实封面的色彩与文字密度检查遮罩和可读性；
- 检查桌面端、移动端和减少动态效果模式的滚动观感。
- 验收内容发布控制台在真实大数据量下的桌面端与移动端密度。
- 使用 development 真实数据验收 Phase 06A 指标口径和同类基准。

尚未建设：

- 细粒度权限和完整操作者审计；
- 排期删除、通用上传导入和导出；
- 自动采集和报告生成；


## 当前边界

- 当前使用数据库会话和两种角色控制业务访问；现有版本记录用户名，完整操作者审计仍需后续确认。
- 总规划是细致规划的派生视图；`operations_annual_plan` 的长期职责是保存可编辑细致规划，不应维护第二份可编辑总规划事实。
- 旧总规划由受控迁移清理；没有帖子来源的 G5 不建立细致规划或占位汇总。
- 当前公网与本地共用一个明确选定的 Neon 分支；复制出的测试分支互不自动同步，代码部署与数据库迁移仍是独立操作。
- 首页不展示实时数据、项目明细或个人绩效薪资。
- 业务系统入口已连接包含 THE PLAN 和排期管理的内容发布控制台；组织与人员、绩效与报酬仍只保留入口概念。
- 公网已纳入 Vercel 手动发布流程；部署前完成检查，写入测试使用隔离虚构数据库。
