# 数据模型与业务逻辑

本文记录当前数据库的长期结构、关系和状态规则。数据库定义以 `src/db/schema.ts` 与 `drizzle/` 迁移为最终依据；Neon 操作、查询和恢复方法见 [`database-basics/README.md`](../database-guide.md)。

## 1. 模型总览

```text
基础字典
operations_subject ─┐
                    ├─ operations_subject_category
operations_category ┘             │
                                  ├─ operations_annual_plan
                                  └─ operations_content_version

年度规划
operations_annual_plan_year
operations_annual_plan
├─ operations_annual_plan_block
├─ operations_annual_plan_link
└─ operations_annual_plan_version

内容与推广
operations_content
└─ operations_content_version
   └─ operations_content_schedule
      └─ operations_promotion_campaign
         ├─ operations_promotion_stage
         └─ operations_promotion_daily_metric
```

Annual Plan 与具体帖子、排期没有直接外键。两者只通过 `subject_id + category_id` 表达相同业务维度；Annual Plan 不自动生成帖子或排期。

## 2. 基础字典

### `operations_subject`

| 字段 | 类型 | 约束 | 含义 |
| --- | --- | --- | --- |
| `id` | text | PK | 学科稳定 ID：`tmua`、`step`、`interview` |
| `name` | text | NOT NULL, UNIQUE | 学科名称 |
| `sort_order` | integer | NOT NULL | 显示顺序 |

### `operations_category`

| 字段 | 类型 | 约束 | 含义 |
| --- | --- | --- | --- |
| `id` | text | PK | 帖子分类稳定 ID |
| `name` | text | NOT NULL, UNIQUE | 分类名称 |
| `sort_order` | integer | NOT NULL | 显示顺序 |

### `operations_subject_category`

| 字段 | 类型 | 约束 | 含义 |
| --- | --- | --- | --- |
| `subject_id` | text | PK, FK → `operations_subject.id`, RESTRICT | 学科 |
| `category_id` | text | PK, FK → `operations_category.id`, RESTRICT | 该学科可用分类 |

复合主键为 `(subject_id, category_id)`；`category_id` 有普通索引。Annual Plan 和 Content Version 都用复合外键验证学科与分类组合。

## 3. Annual Plan

### `operations_annual_plan_year`

| 字段 | 类型 | 约束 | 含义 |
| --- | --- | --- | --- |
| `year` | integer | PK；2000–9999 | 年份 |
| `instructions` | text | NULL | 年度说明 |
| `created_at` | timestamptz | NOT NULL, default now | 创建时间 |
| `updated_at` | timestamptz | NOT NULL, default now | 更新时间 |

`operations_annual_plan.year` 与本表按年份在应用层关联，当前没有数据库外键。

### `operations_annual_plan`

| 字段 | 类型 | 约束 | 含义 |
| --- | --- | --- | --- |
| `id` | uuid | PK, default random UUID | 规划行 ID |
| `year` | integer | NOT NULL；2000–9999 | 年份 |
| `section_key` | text | NOT NULL | 分区机器标识 |
| `section_label` | text | NOT NULL | 分区名称 |
| `subject_id` | text | NULL, FK → `operations_subject.id`, RESTRICT | 学科 |
| `row_name` | text | NOT NULL | 规划项目名称 |
| `category_id` | text | NULL, FK → `operations_category.id`, RESTRICT | 帖子分类 |
| `course_name` | text | NULL | 旧兼容字段，当前写入为 NULL |
| `note` | text | NULL | 备注 |
| `sort_order` | integer | NOT NULL, default 0 | 显示顺序 |
| `is_active` | boolean | NOT NULL, default true | 是否启用 |
| `counts_toward_promotion` | boolean | NOT NULL, default false | 旧兼容标记；新写入按付费区间派生 |
| `current_version_number` | integer | NOT NULL, default 0；≥0 | 当前版本号 |
| `created_at` | timestamptz | NOT NULL, default now | 创建时间 |
| `updated_at` | timestamptz | NOT NULL, default now | 更新时间 |

