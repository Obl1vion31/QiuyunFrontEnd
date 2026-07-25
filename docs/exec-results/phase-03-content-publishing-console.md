# Phase 03：内容发布控制台实施结果与学习路线

本文记录 Phase 03 已落地的内容发布控制台、帖子版本化、Excel 历史排期替换，以及后续学习和小范围修改的入口。它是 `docs/exec-plans/phase-03-content-publishing-console.md` 的实施结果，不替代 `DECISIONS.md` 中的长期结论。

## 一、当前实施结果

- 数据结构已拆分为帖子身份、内容版本和发布排期三层。
- 新做帖创建 V0；改帖从来源版本派生 V1/V2，并保留版本链。
- 编辑排期只更正当前版本资料、时间和状态，不增加版本号。
- 内容发布控制台使用桌面端 `Sidebar + Toolbar + Inspector + Sheet`，移动端使用底部导航。
- 排期管理支持按日期分组台账、月历、推广筛选、完成状态、详情检查和版本链查看。
- 完成情况根据应发与实发时间自动归一化，严格超过 12 小时为延期。
- `20260725 运营内容导入.xlsx` 中 2026 年 4–6 月共 53 条记录已导入 Neon 开发数据库；数据库原有 7 月排期已清理。

当前数据库快照：

| 项目 | 数量 |
| --- | ---: |
| 2026 年 4 月 | 9 |
| 2026 年 5 月 | 13 |
| 2026 年 6 月 | 31 |
| 2026 年 7 月 | 0 |
| 按时发布 | 41 |
| 延期发布 | 12 |
| 非推广 | 44 |
| 推广周期已结束 | 3 |
| 测试淘汰 | 6 |
| 放量淘汰 | 0 |

53 条记录均为独立 V0，均具有项目文档名称和链接；完成状态与应发/实发时间的自动计算结果一致，数据库中没有孤儿帖子或孤儿版本。

## 二、推广状态的准确含义

推广状态定义在 `src/db/validation.ts`：

| 数据库值 | 中文显示 | 含义 |
| --- | --- | --- |
| `none` | 非推广 | 内容不进入付费推广流程 |
| `pending` | 待推广 | 已确定进入推广流程，尚未开始测试 |
| `testing` | 推广测试中 | 正在进行付费测试 |
| `scaling` | 推广放量中 | 测试后进入放量 |
| `ended` | 推广周期已结束 | 未被淘汰，推广生命周期自然结束 |
| `test_discarded` | 测试淘汰 | 测试后发现不适合继续投入 |
| `formal_discarded` | 放量淘汰 | 进入放量后停止投入 |

数据库没有单独的 `is_promoted` 或“是否推广”字段，`promotion_status` 同时表达“是否推广”和“推广阶段”：

```text
none                         → 非推广
pending/testing/scaling/ended/
test_discarded/formal_discarded → 推广帖所处阶段
```

因此，“推广周期已结束”在产品语义上是推广生命周期自然结束，并且明确表示没有被淘汰；它不是发布完成。发布是否完成由另一列 `completion_status` 表达。

本次 Excel 导入脚本有明确保护：只有 Excel 标记为“推广帖”的记录才能进入推广状态，标记为“非推广帖”的记录一律写入 `none`。Excel 的“推广已结束”映射为 `ended`；“推广已下架”默认映射为 `test_discarded`，但名称包含“讲义帖”的已下架记录按已确认例外映射为 `ended`。当前数据库为 3 条推广周期已结束、6 条测试淘汰、0 条放量淘汰。

需要注意：新做帖和编辑接口目前只用 Zod 检查状态是否属于上述七个枚举，数据库列也是普通 `text`，没有独立的“推广帖”布尔字段或数据库 `CHECK` 约束。因此，网页上如果人为给一条原本非推广的内容选择推广周期已结束或淘汰状态，系统会把它视为推广帖。若以后需要更强约束，应先确认是否增加独立的推广属性，或由状态转换规则限制可选项。

改帖还有一条自动结案规则，位于 `src/pages/api/operations-content/versions/[sourceVersionId]/revisions.ts`：

- 来源为 `testing`，创建改帖后来源变为 `test_discarded`；
- 来源为 `scaling`，创建改帖后来源变为 `formal_discarded`；
- 新版本统一从 `pending` 开始；
- 来源为其他状态时保持不变。

## 三、本阶段新增或更新的文件

### 1. 页面与交互

