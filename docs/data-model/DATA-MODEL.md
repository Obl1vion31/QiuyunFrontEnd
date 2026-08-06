# 数据模型与业务逻辑

本文记录当前数据库的长期结构、关系和状态规则。数据库定义以 `src/db/schema.ts` 与 `drizzle/` 迁移为最终依据；Neon 操作、查询和恢复方法见 [`database-basics/README.md`](../database-basics/README.md)。

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
| `counts_toward_promotion` | boolean | NOT NULL, default false | 是否计入推广周期汇总 |
| `current_version_number` | integer | NOT NULL, default 0；≥0 | 当前版本号 |
| `created_at` | timestamptz | NOT NULL, default now | 创建时间 |
| `updated_at` | timestamptz | NOT NULL, default now | 更新时间 |

关键约束：

- UNIQUE `(year, section_key, row_name)`；
- 复合 FK `(subject_id, category_id)` → `operations_subject_category`，RESTRICT；
- 有 `category_id` 时必须有 `subject_id`；
- INDEX `(year, section_key, sort_order)`。

总规划不保存为独立行，而是实时汇总：所有启用行形成发帖周期；其中 `counts_toward_promotion = true` 的启用行形成推广周期。

### `operations_annual_plan_block`

| 字段 | 类型 | 约束 | 含义 |
| --- | --- | --- | --- |
| `id` | uuid | PK | 时间块 ID |
| `plan_id` | uuid | FK → `operations_annual_plan.id`, CASCADE | 所属规划行 |
| `start_month` | integer | NOT NULL；1–12 | 开始月 |
| `end_month` | integer | NOT NULL；start–12 | 结束月 |
| `label` | text | NOT NULL | 时间块名称 |
| `rule_type` | text | NULL | `flexible`、`fixed` 或 NULL |
| `monthly_frequency` | integer | NULL | 弹性月频次 |
| `quantity_parts` | integer[] | NULL | 固定数量组合 |
| `note` | text | NULL | 备注 |
| `sort_order` | integer | NOT NULL, default 0 | 顺序 |

数量规则只允许三种组合：

- 待确认：三项数量字段全部为 NULL，页面显示 `?`；
- 弹性：`rule_type = flexible`、`monthly_frequency > 0`、`quantity_parts = NULL`；
- 固定：`rule_type = fixed`、`monthly_frequency = NULL`、`quantity_parts` 为非空正整数数组。

INDEX `(plan_id, sort_order)`。同一规划行最多 24 个时间块且月份不得重叠；不重叠由应用层校验。

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
| `change_summary` | text | NOT NULL | 用户填写的调整说明 |
| `diff_summary` | jsonb | NOT NULL | 系统生成的变化摘要数组 |
| `changed_by_label` | text | NOT NULL | Basic Auth 用户名标识 |
| `created_at` | timestamptz | NOT NULL, default now | 版本时间 |

UNIQUE `(plan_id, version_number)`；INDEX `(plan_id, created_at)`。

新行从 V0 开始。修改使用 `expected_version_number` 乐观锁并创建 V+1 快照；恢复旧版本也创建新的 V+1，不覆盖历史。

## 4. 内容身份、版本与排期

### `operations_content`

| 字段 | 类型 | 约束 | 含义 |
| --- | --- | --- | --- |
| `id` | uuid | PK | 跨版本稳定的逻辑帖子 ID |
| `created_at` | timestamptz | NOT NULL, default now | 创建时间 |
| `updated_at` | timestamptz | NOT NULL, default now | 更新时间 |

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
| `project_doc_url` | text | NULL | HTTP/HTTPS 项目文档地址，新数据应用层必填 |
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
| `completion_status` | text | NOT NULL | `pending`、`on_time`、`delayed` |
| `delay_reason` | text | NULL | 严格延期超过 12 小时的原因 |
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

- `operations_stage_review_meeting` 保存自定义会议范围、会议时间、状态和创建人。
- `operations_content_performance_metric` 以 `(schedule_id, checkpoint_type)` 唯一保存 T+7、T+15 的点击率、3 秒阅读率和数据截至日。
- `operations_non_promotion_review` 以 `(schedule_id, checkpoint_type)` 唯一保存内容身份、指标、cohort 快照和人工结论；它不依赖会议，应用层按 T+7 → T+15 顺序开放。
- `operations_category_policy_version` 为稳定分类保存显示名称、默认推广身份、是否可选、生效日期和递增版本。
- `operations_schedule_usage_event` 保存推广与非推广之间的用途变更。推广转非推广只结束开放 Campaign / Stage，不删除已有推广事实。
- 正式非推广复盘起始日为 `2026-07-01`；此前内容不生成待办或 cohort 样本。