关键约束：

- UNIQUE `(year, section_key, row_name)`；
- 复合 FK `(subject_id, category_id)` → `operations_subject_category`，RESTRICT；
- 有 `category_id` 时必须有 `subject_id`；
- INDEX `(year, section_key, sort_order)`。

总规划不保存为独立行，而是实时汇总：所有启用时间块形成内容流动周期，`promotion_ranges` 的并集形成付费推广周期。

### `operations_annual_plan_block`

| 字段 | 类型 | 约束 | 含义 |
| --- | --- | --- | --- |
| `id` | uuid | PK | 时间块 ID |
| `plan_id` | uuid | FK → `operations_annual_plan.id`, CASCADE | 所属规划行 |
| `start_slot` / `end_slot` | integer | 新格式必须成对填写；1–24，end ≥ start | 半月起止：奇数上半月，偶数下半月 |
| `promotion_ranges` | jsonb | 新格式非 NULL；默认自然流用空数组 | 块内付费区间数组；范围不得越界或重叠 |
| `start_month` | integer | NOT NULL；1–12 | 旧兼容开始月，由半月起止派生 |
| `end_month` | integer | NOT NULL；start–12 | 旧兼容结束月 |
| `label` | text | NOT NULL | 时间块名称 |
| `rule_type` | text | NULL | `flexible`、`fixed` 或 NULL |
| `monthly_frequency` | integer | NULL | 弹性月频次 |
| `quantity_parts` | integer[] | NULL | 固定数量组合 |
| `note` | text | NULL | 备注 |
| `sort_order` | integer | NOT NULL, default 0 | 顺序 |

新记录直接保存自由备注，旧数量字段全部写 NULL；旧结构与旧快照仅在兼容读取时转换成文字，原历史快照不修改。追加迁移允许三个新字段全为 NULL，保证过渡期间旧部署仍可写入；新 API 要求完整半月范围与付费区间。

INDEX `(plan_id, sort_order)`。同一规划行最多 24 个时间块且半月范围不得重叠；应用层同时检查付费区间位于周期内部。v4 快照保存半月范围和付费区间；恢复旧版本时生成兼容转换后的新版本。

### `operations_annual_plan_link`

| 字段 | 类型 | 约束 | 含义 |
| --- | --- | --- | --- |
| `id` | uuid | PK | 链接 ID |
| `plan_id` | uuid | FK → `operations_annual_plan.id`, CASCADE | 所属规划行 |
| `label` | text | NOT NULL | 链接名称 |
| `url` | text | NOT NULL | HTTP/HTTPS 地址 |
| `sort_order` | integer | NOT NULL, default 0 | 顺序 |

INDEX `(plan_id, sort_order)`；每行最多 30 个链接。

### `operations_annual_plan_version`

| 字段 | 类型 | 约束 | 含义 |
| --- | --- | --- | --- |
| `id` | uuid | PK | 历史版本 ID |
| `plan_id` | uuid | FK → `operations_annual_plan.id`, RESTRICT | 规划行 |
| `version_number` | integer | NOT NULL；≥0 | 版本号 |
| `snapshot` | jsonb | NOT NULL | 规划行、时间块和链接的完整快照 |
| `change_summary` | text | NOT NULL | 用户选填的调整说明；未填时使用动作说明 |
| `diff_summary` | jsonb | NOT NULL | 系统生成的变化摘要数组 |
| `changed_by_label` | text | NOT NULL | 已验证的登录用户名标识 |
| `created_at` | timestamptz | NOT NULL, default now | 版本时间 |

UNIQUE `(plan_id, version_number)`；INDEX `(plan_id, created_at)`。

新行从 V0 开始。修改使用 `expected_version_number` 乐观锁并创建 V+1 快照；恢复旧版本也创建新的 V+1，不覆盖历史。

## 4. 内容身份、版本与排期

### `operations_content`

