# `drizzle/` 数据库迁移

本目录保存由 `pnpm db:generate` 生成或为受控数据迁移编写、经 `pnpm db:check` 检查的 SQL 迁移。迁移应与 `src/db/schema.ts` 同步提交，但不得写入连接串、密码或真实业务数据。

`0005_content_versions.sql` 将原排期中的内容资料迁移到帖子与版本表，每条历史排期建立独立 V0，并保留排期 ID、状态、时间和导入标识。执行前必须确认 `.env` 指向隔离的 Neon 开发分支。

`0006_split_discarded_promotion_statuses.sql` 将旧通用淘汰状态迁移为测试淘汰，并按固定 Excel 来源行把非讲义帖的“推广已下架”从推广周期已结束纠正为测试淘汰。
