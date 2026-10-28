# 数据库接入与维护

本指南说明当前项目的 PostgreSQL／Neon 操作。数据语义见[数据模型](data-model/DATA-MODEL.md)，发布流程见[部署指南](deployment.md)。

## 先确认连接目标

当前本地与公网共用已选定的 Neon 分支，网页和脚本写入会立即影响两端。不要凭 development／production 名称推断隔离关系；以实际连接目标和已批准操作为准，连接串只保存在私有环境配置中。

Neon 分支在创建后独立演进，网页录入、结构迁移和代码部署是三个不同动作，不会互相自动同步。需要结构试验、批量演练或虚构数据时使用隔离库。

## 新环境接入

1. 使用 Node 22、pnpm 9.15.9 安装依赖。
2. 按 `.env.example` 配置 `DATABASE_URL`、独立的 `BETTER_AUTH_SECRET` 和本机 `BETTER_AUTH_URL`。
3. 新开发环境从已批准的现有 Neon 分支复制；不要将历史迁移当作空库初始化脚本。
4. 核对待执行迁移，再运行 `pnpm db:check`；执行迁移前确认目标和备份。
5. 启动 `pnpm dev`，确认登录、页面读取及授权范围内的写入。

历史 SQL 包含已完成批次的数量断言。共享环境已应用的 migration 不修改，后续变化只追加。

## 账号是什么

- Neon Console 登录：管理托管项目、分支和数据库。
- PostgreSQL Role：连接数据库使用的身份。
- 工作台账号：Better Auth 用户名与数据库会话，分为管理员和员工。

三者互不替代。本项目未使用 Neon Auth；旧 HTTP Basic Auth 不再提供访问权限。创建内部工作台账号使用：

```bash
pnpm account:create
```

管理员可在系统设置新增员工或管理员账号（默认员工），修改登录账号、修改用户名、重置密码、停用／恢复和撤销登录。账号和完整用户名均可登录；去除首尾空格、忽略大小写后共享唯一标识空间，停用账号也保留标识。修改标识保留用户 ID、密码、角色、权限、业务历史和会话；现有角色不在此编辑。重置密码或停用后旧会话失效，密码不能查询明文。

密码由交互终端隐藏读取。重复创建保留原密码和角色；公开注册关闭。不要把密码放入命令行参数或文档。

## 读取与调试

Neon 的表视图适合查看行，SQL 编辑器适合精确查询。常用 PostgreSQL 概念：表保存同类事实，主键标识记录，外键保护关联，唯一约束防重复，事务保证一组写入共同成功或失败。

只读核对示例：

```sql
BEGIN READ ONLY;
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;

SELECT planned_publish_at, actual_publish_at, promotion_status
FROM operations_content_schedule
ORDER BY planned_publish_at DESC
LIMIT 20;
ROLLBACK;
```

笔记 ID 位于 `operations_content`，版本位于 `operations_content_version`，排期位于 `operations_content_schedule`。显示推广状态还需要结合 Campaign 阶段和团队暂停记录；不要把 `waiting_action` 脱离阶段直接解释为同一种业务状态。

时间戳按 `Asia/Shanghai` 展示，数据库连接与驱动可能输出 UTC。日期字段与具体时间戳不是同一种类型；比较前先统一时区。

## 数据更新与结构迁移

网页保存业务数据后立即生效，不需要执行 migrate 或 build。代码新增 SQL migration 才需要结构更新：

```bash
pnpm db:check
pnpm db:backup
pnpm db:migrate
pnpm check
pnpm test
pnpm build
```

构建和 Vercel 发布不会自动迁移数据库。结构变更先隔离验证，并兼容仍在运行的旧应用。Drizzle 迁移日志记录已执行内容，重复运行迁移命令不会重复应用旧 SQL。

登录标识约束迁移前先只读检查空标识和跨用户重名：将 `lower(btrim(name))`、`lower(btrim(username))` 合并，按标识分组，`count(DISTINCT id)>1` 即冲突。发现冲突停止，私下列出待用户确认的身份，不自动改名。备份后运行迁移，再比较身份、凭据及业务表摘要。规范化唯一索引与跨字段触发器共同保护；创建和修改必须先取得同一事务锁 `719301`，再取得操作者行锁，不能调换顺序。新账号内部邮箱按稳定用户 ID 生成，释放旧账号名不会与历史邮箱碰撞。

`pnpm test:accounts` 使用 `TEST_POSTGRES_URL` 指定的隔离 PostgreSQL，实际运行约束迁移和并发创建／修改；测试夹具除 schema 外还安装正式触发器。不要用内存替身或源码断言代替数据库冲突与迁移验证。

## 备份与恢复

`pnpm db:backup` 在只读一致性事务中导出业务与认证表，数值以原始行 JSON 保留，默认保存到私有 `.tools/backups/`。备份包含敏感内容，不提交、不部署、不复制到 `public/`。

恢复使用 `node --import tsx scripts/restore-database.ts .tools/backups/<backup>.json`；提前在独立空库建立匹配结构并通过私有环境提供 `RESTORE_DATABASE_URL`，默认预检，加 `--apply` 才应用。工具验证备份摘要、目标为空及依赖顺序，事务写入后续接序列；演练逐表核对精确行摘要。恢复需要对应版本结构、准确目标和外键顺序，先在隔离库验证。应用回滚不会恢复数据；不要因为表名或分支名称相似就覆盖数据库。涉及分支恢复或整库替换时单独制定并确认方案，不将历史某次上线步骤当作日常操作。

用户明确指定清理测试帖及关联事实时，先按稳定 ID、创建时间及完整版本链确认唯一对象，核对外键与快照引用，保存私有备份；在事务内锁定对象、复核备份后是否发生变化，按依赖顺序删除并核对其他业务事实摘要。此类一次性维护不放宽网页的历史删除保护，也不新增通用级联删除入口。

## 一次性导入

原始文件保持不变，放入私有 `data/imports/`。默认只读预检，明确字段、分类、身份映射、覆盖范围和回滚边界后，使用显式参数事务写入，记录私有前后快照并验证幂等。

同名不等于同帖；优先笔记 ID 和稳定来源键，结合链接、日期及版本关系核对。未知指标不填零；只有业务已明确确认的零投放才能写入零值。脚本完成后移除，批次事实不进入核心文档。

阶段复盘和例会快照追加版本，源事实更正不回写旧快照。逐帖待定区间包含截止日，结束只产生人工下一步提醒；普通操作和管理员历史级联保护共用推广事务锁。例会图片以受限大小的编码数据私有保存于现有库，读取经过认证，不放进 `public/`、Git 或临时文件系统；备份包含图片，按相同私有边界保护。

首次待定保存在独立开始计划中，当日实际阶段覆盖与日度指标分开；任何纠正都须按业务日期回放。时间线审计保存操作前后快照及冲突原始指标，保留兼容事实，从最早缺口重新补录。旧待推广游标只能作为迁移来源，不能推断逐次点击时间。