| 字段 | 类型 | 约束 | 含义 |
| --- | --- | --- | --- |
| `id` | uuid | PK | 跨版本稳定的逻辑帖子 ID |
| `platform_note_id` | text | NULL；UNIQUE；24 位小写十六进制 | 跨版本稳定的小红书笔记 ID |
| `created_at` | timestamptz | NOT NULL, default now | 创建时间 |
| `updated_at` | timestamptz | NOT NULL, default now | 更新时间 |

`platform_note_id` 只保存在帖子主体，不复制到内容版本、排期、Campaign、日度事实、指标或复盘快照。应用层在写入前去除首尾空格并转小写，数据库同时约束格式与唯一性。非推广首次复盘和推广首次日度复盘会在同一事务中补齐缺失值；开始推广测试不要求笔记 ID。更正会影响同一 `content_id` 下全部版本与下游页面的读取结果。

### `operations_content_version`

| 字段 | 类型 | 约束 | 含义 |
| --- | --- | --- | --- |
| `id` | uuid | PK | 内容版本 ID |
| `content_id` | uuid | FK → `operations_content.id`, RESTRICT | 逻辑帖子 |
| `version_number` | integer | NOT NULL | V0、V1、V2… |
| `source_version_id` | uuid | 自 FK → 本表 `id`, RESTRICT, NULL | 改帖来源版本 |
| `work_type` | text | NOT NULL | `new` 或 `revision` |
| `content_name` | text | NOT NULL | 帖子名称 |
| `subject_id` | text | FK → `operations_subject.id`, RESTRICT | 学科 |
| `category_id` | text | FK → `operations_category.id`, RESTRICT, NULL | 帖子分类 |
| `revision_summary` | text | NULL | 改帖说明 |
| `project_doc_name` | text | NULL | 历史项目文档名称，仅保留兼容，新数据不再要求填写 |
| `project_doc_url` | text | NULL | HTTP/HTTPS 项目文档地址，排期阶段可空，实发登记时应用层必填 |
| `created_at` | timestamptz | NOT NULL, default now | 创建时间 |
| `updated_at` | timestamptz | NOT NULL, default now | 更新时间 |

关键约束：

- UNIQUE `(content_id, version_number)`；
- 复合 FK `(subject_id, category_id)` → `operations_subject_category`，RESTRICT；
- INDEX `source_version_id`；
- 新做帖：V0、`work_type = new`、无来源版本；
- 改帖：只从最新版本创建 V+1，`work_type = revision` 并记录 `source_version_id`；
- 编辑当前排期资料不会自动创建新版本。

### `operations_content_schedule`

| 字段 | 类型 | 约束 | 含义 |
| --- | --- | --- | --- |
| `id` | uuid | PK | 排期 ID |
| `content_version_id` | uuid | FK → `operations_content_version.id`, RESTRICT | 内容版本 |
| `sync_to_moments` | boolean | NOT NULL, default false | 是否同步朋友圈 |
| `is_promoted` | boolean | NOT NULL, default false | 是否属于付费推广帖 |
| `promotion_status` | text | NOT NULL, default `none` | 排期层推广状态 |
| `promotion_deferred_through` | date | NULL | “当日未推广”已确认至该日 |
| `planned_publish_at` | timestamptz | NOT NULL | 应发时间 |
| `actual_publish_at` | timestamptz | NULL | 实发时间 |
| `delay_threshold_hours` | integer | NOT NULL, 默认 2 | 该排期适用的延期门槛；已登记历史保留 8 |
| `completion_status` | text | NOT NULL | `pending`、`on_time`、`delayed` |
| `delay_reason` | text | NULL | 旧单条延期原因，保留作历史补齐来源 |
| `source_key` | text | UNIQUE, NULL | 一次性历史导入幂等键 |
| `created_at` | timestamptz | NOT NULL, default now | 创建时间 |
| `updated_at` | timestamptz | NOT NULL, default now | 更新时间 |

推广一致性：

```text
is_promoted = false → promotion_status = none
is_promoted = true  → promotion_status ∈
pending / awaiting_promotion / testing / scaling /
ended / test_discarded / formal_discarded
```

`is_promoted` 是稳定身份，活动结束后仍为 true。完成状态由应发/实发时间自动计算；“逾期未发”是页面派生提示，不存入数据库。

