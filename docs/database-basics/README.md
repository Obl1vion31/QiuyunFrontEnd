# Neon 工作台与项目数据库学习指南

本文面向需要维护本项目、但还不熟悉 PostgreSQL 和 Neon 的协作者。目标不是覆盖所有数据库理论，而是说明 Neon 工作台各区域解决什么问题、什么时候使用，以及如何安全地查看和调试当前项目。

> 最后核对：2026-07-25。Neon 控制台会持续更新；界面名称变化时，以文末官方文档为准。

## 一、先建立整体概念

Neon 是托管 PostgreSQL。可以把常见概念理解为：

```text
Neon 账号
└─ Organization / 个人空间
   └─ Project
      ├─ Branch：彼此隔离的一套数据库状态
      │  ├─ Database：实际数据库
      │  ├─ Role：连接数据库使用的身份
      │  └─ Compute：运行查询的计算资源
      └─ Project settings：协作者、恢复窗口、网络等项目设置
```

- **Project**：一个完整数据库项目的管理边界。
- **Branch**：类似 Git 分支，但复制的是数据库结构和数据。开发、测试和生产应使用不同分支。
- **Database**：PostgreSQL 中真正保存表、视图和数据的数据库。
- **Role**：PostgreSQL 登录身份及其数据库权限，不等同于 Neon 网站账号。
- **Compute**：负责执行 SQL 的计算资源；空闲时可能暂停，首次连接会有冷启动。
- **Connection string**：应用连接数据库所需的地址、数据库名、Role 和密码组合。本项目保存在未提交的 `.env` 中。

本项目必须确认 `.env` 的 `DATABASE_URL` 指向隔离开发分支，不能误连生产分支。

## 二、工作台主要区域

### 1. Overview / Project Dashboard

用于快速确认当前项目状态：

- 当前选择的 Project、Branch、Database 和 Compute；
- 连接信息与连接字符串；
- Compute 是否活跃；
- CPU、RAM、存储等摘要；
- 最近的项目活动或快速入口。

进入其他模块前，先确认顶部或连接面板选中的是正确分支。多数误操作不是 SQL 写错，而是对着错误分支执行了正确 SQL。

### 2. Branches

用于管理数据库分支：

- 从现有分支或历史时间点创建隔离副本；
- 为开发、测试、迁移预演建立临时环境；
- 比较分支 Schema；
- 查看每个分支关联的 Compute、Database 和 Role；
- 删除不再需要的临时分支。

推荐工作方式：

1. 正式数据所在分支不直接试验迁移。
2. 从目标分支创建开发或临时分支。
3. 在临时分支运行迁移和查询。
4. 验证完成后才把同一迁移用于正式目标。

数据库分支不是 Git 代码分支。切换 Git 分支不会自动切换 Neon 分支，必须同时检查 `.env`。

### 3. Monitoring

用于观察数据库和 Compute 是否健康，常见指标包括：

- CPU、RAM；
- 数据库大小、写入行数；
- 当前连接数；
- Buffer cache hit rate；
- Deadlocks；
- 使用连接池时的 Pooler client/server connections；
- 部分项目可能提供 Active Queries 和 Query History。

排查顺序建议：

1. 页面突然变慢：先看 CPU、RAM、连接数和活跃查询。
2. 偶发首次请求慢：确认是否为 Compute 从暂停状态冷启动。
3. 连接错误：检查 Compute 状态、连接数、分支和 Role。
4. 查询长期变慢：结合 Query History、索引和 `EXPLAIN` 分析，不只看 CPU。

Monitoring 主要负责“发现异常”，具体是哪条数据或 SQL 有问题，仍要进入 SQL Editor。

### 4. SQL Editor

这是本项目最常用的调试入口。适合：

- 执行只读 `SELECT`；
- 查看表结构、约束和索引；
- 核对迁移结果；
- 聚合统计和排查异常记录；
- 在恢复前使用 Time Travel 查询历史状态。

常用只读命令：

```sql
-- 当前数据库中的表
\dt

-- 查看表结构
\d operations_content_version

-- 查看少量数据
SELECT *
FROM operations_content_version
LIMIT 20;
```

安全习惯：

- 默认先写 `SELECT`，确认目标记录后再考虑 `UPDATE`。
- `UPDATE`、`DELETE` 必须先用相同 `WHERE` 执行一次 `SELECT`。
- 不运行没有 `WHERE` 的 `UPDATE` 或 `DELETE`。
- 修改结构使用仓库中的 Drizzle migration，不在工作台临时改表后就结束。
- 大范围写入前先创建分支或快照。

### 5. Tables / Database Studio

Tables 提供类似电子表格的界面，适合：

- 浏览 Schema、表、列和关系；
- 过滤、排序和查看少量记录；
- 快速确认字段是否为空；
- 导出查询或表数据。

它也允许直接修改或删除记录，因此不能把“看起来像表格”理解为无风险。当前项目不建议直接在 Tables 中维护分类字典或批量业务数据，因为代码、校验和数据库迁移需要同步。

