# 前端团队管理系统

这是一个面向前端业务工作的轻量网站。当前包含静态总枢纽首页，以及受临时多账号凭据保护的年度内容总周期规划和内容发布排期。

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

业务页面：

- `/business/annual-plan`：`THE PLAN` 年度内容总周期规划；
- `/business/operations-schedule`：具体内容与发布排期。

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
- 首页会公开给持有链接的人；排期页仍使用 `.env` 中的 HTTP Basic Auth。共享前必须确认账号密码强度，不要发送数据库连接串或 `.env`。
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

### 日常新做帖、改帖和编辑排期

启动网站后直接在排期页面新增或编辑：

```bash
pnpm dev
```

“新做帖”会创建 V0；“改帖”从原版本派生 V1/V2 并保留来源；“编辑排期”只更正当前记录。保存成功后只需刷新或继续操作，不需要执行以下命令：

```text
pnpm db:migrate
pnpm build
```

学科与帖子分类分别使用固定字典，并通过映射决定各学科可用的分类。面试课使用面试课、推广讲义帖、成功案例、喜报、面试信息、面试准备须知和创新帖七类；旧面试课内容可保留空分类，新建或编辑时必须选择。创建改帖只需填写一项“具体改动说明”。

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
| 在网页新增或编辑排期              | 不需要数据库命令，保存后立即生效                                           |
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
│   ├── database-basics/README.md # Neon 工作台与数据库调试学习指南
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

## 排期 MVP

复制 `.env.example` 为 `.env`，填写 Neon 开发分支连接串和 `OPERATIONS_BASIC_AUTH_USERS` 多账号访问凭据，然后执行 `pnpm db:migrate`。访问 `/business/operations-schedule` 时浏览器会要求输入其中任意一组账号密码；各账号权限相同。旧版 `OPERATIONS_ADMIN_USER` / `OPERATIONS_ADMIN_PASSWORD` 仍可作为单账号兼容配置。生产环境必须使用 HTTPS；真实 `.env` 不得提交。

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
- `docs/database-basics/README.md`：Neon 工作台、数据库查询、恢复和账号协作学习指南。
- `AGENTS.md`：agent 在本仓库中的长期协作规则。

## 当前状态

已经完成：

- Astro + React + TypeScript 技术基线；
- 前端团队总枢纽首页；
- 首页内容配置；
- 八张真实 3:4 内容封面已接入首页内容流；
- 本地构建与预览脚本。
- 运营内容新做帖 V0、改帖 V1+、完整编辑、推广状态筛选与月度台账/月历；
- TMUA、STEP、面试课学科字典、共享帖子分类及学科可用分类映射；
- `THE PLAN` 统一年度总周期规划矩阵、分区规划行、多时间块、行级文档链接和完整版本历史；
- 内容发布控制台的桌面端 Sidebar / Toolbar / Inspector / Sheet、统一推广筛选和移动端底部导航；
- 非推广、待推广、推广测试中、推广放量中、推广周期已结束、测试淘汰和放量淘汰七类推广状态；
- 分钟级应发/实发时间、自动完成状态与 12 小时延期校验；
- Neon PostgreSQL 迁移、服务端校验与临时多账号 HTTP Basic Auth。

当前进行：

- 审核“内容穿越总控台”新版首页；
- 根据真实封面的色彩与文字密度检查遮罩和可读性；
- 检查桌面端、移动端和减少动态效果模式的滚动观感。
- 验收内容发布控制台在真实大数据量下的桌面端与移动端密度。

尚未建设：

- 正式登录、多人权限与操作者审计；
- 排期删除、通用上传导入和导出；
- 自动采集和报告生成；
- 生产部署流程。

## 当前边界

- 当前总周期规划和排期使用数据库与临时多账号 Basic Auth，没有正式后台或细粒度权限；规划版本只记录凭据用户名，不是完整操作者审计。
- 首页不展示实时数据、项目明细或个人绩效薪资。
- 业务系统入口已连接排期 MVP；组织与人员、绩效与报酬仍只保留入口概念。
- 当前只做本地验收，不包含生产部署配置。
