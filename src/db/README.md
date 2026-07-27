# `src/db/` 数据库层

- `schema.ts`：帖子、内容版本和 `operations_content_schedule` 排期表、字段与索引。
- `client.ts`：服务端惰性 PostgreSQL 连接；不得被客户端脚本导入。
- `validation.ts`：新增与编辑共用的枚举、上海时区时间解析和 12 小时延期规则。
- `annual-plan.ts`：年度分区规划行、时间块、行级链接、快照和差异校验。
- `annual-plan-rules.mjs`：时间块重叠判断、数量规则展示和自动总规划汇总，可由 Node 测试直接复用。

迁移由根目录 `drizzle.config.ts` 和 `drizzle/` 管理。新做帖建立 V0，改帖从来源版本派生 V1/V2；排期关联具体内容版本。总周期规划独立保存年度说明、规划行、多时间块和不可变版本快照，不自动生成排期。月份从 `planned_publish_at` 按 `Asia/Shanghai` 推导，不重复落库。推广状态独立保存，非推广帖必须保持 `none`；完成状态只由应发、实发时间与 12 小时阈值归一化为 `pending`、`on_time` 或 `delayed`。任何连接串、密码或真实员工隐私数据都不得写入本目录。
