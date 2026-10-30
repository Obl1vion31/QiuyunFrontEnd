# `src/db/` 数据库层

- `schema.ts`：学科分类、年度规划、帖子、内容版本和发布排期的表、字段、关系与索引。
- `client.ts`：服务端惰性 PostgreSQL 连接；不得被客户端脚本导入。
- `validation.ts`：新增与编辑共用的枚举、上海时区时间解析和 2 小时延期规则。
- `schedule-rules.mjs`：2 小时催登记、新旧统一判定延期、逐日边界与发布状态的共享纯规则。
- `schedule-workflow.ts`：改期申请、审批、历史计时段、逐日理由、历史补齐与团队提醒；所有写入共用排期事务锁。
- `non-promotion-workflow.ts`：节点跳过／恢复事件及并发检查，复用真实复盘顺序，不生成指标占位。
- `promotion-state.mjs`：排期、日度、历史共用的业务状态、整日暂停窗口、复盘日期与阶段天数。
- `promotion-pauses.ts`：共用上下文、事务锁及旧团队暂停历史兼容；团队暂停写入已移除。
- `annual-plan.ts`：年度分区规划行、时间块、行级链接、快照和差异校验。
- `annual-plan-storage.ts`：年度写入事务锁与批量跨年复制，保护已有目标配置。
- `annual-plan-rules.mjs`：半月范围、旧快照兼容、深浅分段和自动总规划汇总，可由 Node 测试直接复用。

迁移由根目录 `drizzle.config.ts` 和 `drizzle/` 管理。新做帖建立 V0，改帖从来源版本派生 V1/V2；排期关联具体内容版本。总周期规划独立保存年度说明、细致规划行、多时间块和不可变版本快照，不自动生成排期；自动总规划在查询时由启用细致规划计算，不另存为可编辑事实。年度规划初始化为 V0，第一次真实业务修改进入 V1。月份从 `planned_publish_at` 按 `Asia/Shanghai` 推导，不重复落库。推广状态独立保存，非推广帖必须保持 `none`；完成状态只由应发、实发时间与 2 小时阈值归一化为 `pending`、`on_time` 或 `delayed`。任何连接串、密码或真实员工隐私数据都不得写入本目录。

账号表使用 `auth_` 前缀，用户角色、会话和限流与业务事实分开保存。`client.ts` 提供本机／Neon 共用的可关闭连接与惰性共享连接，调整单地址连接尝试时限，测试通过显式连接串使用隔离库。

- `promotion-wait-ranges.ts`：逐帖待定区间、次日生效计划、并发版本与历史级联保护。
- `promotion-stage-reviews.ts`：自选区间测试／放量聚合、缺口和来源事实、不可变 V0/V1+ 快照。
- `meeting-snapshots.ts`：旧 v2/v3 例会兼容与通用草稿校验；`meeting-weekly-material.ts`：v4 周例会的实际日期候选、跨期阶段、基准、来源指纹及二轮首轮对照；可编辑旧草稿缺失的日度状态按真实记录只读补齐，冻结视图不补。
- `meeting-finalization.ts`：会前／会后必填与非推广处理门槛的共享纯规则，前端定位缺项，服务端事务复核；不限制草稿保存。
- `meeting-card-rules.ts`：非零日期边界、手填点击率区间复核、非推广发布时间排序、自动会议名和草稿事项内容判断；新增信息进入原JSON，不增加表或改写旧定稿。
- `promotion-daily-write.ts`：单条／批量共用事务写入，批量入口统一先验指纹和共享 ID，任何错误整批回滚。

- `publication-workflow.ts`：统一发布登记、帖子链接和按操作授权的时间更正事务；`publication-rules.mjs` 维护发布状态及历史空链接边界，旧预约只保留历史。

`publication-link.mjs` 在前后端共用分享文案识别，不请求小红书；旧预约表保留只读历史，写入接口已停用。

- `business-approvals.ts`：逐操作授权、待审变更、原入口事务预检与原子审核；`proposal-diff.ts` 输出业务字段差异，不公开账号凭据。