## 5. 推广生命周期

### `operations_promotion_campaign`

| 字段 | 类型 | 约束 | 含义 |
| --- | --- | --- | --- |
| `id` | uuid | PK | 一轮推广活动 ID |
| `schedule_id` | uuid | FK → `operations_content_schedule.id`, CASCADE | 对应排期 |
| `started_on` | date | NOT NULL | 实际开始推广日 |
| `ended_on` | date | NULL；不得早于开始日 | 活动结束日 |
| `current_stage` | text | NULL | 当前开放阶段 |
| `current_status` | text | NOT NULL | 当前或最终状态 |
| `created_at` | timestamptz | NOT NULL, default now | 创建时间 |
| `updated_at` | timestamptz | NOT NULL, default now | 更新时间 |

状态一致性：

```text
current_status = testing → current_stage = testing
current_status = scaling → current_stage = scaling
current_status = ended / test_discarded / formal_discarded
→ current_stage = NULL
```

结束时 `current_stage = NULL`，因为它表示“当前仍开放的阶段”；最终结果由 `current_status` 表达。数据库允许一条 Schedule 有多个 Campaign，当前页面流程通常只创建当前一轮。

### `operations_promotion_stage`

| 字段 | 类型 | 约束 | 含义 |
| --- | --- | --- | --- |
| `id` | uuid | PK | 阶段 ID |
| `campaign_id` | uuid | FK → `operations_promotion_campaign.id`, CASCADE | 所属活动 |
| `stage_type` | text | `testing` 或 `scaling` | 阶段类型 |
| `started_on` | date | NOT NULL | 开始日 |
| `ended_on` | date | NULL；不得早于开始日 | 结束日，NULL 表示开放中 |
| `outcome` | text | NULL 或合法结果 | 阶段关闭结果 |
| `created_at` | timestamptz | NOT NULL, default now | 创建时间 |
| `updated_at` | timestamptz | NOT NULL, default now | 更新时间 |

`outcome` 可为 `continued`、`start_scaling`、`test_discarded`、`scaling_continued`、`ended`、`formal_discarded`。

数据库保证：

- 同一 Campaign 最多一个 `ended_on IS NULL` 的开放 Stage；
- Trigger 禁止同一 Campaign 的 Stage 日期区间重叠；
- 测试结束日与放量开始日不能是同一天，正常为测试结束后的下一天开始放量。

### `operations_promotion_daily_metric`

| 字段 | 类型 | 约束 | 含义 |
| --- | --- | --- | --- |
| `id` | uuid | PK | 日度事实 ID |
| `campaign_id` | uuid | FK → `operations_promotion_campaign.id`, CASCADE | 所属活动 |
| `metric_date` | date | NOT NULL | 指标日期 |
| `stage_type_snapshot` | text | `testing` 或 `scaling` | 当天阶段快照 |
| `spend` | numeric(12,2) | NOT NULL, ≥0 | 当日消耗 |
| `click_rate` | numeric(7,4) | NULL；0–100 | 点击率，日度页面暂不填写 |
| `platform_open_count` | integer | NOT NULL, ≥0 | 平台开口数 |
| `actual_open_count` | integer | NOT NULL, ≥0 | 实际开口数 |
| `platform_lead_count` | integer | NOT NULL, ≥0 | 平台留资数 |
| `actual_lead_count` | integer | NOT NULL, ≥0 | 实际留资数 |
| `review_decision` | text | NOT NULL | 当天复盘决定 |
| `reviewed_at` | timestamptz | NOT NULL, default now | 首次复盘时间 |
| `note` | text | NULL | 备注 |
| `created_at` | timestamptz | NOT NULL, default now | 创建时间 |
| `updated_at` | timestamptz | NOT NULL, default now | 更新时间 |

UNIQUE `(campaign_id, metric_date)`；INDEX `metric_date`。

决定必须匹配当天快照：

```text
testing → test_continue / test_discarded / start_scaling
scaling → scaling_continue / formal_discarded / ended
```

