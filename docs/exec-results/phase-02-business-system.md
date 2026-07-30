# Phase 02：运营内容排期 MVP 实施结果

## 已完成

- Astro hybrid + standalone Node adapter，首页继续静态生成。
- 排期表、四个索引、Drizzle 迁移、惰性数据库连接与 Zod 校验。
- 受共享 HTTP Basic Auth 保护的排期页和写入接口。
- 新增表单、月份/推广/阶段/完成情况筛选、固定口径月度汇总、响应式台账和明确错误状态。
- 首页业务入口和项目核心文档同步。

## 未包含

- 编辑、删除、批量导入、导出、正式多人权限、操作者审计、部署和自动同步。

## 验证状态

- 已完成类型检查、静态构建和迁移一致性检查。
- 已使用临时本地配置验证：未认证请求返回 401、认证页面可进入、跨站写入返回 403、非法浏览器表单返回 422、数据库不可用时页面显示明确提示。
- 客户端构建产物未发现临时数据库连接串或共享密码。

## 当前现场（2026-07-15）

- 项目根目录 `.env` 已存在，但检查确认 `DATABASE_URL` 的用户名、密码、主机名和数据库名仍是 `.env.example` 中的占位值；未读取或记录任何真实凭据。
- 当前连接失败的直接原因是数据库驱动尝试解析占位主机 `host`，返回 `EAI_AGAIN`，并非页面筛选逻辑导致。
- 用户认证后仍看到“数据库暂时不可用”，说明 HTTP Basic Auth 已通过，但数据库连接是另一条尚未打通的链路。
- 查询失败时页面会以空数组渲染，因此所有筛选结果均为空；这不是已经证明数据库无记录。
- 当前尚未确认 Neon 开发分支迁移成功，也尚未完成真实新增、刷新持久化、统计变化和测试数据清理。
- 本阶段没有导入或生成业务数据，符合“不编造业务数据”和“只有新增、查看”的确认边界。

## 待完成

1. 验证 `.env` 中 `DATABASE_URL` 的连接可用性，并确认当前启动进程加载了最新环境变量。
2. 成功执行 `pnpm db:migrate`，确认 `operations_content_schedule` 表已创建。
3. 重新构建并启动服务，验证数据库错误提示消失。
4. 从页面手动新增一条临时排期，验证刷新、汇总及四类筛选。
5. 从开发库清理临时记录，并记录最终验证结果。

## 如何学习这次实现

### 先建立完整请求链路

```text
浏览器打开排期页
    ↓
src/middleware.ts 检查共享账号密码
    ↓ 认证通过
src/pages/business/operations-schedule.astro
    ├─ GET：读取数据库 → 计算汇总与筛选 → 输出 HTML
    └─ 表单提交 POST /api/operations-content
                         ↓
       src/pages/api/operations-content.ts
          ├─ 检查请求来源
          ├─ 解析 FormData
          ├─ 使用 Zod 校验
          └─ 使用 Drizzle 写入 Neon PostgreSQL
```

建议按以下顺序阅读，先看用户操作，再进入服务端和数据库：

1. `src/pages/business/operations-schedule.astro`
2. `src/pages/api/operations-content.ts`
3. `src/db/validation.ts`
4. `src/db/schema.ts`
5. `src/db/client.ts`
6. `src/middleware.ts`
7. `drizzle/0000_chemical_thunderbolt.sql`
8. `astro.config.mjs`、`drizzle.config.ts` 和 `package.json`

### 1. 排期页面如何读取和显示内容

文件：`src/pages/business/operations-schedule.astro`

- `export const prerender = false` 表示该页面不是构建时生成的静态 HTML，而是每次请求时在 Node 服务端运行。
- 页面调用 `getDb().select()` 读取 `operations_content_schedule`，按应发日期升序、创建时间倒序排列。
- URL 查询参数 `month`、`promoted`、`stage`、`completion` 对应四类筛选。
- 月份来自 `planned_publish_date` 的前七位，不在数据库重复保存月份字段。
- 汇总只按选定月份计算；选择“全部月份”时仍展示当前月汇总。推广、阶段和完成情况只改变列表，不改变月度总览口径。
- 数据库查询失败会捕获异常、显示明确提示，并把 `rows` 保持为空数组。因此此时筛选结果为空，不代表数据库已经连接且确实没有记录。
- 页面下半部 `<script>` 拦截表单提交，请求 JSON 错误结果，并把字段错误放回对应输入框。提交失败时不会清空已经输入的内容。

修改页面布局、表单字段、筛选或统计时，首先从这个文件进入。但新增数据库字段不能只改页面，还要同步 schema、校验、接口和迁移。

### 2. 内容如何从表单进入数据库

文件：`src/pages/api/operations-content.ts`

1. 浏览器把表单以 `POST` 发送到 `/api/operations-content`。
2. 接口比较 `Origin` 与当前站点地址，不一致时返回 `403`，避免其他网站代替用户提交。
3. 接口解析 `FormData`；格式错误返回 `400`。
4. 表单字段被整理成与业务模型一致的对象。复选框通过是否等于 `on` 转为布尔值。
5. `scheduleSchema.safeParse()` 执行字段和跨字段校验；失败返回 `422` 及字段错误。
6. 校验通过后，`getDb().insert(...).values(...)` 写入数据库。
7. 数据库失败返回 `503`；普通 HTML 表单成功后以 `303` 跳回列表，增强脚本请求成功时刷新页面。

接口只支持新增，没有 `PUT`、`PATCH` 或 `DELETE`，所以当前不能编辑或删除。

### 3. 输入规则在哪里定义

文件：`src/db/validation.ts`