### 6. Backup & Restore

Neon 的恢复能力主要包括：

- 在项目恢复窗口内执行 Point-in-Time Restore；
- 使用 Time Travel / Preview data 查询某个历史时间点；
- 使用 Snapshot 保存一个明确的恢复点；
- 恢复到当前分支，或先建立新分支验证后再决定。

推荐恢复流程：

1. 记录问题发生的大致时间，停止继续写入错误数据。
2. 使用 Preview data 或 Time Travel 执行只读查询，找到正确时间点。
3. 优先恢复到新分支并核对表、数量和关键业务记录。
4. 确认恢复内容正确后，再决定是否替换原分支。
5. 恢复完成后重新验证应用连接与迁移状态。

恢复会改变数据库状态，不应只凭“时间大概对”就直接覆盖当前分支。Snapshot 数量、自动计划和保留期可能受 Neon 套餐影响。

### 7. Data Masking

Data Masking 用于把包含隐私或敏感信息的数据库副本变成可安全用于开发、演示或外部协作的数据。

典型流程：

1. 从真实数据分支创建隔离分支。
2. 在隔离分支定义需要脱敏的列和规则。
3. 执行静态脱敏，使真实值被不可逆地替换。
4. 核对脱敏结果。
5. 后续开发分支从已脱敏分支派生。

注意：

- 静态脱敏会真正改写目标分支数据。
- 绝不在唯一的正式数据分支上试验。
- 本项目目前禁止写入真实员工隐私数据，也尚未建设需要 Data Masking 的正式敏感数据功能。
- 控制台是否开放该功能及具体限制可能取决于套餐和当前产品状态。

### 8. Data API

Data API 是让前端或外部客户端通过 HTTP 访问 PostgreSQL 数据的能力，通常需要配合：

- Neon Auth 或其他身份认证；
- PostgreSQL Role 与 `GRANT`；
- Row-Level Security（RLS）；
- 每张表明确的读写策略。

它不是“打开后自动安全”。如果没有正确配置 RLS 和权限，可能暴露不应公开的数据。

当前项目通过 Astro 服务端接口连接 PostgreSQL，没有启用 Data API。不要因为控制台提供入口就直接打开；启用前必须单独确认公开数据、用户身份、权限边界和 RLS。

### 9. Auth

Neon Auth 用于建设应用自身的用户注册、登录、Session、组织和权限。它与以下两类身份不同：

- **Neon Console 账号**：登录 Neon 工作台、管理项目；
- **PostgreSQL Role**：应用或工具连接数据库；
- **本项目临时 HTTP Basic Auth**：访问排期网页时浏览器弹出的共享账号密码。

本项目目前没有启用 Neon Auth，也没有正式多人权限。排期页面支持 `.env` 中配置多套临时 Basic Auth 凭据，但所有账号权限相同，也不记录操作者。

## 三、本项目最常用的查询

### 1. 查看学科与可用分类

```sql
SELECT
  subject.name AS "学科",
  COALESCE(category.name, '暂未配置分类') AS "帖子分类"
FROM operations_subject AS subject
LEFT JOIN operations_subject_category AS mapping
  ON mapping.subject_id = subject.id
LEFT JOIN operations_category AS category
  ON category.id = mapping.category_id
ORDER BY subject.sort_order, category.sort_order;
```

预期结果：

- TMUA：12 个分类；
- STEP：11 个分类，不包含“冲刺班”；
- 面试课：暂未配置分类。

### 2. 查看某学科的实际内容、分类和推广状态

```sql
SELECT
  subject.name AS "学科",
  version.content_name AS "内容名称",
  category.name AS "帖子分类",
  schedule.promotion_status AS "推广状态",
  schedule.planned_publish_at AT TIME ZONE 'Asia/Shanghai' AS "应发时间"
FROM operations_content_version AS version
JOIN operations_subject AS subject
  ON subject.id = version.subject_id
LEFT JOIN operations_category AS category
  ON category.id = version.category_id
JOIN operations_content_schedule AS schedule
  ON schedule.content_version_id = version.id
WHERE subject.id = 'tmua'
ORDER BY schedule.planned_publish_at DESC;
```

把最后的 `tmua` 改成 `step` 或 `interview`，可以查看其他学科。

### 3. 只看推广内容

```sql
SELECT
  subject.name AS "学科",
  version.content_name AS "内容名称",
  category.name AS "帖子分类",
  CASE schedule.promotion_status
    WHEN 'pending' THEN '待推广'
    WHEN 'testing' THEN '推广测试中'
    WHEN 'scaling' THEN '推广放量中'
    WHEN 'ended' THEN '推广周期已结束'
    WHEN 'test_discarded' THEN '测试淘汰'
    WHEN 'formal_discarded' THEN '放量淘汰'
    ELSE schedule.promotion_status
  END AS "推广状态"
FROM operations_content_version AS version
JOIN operations_subject AS subject
  ON subject.id = version.subject_id
LEFT JOIN operations_category AS category
  ON category.id = version.category_id
JOIN operations_content_schedule AS schedule
  ON schedule.content_version_id = version.id
WHERE schedule.promotion_status <> 'none'
ORDER BY schedule.planned_publish_at DESC;
```