- `promotion-timeline.ts`：首次待定、首次测试／直接放量、实际当日暂停和历史开始日／阶段更正；以业务日期回放，指纹、幂等与事务锁保护，冲突指标归档在前后快照中。`schedule-approvals.ts` 统一排期待审的新旧申请读模型。

`promotion-pending.ts` 是无数据库依赖的待办展示模型：从已有首次计划／暂停区间推导连续状态、含当天的截止日及 T+1 目标日与是否到期；不写库、不延长截止日、不创建零指标。

`promotion-overview.ts` 仅从既有活动、阶段、暂停窗口与日度事实生成生命周期读模型，不另存汇总。按排期版本去重、按阶段快照计算五项累计与两项成本，缺失不补零；不改变阶段复盘的不可变快照口径。

`promotion-audit-view.ts` 只读分类初始化／首次安排、业务更正、技术维护与未确认类别，生成具体前后状态。技术和未确认类别不自动进入业务历史，原始审计不删改；新增不明确类别须先确认。

`promotion-review-days.ts` 负责未完成日期与今天预览、T+1 开放和顺序锁；不写入指标。

`promotion-successors.mjs` 为前后端共享的实际状态／次日安排目录；`promotion-replay.mjs` 分离精确状态事件与指标事实，残留不推动生命周期。日度事实以 `recordKind` 和 `sourceStageStartedOn` 关联稳定原阶段，旧行仍可读取；新暂停／待定逐日规则从活动的 `dailyReviewEnabledOn` 启用，不补造历史零值。迁移 `0036` 只在隔离库验证，发布时另行授权执行。

`schedule-delay-cleanup.ts` 在改期／实发更正的原事务内清理失效原因与结构化副本；最新排期之外不计延期。`meeting-note-ids.ts` 独立读取逻辑帖子 ID，不进入例会材料或冻结快照。

- `taxonomy-store.ts`：数据库字典读取、管理员追加与重名复用关联，`validation.ts` 的运行时排期校验依赖此字典；旧分类规则仅保留技术历史。
- `promotion-cycles.mjs`：复测边界与轮次读取，日度事实通过原阶段起点归属；`promotion-replay.mjs` 将restart_testing作为独立动作回放，同日例会与日度去重。兼容迁移只扩展约束，旧指标及冻结版本不重建。

- `meeting-discussion.ts`：定稿修订白名单；`meeting-discussion-values.ts` 为浏览器安全载荷提取。
- `meeting-version-rules.ts`／`meeting-version-workflow.ts`：固定生效日、最新版本修订、限时回溯及事项前后值恢复，来源和更新时间共同防并发覆盖。
- `meeting-rate-comparison.ts`：冻结同类样本、稳定键去重、pp差值及旧定稿纯展示兼容，不用实时数据回填历史。
- `meeting-pdf.ts`／`meeting-pdf-render.tsx`：版本级私有PDF、指纹缓存与生成租约；复用网页组件和MiSans内联打印，不依赖外部渲染服务。

例会版本的 `lifecycleStatus` 区分草稿／定稿，`finalizationStage` 独立区分会前／会后；同场仅一份活动草稿，保存和定稿更新同一版本行。`meeting-version-workflow.ts` 保护来源、更新时间及生效日，草稿不参与比较样本、安排回放、事项或PDF；恢复草稿的撤销事实使用独立业务效果日志。

- `collaboration-resources.ts`：浏览器／服务端共用写入目标映射；`collaboration.ts`：稳定对象解析、编辑租约和写事务内校验，保留原业务版本保护。
- `meeting-readiness.ts`／`promotion-review-required.ts`：本次会议缺项和原日度队列同源，未结束测试不进入会议来源。
- `non-promotion-record.ts`：正式指标、复盘和节点事件的版本指纹；`stage-review-rules.mjs` 维护7／15天截止窗口。
- `backup-restore.ts`：私有备份摘要验证、独立空库预检与原子恢复；维护入口在根 scripts，不通过网页开放。

`monthly-operations.ts` 共用月度页面SSR与只读API：发布执行按最新应发月，发布量按实发月，费用按指标日期；测试失败按有效阶段回放和稳定轮次归属。只读既有事实，不建立负责人、月计划快照或零指标。