- `stages` 定义 `pending / testing / promoting / paused / completed`。
- `completionStatuses` 定义 `pending / on_time / delayed / incomplete`。
- 空字符串在写入前统一转换为 `null`。
- 项目文档链接只接受合法的 HTTP/HTTPS 地址。
- 按时完成或延期完成必须填写实发日期。
- 延期完成或未完成必须填写说明。
- 当前阶段为已完成时，完成情况必须是按时完成或延期完成。

修改业务规则时优先修改这里，并同步检查页面下拉选项和数据库字段是否仍然匹配。

### 4. 数据库表在哪里定义

文件：`src/db/schema.ts`

- `operationsContentSchedule` 是 TypeScript 中的表定义，对应 PostgreSQL 表 `operations_content_schedule`。
- 页面字段使用 camelCase，例如 `contentName`；数据库列使用 snake_case，例如 `content_name`。Drizzle 负责二者映射。
- 主键使用 PostgreSQL UUID；`created_at` 和 `updated_at` 保存审计时间。
- 应发日期、当前阶段、完成情况和推广状态建立索引，服务后续筛选。
- 月份和周次不落库，从应发日期推导，避免同一条记录出现日期与月份不一致。

文件：`drizzle/0000_chemical_thunderbolt.sql`

这是由 schema 生成的实际建表 SQL。修改 schema 后应运行：

```bash
pnpm db:generate
pnpm db:check
```

确认新迁移内容后，才对开发数据库执行：

```bash
pnpm db:migrate
```

不要手工修改已经在数据库执行过的历史迁移；后续变更应生成新的迁移文件。

### 5. 网站如何连接 Neon

文件：`src/db/client.ts`

- 只在服务端读取 `DATABASE_URL`，没有 `PUBLIC_` 前缀，因此不会进入浏览器代码。
- 第一次真正查询或写入时才创建 `postgres` 客户端，这叫惰性连接。静态首页构建不要求数据库在线。
- 同一个 Node 进程复用连接池，当前上限为 5 个连接。
- `prepare: false` 避免依赖特定的 PostgreSQL prepared statement 行为。

文件：`.env`（不会提交到 Git）

```env
DATABASE_URL="从 Neon Project Dashboard → Connect 复制的完整连接串"
OPERATIONS_ADMIN_USER="共享访问用户名"
OPERATIONS_ADMIN_PASSWORD="足够长的共享密码"
```

修改 `.env` 后必须停止并重新启动 `pnpm start`，旧进程不会自动重新读取环境变量。

### 6. 用户名和密码如何保护页面

文件：`src/middleware.ts`

- 中间件只保护 `/business/operations-schedule` 和 `/api/operations-content`。
- 浏览器第一次访问时没有 `Authorization` 请求头，服务端返回 `401` 和 `WWW-Authenticate`，浏览器因此显示用户名密码对话框。
- 凭据使用恒定时间比较，降低通过响应时间猜测密码的风险。
- 任一认证变量缺失时默认拒绝访问，这叫失败关闭。
- 首页不经过认证，仍然可以静态访问。

HTTP Basic Auth 只是临时内部保护：它依赖 HTTPS 保证传输安全，所有人共用一个账号，无法记录具体操作者，也不能配置不同权限。

### 7. 为什么首页静态、排期页动态

文件：`astro.config.mjs`

- `output: 'hybrid'` 允许同一个项目同时拥有静态页面和动态服务端路由。
- 首页没有关闭预渲染，因此构建时输出静态 HTML。
- 排期页和 API 设置 `prerender = false`，交给 standalone Node 服务处理。
- `pnpm build` 只生成产物；真正运行动态页面要使用 `pnpm start`，而不是只打开 `dist/client`。

## 常见修改应该从哪里开始

| 需求 | 主要修改入口 | 必须同步检查 |
| --- | --- | --- |
| 修改页面文字或布局 | `operations-schedule.astro` | 移动端、键盘焦点、空状态 |
| 增加表单字段 | 页面表单 | API、validation、schema、迁移、表格 |
| 修改业务校验 | `src/db/validation.ts` | 页面提示、接口返回、测试用例 |
| 修改筛选或汇总口径 | `operations-schedule.astro` | URL 参数、空数据和全部月份状态 |
| 修改表或索引 | `src/db/schema.ts` | 生成新迁移、开发库迁移、旧数据兼容 |
| 修改数据库连接方式 | `src/db/client.ts` | `.env.example`、密钥边界、构建产物 |
| 修改访问保护 | `src/middleware.ts` | 页面和 API 必须同时保护、HTTPS |
| 增加编辑或删除 | 尚无入口 | 需要先确认范围、接口、权限和审计策略 |

## 修改后的最低验证清单

```bash
pnpm check
pnpm db:generate   # 仅在 schema 改动后执行
pnpm db:check
pnpm db:migrate    # 确认连接的是隔离开发库后执行
pnpm build
pnpm start
```

浏览器中至少验证：未认证返回 401、认证后页面可访问、数据库错误提示消失、新增后刷新仍存在、四类筛选和月度汇总同步变化、非法链接/缺少实发日期/缺少延期说明不能写入、窄屏表格和表单可用。

## 安全边界

- 不提交 `.env`，不在文档、聊天、截图或客户端代码中粘贴真实连接串和密码。
- 迁移前确认连接的是 Neon 隔离开发分支，不操作生产数据库。
- 不编造业务数据、员工数据或绩效结果。
- 需要批量导入真实数据时，先确认数据来源、字段映射、隐私处理、去重和回滚方案。
- 新增编辑、删除、权限、审计、外部同步或部署能力前，先检查仓库并制定计划。