### 4. 核对分类完整性

```sql
SELECT
  version.content_name,
  version.subject_id,
  version.category_id
FROM operations_content_version AS version
WHERE version.subject_id IS NULL
   OR (version.subject_id IN ('tmua', 'step') AND version.category_id IS NULL)
   OR (version.subject_id = 'interview' AND version.category_id IS NOT NULL)
   OR (
     version.category_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM operations_subject_category AS mapping
       WHERE mapping.subject_id = version.subject_id
         AND mapping.category_id = version.category_id
     )
   );
```

正常情况下应返回 0 行。

## 四、账号、密码与同事协作

### Neon 工作台

不要把自己的 Neon 登录密码或数据库连接串发给同事。需要共同管理 Neon 时：

1. 同事注册自己的 Neon 账号。
2. 在 Project Settings 的 Collaborators 中按邮箱邀请。
3. 同事用自己的账号进入共享项目。

Project Collaborator 可以访问共享项目的大部分管理能力；按 Neon 当前说明，主要例外是不能删除项目。邀请前仍应确认该项目是否包含不适合对方访问的数据。

### 当前排期网页

排期网页的 Basic Auth 与 Neon 工作台账号无关。当前推荐配置：

```text
OPERATIONS_BASIC_AUTH_USERS='{"owner":"独立密码","colleague":"另一套独立密码"}'
```

JSON key 是用户名，value 是该用户的密码。所有账号权限相同；删除某个条目并重启服务即可撤销该账号。真实密码只保存在 `.env` 或部署环境变量中。

旧版 `OPERATIONS_ADMIN_USER` 和 `OPERATIONS_ADMIN_PASSWORD` 仍可在未配置新变量时继续使用。只要配置了新变量，系统就以多账号 JSON 为准；JSON 格式错误时全部拒绝访问，不会回退旧密码。中期仍应升级为正式登录以支持修改密码、找回密码和操作者审计。

### PostgreSQL 连接

如果同事需要使用数据库客户端，而不是 Neon 工作台，可以创建独立 PostgreSQL Role，并按需要授予权限。不要多人共享 `.env` 中同一个数据库密码。数据库写权限应按最小权限原则配置；当前项目尚未设计正式的多人数据库 Role。

## 五、本项目推荐调试流程

### 只读检查

1. 在 Overview 确认项目、Branch、Database。
2. 在 Tables 了解有哪些表，不修改。
3. 在 SQL Editor 执行带 `LIMIT` 的 `SELECT`。
4. 用聚合查询核对数量和分类。
5. 必要时查看 Monitoring 判断是否为性能或连接问题。

### 修改数据库结构

1. 在仓库修改 `src/db/schema.ts`。
2. 创建并检查 `drizzle/*.sql` migration。
3. 执行 `pnpm db:check`。
4. 确认 `.env` 指向隔离开发分支。
5. 执行 `pnpm db:migrate`。
6. 使用 SQL Editor 只读核对迁移结果。
7. 执行 `pnpm check` 和 `pnpm build`。

### 误操作恢复

1. 停止继续写入。
2. 记录问题时间和受影响表。
3. 使用 Backup & Restore 的 Preview data / Time Travel 定位恢复点。
4. 优先恢复到新分支核对。
5. 得到确认后才替换或恢复原分支。

## 六、安全底线

- 不提交 `.env`、连接串、密码、Token 或 API Key。
- 不在聊天、Issue、PR 或截图中暴露连接字符串。
- 不在唯一正式分支运行未经验证的迁移。
- 不在 Tables 页面随手删除、改名或批量覆盖数据。
- 不在没有 RLS 的情况下启用面向客户端的 Data API。
- 不把 Neon Auth、Neon Console 登录、PostgreSQL Role 和应用 Basic Auth 混为一件事。
- 不把备份存在等同于恢复一定成功；重要恢复流程需要演练。

## 七、官方资料

- [Manage projects](https://neon.com/docs/manage/projects)
- [Manage data and schemas in Tables / Database Studio](https://neon.com/docs/guides/tables)
- [Manage organizations and collaborators](https://neon.com/docs/manage/orgs-manage)
- [Backup & Restore、Snapshots 更新说明](https://neon.com/docs/changelog/2025-10-31)
- [Point-in-Time Restore 与 Time Travel Assist](https://neon.com/blog/announcing-point-in-time-restore)
- [Monitoring Dashboard 指标说明](https://neon.com/docs/changelog/2024-04-19)
- [SQL Editor 导出与自定义监控时间段](https://neon.com/docs/changelog/2024-05-10)
- [Data API 权限与 RLS 提示](https://neon.com/docs/changelog/2025-09-19)
- [Neon Auth 的分支化身份模型](https://neon.com/docs/changelog/2025-12-12)
- [Data Masking 的隔离分支工作流](https://neon.com/blog/environments-masked-production-data)