- `src/pages/business/operations-schedule.astro`
  - 动态读取排期；
  - 计算月份、发布与推广汇总；
  - 渲染 Sidebar、Toolbar、时间轴台账、月历、Inspector 和 Sheet；
  - 管理新做帖、编辑排期和改帖表单交互；
  - 包含当前控制台的主要响应式样式。

### 2. 写入接口

- `src/pages/api/operations-content.ts`
  - 新做帖：在事务中创建帖子、V0 和首次排期。
- `src/pages/api/operations-content/[id].ts`
  - 编辑排期：修改当前版本资料和排期，不增加版本号。
- `src/pages/api/operations-content/versions/[sourceVersionId]/revisions.ts`
  - 创建改帖：派生下一版本，保存改动信息，并按规则结案来源推广状态。

### 3. 数据库与业务规则

- `src/db/schema.ts`
  - 定义 `operations_content`、`operations_content_version` 和 `operations_content_schedule`。
- `src/db/validation.ts`
  - 定义推广状态、表单校验、上海时区解析、12 小时延期规则和完成状态自动计算。
- `src/db/client.ts`
  - 服务端惰性连接 Neon PostgreSQL。
- `drizzle/0005_content_versions.sql`
  - 将旧排期结构迁移为帖子、版本和排期三层。
- `drizzle/0006_split_discarded_promotion_statuses.sql`
  - 将旧通用淘汰状态拆分，并纠正固定 Excel 导入记录的推广周期已结束与测试淘汰。
- `drizzle/0000` 至 `0004`
  - 保存 Phase 02 建表以及早期时间、推广状态和历史数据修正规则；已执行的迁移不应直接修改。
- `drizzle.config.ts`
  - Drizzle schema、迁移目录和数据库连接配置。

### 4. 历史数据导入

- `scripts/import-operations-content.mjs`
  - 读取 `20260725 运营内容导入.xlsx`；
  - 只接受 2026 年 4–6 月共 53 条记录；
  - 排除表内残留的 1 条 7 月记录；
  - 根据应发/实发时间计算完成状态；
  - 只有“推广帖”才能进入推广状态；
  - `--apply` 时在同一事务中清理数据库 7 月排期并导入 4–6 月记录。
- `scripts/README.md`、`public/excel/README.md`
  - 记录脚本边界、源文件位置和安全操作方式。

### 5. 访问、运行与项目说明

- `src/middleware.ts`
  - 使用临时 HTTP Basic Auth 保护排期页和写入接口。
- `astro.config.mjs`
  - 使用 Astro Node adapter 支持动态页面与接口。
- `.env.example`
  - 记录数据库连接和共享访问凭据所需变量名，不保存真实值。
- `package.json`
  - 提供开发、构建、Drizzle 检查、迁移和 Excel 导入命令。
- `README.md`
  - 记录数据库日常操作、导入流程和当前状态。
- `docs/DECISIONS.md`
  - 保存已确认的产品、版本、推广、完成状态和技术结论。
- `docs/DESIGN.md`
  - 保存内容发布控制台已确认的视觉与交互规则。
- `docs/ROADMAP.md`
  - 记录已完成的数据替换和后续复盘、报表等方向。
- `docs/STRUCTURE.md`、`src/README.md`、`src/db/README.md`
  - 提供系统结构和源码入口说明。

## 四、推荐学习路线

### 第 1 步：先理解用户看到的控制台

阅读：

1. `docs/exec-plans/phase-03-content-publishing-console.md`
2. `docs/DECISIONS.md`
3. `docs/DESIGN.md`
4. `src/pages/business/operations-schedule.astro`

目标：先理解新做帖、编辑排期、改帖、推广筛选、台账、月历和 Inspector/Sheet 的用户行为，不要一开始就进入 SQL。

### 第 2 步：沿着一次写入请求向下读

```text
页面表单
  ↓
FormData
  ↓
validation.ts 校验和自动计算
  ↓
API Route 开启事务
  ↓
Drizzle 写入帖子、版本、排期
  ↓
页面刷新并重新读取
```

按顺序阅读：

1. `src/pages/api/operations-content.ts`
2. `src/db/validation.ts`
3. `src/db/schema.ts`
4. `src/db/client.ts`

目标：理解为什么完成情况不能由用户直接选择，以及一次新做帖为什么会产生三层记录。

### 第 3 步：学习版本链和改帖

阅读：

1. `src/pages/api/operations-content/versions/[sourceVersionId]/revisions.ts`
2. `src/pages/api/operations-content/[id].ts`
3. `drizzle/0005_content_versions.sql`

重点对比：

- 编辑排期：更新原记录，不增加版本；
- 创建改帖：新建下一版本和新排期，保留来源版本；
- 改帖时来源推广状态如何自动结案。