`stage_type_snapshot` 不直接外键到 Stage。它保存当天事实语义，在 Stage 因历史更正被重建时仍保持稳定。

实际开口成本和实际留资成本不存库：

```text
spend / actual_open_count
spend / actual_lead_count
```

分母为 0 时结果为 NULL。

## 6. 推广状态流转

```text
非推广：none

推广帖未发布：pending
    ↓ 实发
已发布未推广：awaiting_promotion
    ├─ 当日未推广：只推进 promotion_deferred_through
    └─ 开始测试：创建 Campaign + Testing Stage
           ↓
        testing
        ├─ test_continue → testing
        ├─ test_discarded → 关闭为 test_discarded
        └─ start_scaling → 当天关闭测试，下一天进入 scaling
                                  ├─ scaling_continue → scaling
                                  ├─ formal_discarded → 关闭为 formal_discarded
                                  └─ ended → 正常结束
```

开始测试前不创建 Campaign、Stage 或空日度指标。测试开始后不允许跳日，待填日期为开放 Stage 开始日，或最新 `metric_date + 1`；只能填写今天以前的数据。

Campaign 存在后，`campaign.current_status` 与 `schedule.promotion_status` 在同一事务中同步。

## 7. 历史更正与级联规则

历史日度记录可修改消耗、四项人数、备注和 `review_decision`；日期、帖子、Campaign 和 `stage_type_snapshot` 不直接编辑。

- 只改指标：更新 Daily Metric，不改变生命周期；
- 改 `review_decision`：先统计后续事实并二次确认，再事务删除该日之后的 Daily Metric、重建全部 Stage、重算 Campaign，并同步 Schedule；删除日期重新进入待填队列；
- 改实发日期：先提示关联 Campaign 与 Daily Metric 数量，确认后重置推广事实；推广身份改为非推广则填写原因、结束开放 Stage / Campaign 并记录用途事件，已有推广事实不删除；
- 改帖：旧版本若正在测试或放量，分别关闭为 `test_discarded` 或 `formal_discarded`；新版本创建独立 Schedule，不继承旧 Campaign。

## 8. 删除规则摘要

```text
Annual Plan
├─ block：CASCADE
├─ link：CASCADE
└─ version：RESTRICT

Content
└─ version：RESTRICT
   ├─ source version 自关联：RESTRICT
   └─ schedule：RESTRICT
      └─ campaign：CASCADE
         ├─ stage：CASCADE
         └─ daily metric：CASCADE
```

数据库硬约束负责主外键、唯一性、数值范围、状态组合、唯一开放 Stage 和 Stage 不重叠；应用层负责版本乐观锁、时间块不重叠、连续日度填报、状态同步和破坏性操作二次确认。

## 9. 非推广阶段复盘与用途历史

- `operations_review_meeting` 保存自选会议范围、会议时间、类型、当前版本和可编辑草稿；旧 `operations_stage_review_meeting` 由迁移原位改名并保留 ID。
- `operations_review_meeting_version` 以不可变 V0 / V1+ 快照保存排期对齐、推广区间聚合、非推广节点引用、人工指标和结论。
- `operations_review_action_item` 保存跨周问题与当前状态；`operations_review_action_progress` 按会议追加进展和结论，不覆盖旧记录。
- `operations_content_performance_metric` 以 `(schedule_id, checkpoint_type)` 唯一保存 T+7、T+15 的点击率、3 秒阅读率和数据截至日。
- `operations_non_promotion_review` 以 `(schedule_id, checkpoint_type)` 唯一保存内容身份、指标、cohort 快照和人工结论；它不依赖会议，应用层按 T+7 → T+15 顺序开放。
- `operations_category_policy_version` 为稳定分类保存显示名称、默认推广身份、是否可选、生效日期和递增版本。
- `operations_schedule_usage_event` 保存推广与非推广之间的用途变更。推广转非推广只结束开放 Campaign / Stage，不删除已有推广事实。
- 正式非推广复盘起始日为 `2026-07-01`；此前内容不生成待办或 cohort 样本。