### 第 4 步：学习历史 Excel 如何进入数据库

阅读：

1. `scripts/README.md`
2. `scripts/import-operations-content.mjs`
3. `public/excel/README.md`

建议先运行只读预检：

```bash
pnpm db:import
```

不要为了查看数据运行 `--apply`。`--apply` 会连接数据库，并包含删除 7 月数据的受控操作。

### 第 5 步：理解数据库结构和迁移

阅读：

1. `src/db/schema.ts`
2. `drizzle/README.md`
3. `drizzle/0005_content_versions.sql`
4. `drizzle.config.ts`

然后运行：

```bash
pnpm db:check
```

目标：区分 schema、迁移和业务数据。迁移更新数据库结构；网页新增、编辑和导入更新业务数据。

### 第 6 步：最后理解运行和安全边界

阅读：

1. `src/middleware.ts`
2. `.env.example`
3. `astro.config.mjs`
4. `README.md`

目标：理解 Basic Auth、服务端环境变量、动态 Astro 页面和 Neon 连接为什么不能进入客户端代码。

## 五、常见小改动从哪里开始

| 想修改的内容 | 首要入口 | 同步检查 |
| --- | --- | --- |
| 调整控制台布局、文案或密度 | `operations-schedule.astro` | 桌面、移动端、键盘操作 |
| 修改推广状态名称或颜色 | `validation.ts`、页面 `promotionLabels` | API、筛选、Inspector、CSS、历史数据 |
| 限制推广状态转换 | `validation.ts` 和三个写入 API | 页面可选项、导入脚本、数据库旧值 |
| 修改 12 小时延期规则 | `validation.ts` | 导入脚本、页面逾期显示、文档 |
| 增加排期字段 | 页面表单 | validation、API、schema、新迁移、导入 |
| 修改新做帖逻辑 | `operations-content.ts` | 三表事务、完成状态 |
| 修改编辑逻辑 | `[id].ts` | 不得意外增加版本 |
| 修改改帖逻辑 | `revisions.ts` | 版本号并发、来源结案、新版本状态 |
| 修改 Excel 映射 | `import-operations-content.mjs` | 文件名、表头、预期数量、幂等键 |
| 修改数据库结构 | `schema.ts` | 生成新迁移；不要改已执行迁移 |
| 修改共享访问保护 | `middleware.ts` | 页面和所有写入 API、HTTPS |

## 六、验证路线

普通代码或文档修改：

```bash
pnpm check
pnpm build
```

数据库 schema 修改：

```bash
pnpm db:generate
pnpm db:check
```

确认新迁移和目标开发分支后，才执行：

```bash
pnpm db:migrate
```

Excel 修改：

```bash
pnpm db:import
```

默认命令只读预检。只有明确需要重新执行受控数据替换、并确认连接隔离开发库时，才使用 `pnpm db:import -- --apply`。

浏览器至少复核：

- 新做帖只产生 V0；
- 编辑排期不增加版本；
- 改帖产生下一版本并保留来源；
- 推广测试中来源改帖后变为测试淘汰；
- 推广放量中来源改帖后变为放量淘汰；
- 完成状态按时间自动计算；
- 严格超过 12 小时必须填写延期原因；
- 台账、月历、筛选和 Inspector 显示一致；
- 窄屏布局和未保存提醒可用。

## 七、当前未做与风险

- 没有正式登录、多人权限或操作者审计。
- 没有排期删除、通用导入、导出或自动同步。
- 没有自动采集小红书数据或自动生成报告。
- 推广状态主要依赖应用层枚举，数据库没有 `CHECK` 约束。
- 当前没有独立“是否推广”字段；状态值本身承担这层含义。
- 页面目前一次读取全部排期，数据规模继续增长后需要评估数据库分页和聚合。
- 历史导入脚本针对固定文件和固定数量，不是通用 Excel 上传能力。

## 八、本阶段验证记录

- `pnpm db:import`：4–6 月 53 条只读预检通过，排除 1 条 7 月记录。
- `pnpm db:check`：schema 与迁移检查通过。
- `pnpm check`：0 errors、0 warnings、0 hints。
- 数据库独立查询：4 月 9 条、5 月 13 条、6 月 31 条、7 月 0 条。
- 53 条完成状态均与 12 小时规则一致。
- 推广状态为推广周期已结束 3 条、测试淘汰 6 条、放量淘汰 0 条。
- 53 条均为 V0 且项目文档完整，没有孤儿帖子或孤儿版本。