## 排期审批与逐日延期

排期的 `plan_revision` 从 0 开始，`plan_effective_at` 记录批准或直接改期生效时间。满应发 2 小时未登记只催办“尚未登记”；实际发布是否延期按排期的 `delay_threshold_hours` 判定，后续每满 24 小时增加一条原因。已登记历史保留 8 小时，旧排期修订保存当时门槛；历史原因日期及事实不覆盖。

- `operations_schedule_change_request`：原排期修订、新发送时间、申请理由、申请人及审批信息；同一排期最多一条 pending，状态包含 pending / approved / rejected / obsolete。
- `operations_schedule_plan_history`：关闭的排期修订、原应发时间、延期门槛、生效与结束时间、新应发时间及操作者；批准改期不覆盖旧计时段。
- `operations_schedule_delay_reason`：以排期、修订和天数唯一关联逐日理由，保存责任方、文字、人工／历史来源、操作者及更正历史；未来尚未到期的日期不提前落库。
- `operations_non_promotion_checkpoint_event`：按排期与首轮／二轮追加 skip / restore 事件，以单调 sequence 确定当前状态；不创建指标或空复盘记录。

历史空分类归入固定临时帖，新增临时学科只映射临时帖；关联仍使用稳定 ID。所有新增业务历史都通过 RESTRICT 保护排期删除。


## 11. 团队节假日暂停与历史等待

`operations_promotion_campaign.initial_stage` 保存最早已知阶段，默认测试。已知历史从放量开始时直接保存放量基线，不补造早期测试事实。回放接口接受基线和明确等待区间。

| 表 | 关键字段与职责 |
| --- | --- |
| `operations_promotion_hold` | `campaign_id`、`started_on`、`ended_on`、`stage_type`、`resume_stage`、`reason`、唯一来源键；保存已确认历史等待，不生成零指标 |
| `operations_promotion_pause` | 幂等 `request_key`、起止时间、提前恢复时间、并发版本、原因、已验证操作者与变更历史 |
| `operations_promotion_pause_target` | 暂停批次与当时实际运行 Campaign 的唯一关联，保留原测试／放量阶段；原本等待的活动不加入目标 |

两种角色都能创建、调整和提前恢复。全局事务锁先于活动锁，重复请求只产生一个批次，并发调整检查版本。

排期与日度页面共用有效状态函数：原始 `waiting_action + testing` 展示测试待定，`waiting_action + scaling` 展示推广暂停；节假日目标处于暂停窗口时展示推广暂停，截止日后的上海时间零点恢复原阶段。已经结束或淘汰的活动不因暂停到期而重新激活。

完整暂停日从复盘队列和阶段天数排除，开始／恢复当日有实际投放的仍填真实数据。已存在等待活动的状态不变，完整假期内免逐日确认。暂停不写入虚构指标；已确认的投放零量是有效 `active` 日度事实，五项数值为 0，分母为 0 的成本为空。

放量回到测试必须派生新版本、排期及 Campaign；版本共享原逻辑帖子笔记 ID，旧事实留在原版本。受控导入校正现有非推广指标时追加复盘版本，原有定稿周会快照不改写。

## 发布登记与旧预约历史

`operations_content_schedule.publication_url` 保存该排期的纯帖子链接，`publication_revision` 为并发修订号。`actual_publish_at` 保存用户登记的发布时间，可为未来时间，提交后统一视为已发送；原应发时间独立保存。复盘从登记的发布时间计算，延期理由只要求已经到期的日期。

`operations_publication_event` 保存首次登记、链接调整及管理员时间更正的前后值、原因和已验证身份。北京时间 2026 年 10 月 17 日零点前已发送且链接为空的现存记录可保持空值；新登记始终必须链接。链接不替代项目文档或逻辑帖笔记 ID。

`operations_publication_reservation` 保留旧时间、状态、身份及追加历史，不再用于新的预约提交或审核。新发布登记会结束对应旧开放记录，历史存在时排期仍受删除保护；不会批量转换旧预约或补造发布证据。
