# Phase 05 Executive Result — Daily Promotion Review

> 状态：正式完结。推广日度事实、待开始推广、生命周期、历史更正和双粒度历史总览已经完成验收；后续阶段复盘进入 Phase 06。

## 一、Phase 05 最终范围

Phase 05 只处理推广帖的日度复盘，没有把非推广帖、周度复盘、月度复盘、年度复盘或 Canva 首图同步加入本阶段。

已经形成的工作闭环是：

```text
排期标记为推广帖
→ 填写实发日期并进入待开始推广
→ 明确开始测试后建立推广活动
→ 员工按 T+1 填写前一天数据
→ 选择下一自然日继续、转放量、淘汰或结束
→ 保存日度事实并更新推广阶段
→ 在最新生命周期和历史总览中查看结果
```

## 二、已经完成的产品能力

### 1. 排期与推广身份

- 排期使用独立的 `is_promoted` 布尔值判断是否属于推广帖。
- `is_promoted = false` 表示非推广帖，推广状态必须为 `none`。
- `is_promoted = true` 表示该排期具有推广身份；尚未实发时为 `pending`，填写实发日期后进入 `awaiting_promotion`。
- 推广自然结束、测试淘汰或放量淘汰后，`is_promoted` 仍保持 `true`，以保留它曾经属于推广帖的事实。
- 排期管理统一使用测试黄和放量绿，覆盖筛选卡片、状态标签、月历条目和推广视图。

### 2. 推广活动与阶段流转

- 推广帖填写实发日期后不自动建立活动；明确开始测试的日期才作为推广活动和测试阶段的开始日期。
- 测试期支持“测试继续”“测试淘汰”“测试接放量”。
- 放量期支持“放量继续”“放量淘汰”“推广周期结束”。
- 每日决定从被复盘日期的下一自然日生效；当天的 `stage_type_snapshot` 不会被以后状态覆盖。
- 同一推广活动必须按日期顺序复盘，不能跳过更早日期直接填写后续日期。
- 改动实发日期或取消推广身份时，如果已经存在推广活动，系统先提示受影响的活动和日度记录数量；确认后在同一事务中删除旧活动、阶段和日度数据，再按新实发日期重新开始。

### 3. T+1 日度复盘

默认复盘日为昨天，系统拒绝保存今天或未来的数据。每篇推广帖每天填写五项原始事实：


| 字段     | 当前口径                        |
| ------ | --------------------------- |
| 消耗     | 当天推广消耗金额                    |
| 平台开口人数 | 平台记录的开口人数                   |
| 实际开口人数 | 员工核对后的真实开口人数                |
| 平台留资人数 | 平台记录的留资人数                   |
| 实际留资人数 | 员工核对后的真实留资人数                |


页面只自动计算两项成本：

```text
实际开口成本 = 消耗 ÷ 实际开口人数
实际留资成本 = 消耗 ÷ 实际留资人数
```

成本不重复保存进数据库。分母为 `0` 时显示 `—`。

### 4. 推广生命周期

- 每篇当前有效的推广帖使用一张独立全宽卡片。
- 测试和放量按照自然日天数计算相对宽度并占满整条，例如测试 3 天、放量 2 天显示为 `60% / 40%`。
- 阶段文字直接显示天数、是否进行中和完整起止日期。
- 不再使用共享月份网格、逐日日期、垂直红线、周分隔线或日度圆点。
- 测试统一使用黄色，放量统一使用绿色。
- 最新生命周期固定截止北京时间昨天，不随历史日期变化；已填日度事实统一在历史总览查看。

### 5. 历史总览

- “每日复盘 / 历史总览”作为同一工作区的两个视图。
- 历史总览默认查询 90 天，也可按日期区间、帖子名称和状态筛选，并支持帖子与日两种粒度。
- 活动列表显示推广区间、测试天数、放量天数、复盘完成数量和当前或最终状态。
- Inspector 显示活动身份、阶段历史和逐日复盘事实。
- 已填日度事实只在历史 Inspector 查看，不再返回每日复盘页面。
- 历史数据支持更正消耗、四项人数、备注和下一步；日期、帖子、活动与阶段快照保持系统只读。下一步更正会在确认后级联删除后续事实并重建生命周期。

## 三、当前数据库分层

数据库没有把所有内容塞进一张表，而是按不同事实层级拆分：

```text
学科 / 分类字典
        ↓
内容身份 operations_content
        ↓ 1:N
内容版本 operations_content_version
        ↓ 1:N
发布排期 operations_content_schedule
        ↓ 1:N
推广活动 operations_promotion_campaign
        ↓ 1:N                  ↓ 1:N
推广阶段 operations_promotion_stage   推广日度事实 operations_promotion_daily_metric
```

这样拆分的原因是：

- 同一内容可以有 V0、V1、V2 等多个版本；
- 同一内容版本可以拥有自己的发布排期；
- 一条排期未来可以有多轮推广活动；
- 一轮推广活动可以先测试、再放量；
- 一轮推广每天可以有一条独立日度事实。

生命周期条、阶段比例和两项实际成本都属于查询或页面计算结果，不是新的事实表。

当前外键与删除关系：


| 上游记录 | 下游记录   | 关系与删除规则           |
| ---- | ------ | ----------------- |
| 内容身份 | 内容版本   | 一对多；版本引用内容身份      |
| 内容版本 | 发布排期   | 一对多；排期限制删除仍被引用的版本 |
| 发布排期 | 推广活动   | 一对多；删除排期会级联删除推广活动 |
| 推广活动 | 推广阶段   | 一对多；删除活动会级联删除阶段   |
| 推广活动 | 推广日度事实 | 一对多；删除活动会级联删除日度事实 |


## 四、原有数据库结构

### 1. 学科与分类字典

#### `operations_subject`


| 字段           | 作用      |
| ------------ | ------- |
| `id`         | 学科稳定标识  |
| `name`       | 学科名称，唯一 |
| `sort_order` | 显示顺序    |


#### `operations_category`


| 字段           | 作用       |
| ------------ | -------- |
| `id`         | 帖子分类稳定标识 |
| `name`       | 分类名称，唯一  |
| `sort_order` | 显示顺序     |


#### `operations_subject_category`

使用 `subject_id + category_id` 复合主键记录某个学科允许使用哪些帖子分类。内容和年度规划均通过这层映射校验，不根据中文名称反查关联。

### 2. 内容身份与版本

#### `operations_content`

这是帖子的稳定身份，只保存：

- `id`
- `created_at`
- `updated_at`

它不会随改帖而改变。

#### `operations_content_version`


| 字段                        | 作用                    |
| ------------------------- | --------------------- |
| `id`                      | 当前版本标识                |
| `content_id`              | 所属内容身份                |
| `version_number`          | V0、V1、V2 等版本号；同一内容内唯一 |
| `source_version_id`       | 改帖来源版本                |
| `work_type`               | 新做帖或改帖                |
| `content_name`            | 帖子名称                  |
| `subject_id`              | 学科                    |
| `category_id`             | 帖子分类                  |
| `revision_summary`        | 改帖的具体改动说明             |
| `project_doc_name`        | 项目文档名称                |
| `project_doc_url`         | 项目文档链接                |
| `created_at / updated_at` | 创建与更新时间               |


新做帖创建 V0；改帖创建新的版本记录，不覆盖旧版本。

### 3. 发布排期

#### `operations_content_schedule`


| 字段                        | 作用                 |
| ------------------------- | ------------------ |
| `id`                      | 排期标识               |
| `content_version_id`      | 被安排发布的内容版本         |
| `sync_to_moments`         | 是否同步朋友圈            |
| `planned_publish_at`      | 应发时间，带时区           |
| `actual_publish_at`       | 实发时间，带时区，可为空       |
| `completion_status`       | 自动计算的发布完成状态        |
| `delay_reason`            | 超过应发时间 12 小时后的延期原因 |
| `source_key`              | 历史导入幂等键，可为空且非空时唯一  |
| `created_at / updated_at` | 创建与更新时间            |


`completion_status` 不是手工选择：

- 未实发：`pending`
- 实发时间没有严格超过应发时间 12 小时：`on_time`
- 实发时间严格超过应发时间 12 小时：`delayed`

### 4. 年度规划

年度规划与 Daily Promotion Review 没有直接外键关系，但共用学科和分类字典：

- `operations_annual_plan_year`：年度和年度说明；
- `operations_annual_plan`：细致规划行、分区、学科、分类、启停状态和当前版本；
- `operations_annual_plan_block`：一个或多个月份时间块及数量规则；
- `operations_annual_plan_link`：规划行的文档链接；
- `operations_annual_plan_version`：规划行、时间块和链接的不可变版本快照。

总规划是从启用的细致规划实时派生，不单独保存第二份可编辑总规划事实。它与推广日度事实也不是同一层数据。

## 五、Phase 05 新增数据库结构

### 1. 排期新增字段

`operations_content_schedule` 新增：


| 字段            | 类型                               | 作用             |
| ------------- | -------------------------------- | -------------- |
| `is_promoted` | `boolean not null default false` | 稳定标记该排期是否属于推广帖 |


`promotion_status` 是原有字段，但 Phase 05 扩充并收紧了它的业务一致性：


| 值                  | 含义         |
| ------------------ | ---------- |
| `none`             | 非推广帖       |
| `pending`          | 是推广帖，但尚未实发 |
| `testing`          | 推广测试中      |
| `scaling`          | 推广放量中      |
| `ended`            | 推广周期正常结束   |
| `test_discarded`   | 测试淘汰       |
| `formal_discarded` | 放量淘汰       |


数据库检查约束保证：

```text
is_promoted = false → promotion_status 只能是 none
is_promoted = true  → promotion_status 不能是 none
```

### 2. `operations_promotion_campaign`

一行代表一轮推广活动。


| 字段                        | 类型与限制                      | 作用             |
| ------------------------- | -------------------------- | -------------- |
| `id`                      | UUID 主键                    | 推广活动标识         |
| `schedule_id`             | 外键，级联删除                    | 所属发布排期         |
| `started_on`              | `date not null`            | 本轮推广开始日期       |
| `ended_on`                | `date`                     | 本轮推广结束日期；进行中为空 |
| `current_stage`           | `testing / scaling / null` | 当前活动阶段；结束后为空   |
| `current_status`          | 受约束文本                      | 当前或最终推广状态      |
| `created_at / updated_at` | 带时区时间                      | 创建与更新时间        |


一致性约束：

- `testing` 状态必须对应 `current_stage = testing`；
- `scaling` 状态必须对应 `current_stage = scaling`；
- 正常结束或淘汰后 `current_stage` 必须为空；
- `ended_on` 不能早于 `started_on`。

### 3. `operations_promotion_stage`

一行代表一段连续测试期或放量期。


| 字段                        | 类型与限制               | 作用            |
| ------------------------- | ------------------- | ------------- |
| `id`                      | UUID 主键             | 阶段标识          |
| `campaign_id`             | 外键，级联删除             | 所属推广活动        |
| `stage_type`              | `testing / scaling` | 阶段类型          |
| `started_on`              | `date not null`     | 阶段开始日期        |
| `ended_on`                | `date`              | 阶段结束日期；进行中为空  |
| `outcome`                 | 可为空的受约束文本           | 该阶段如何继续、转化或结束 |
| `created_at / updated_at` | 带时区时间               | 创建与更新时间       |


`outcome` 当前允许：

- 测试继续 `continued`
- 测试接放量 `start_scaling`
- 测试淘汰 `test_discarded`
- 放量继续 `scaling_continued`
- 推广周期结束 `ended`
- 放量淘汰 `formal_discarded`

阶段结束日期不能早于开始日期。

### 4. `operations_promotion_daily_metric`

一行代表某轮推广在某一天已经完成的一次日度复盘。


| 字段                        | 类型与限制                  | 作用        |
| ------------------------- | ---------------------- | --------- |
| `id`                      | UUID 主键                | 日度记录标识    |
| `campaign_id`             | 外键，级联删除                | 所属推广活动    |
| `metric_date`             | `date not null`        | 数据实际发生日期  |
| `stage_type_snapshot`     | `testing / scaling`    | 当天阶段快照    |
| `spend`                   | `numeric(12,2)`，非负     | 当天消耗      |
| `click_rate`              | 可空 `numeric(7,4)`       | 保留字段；日度复盘不填写 |
| `platform_open_count`     | 非负整数                   | 平台开口人数    |
| `actual_open_count`       | 非负整数                   | 实际开口人数    |
| `platform_lead_count`     | 非负整数                   | 平台留资人数    |
| `actual_lead_count`       | 非负整数                   | 实际留资人数    |
| `review_decision`         | 受阶段约束                  | 当天复盘后的下一步 |
| `reviewed_at`             | 带时区时间                  | 完成复盘时间    |
| `note`                    | 可为空文本                  | 备注        |
| `created_at / updated_at` | 带时区时间                  | 创建与更新时间   |


核心约束：

- `campaign_id + metric_date` 唯一，同一轮推广同一天只能有一条事实；
- 测试快照只能使用测试期的三个决定；
- 放量快照只能使用放量期的三个决定；
- 消耗和四项人数由数据库再次检查范围；点击率有值时仍限制在 `0—100`；
- `stage_type_snapshot` 保存当天事实，不随以后阶段改变；
- 删除推广活动时，阶段和日度记录级联删除。

### 5. 保存日度复盘时的事务

保存一条日度复盘时，系统按以下顺序执行：

1. 锁定对应推广活动，避免两个日期并发完成造成顺序错误；
2. 确认活动仍在测试或放量；
3. 根据最近一条日度记录计算本次唯一允许填写的日期；存在日度事实时取最新日期的下一天，不存在时取当前阶段的 `started_on`；
4. 校验复盘决定是否属于当前阶段；
5. 插入当日日度事实和阶段快照；
6. 如果发生转阶段或结束，关闭当前阶段；
7. 测试接放量时，从下一自然日创建放量阶段；
8. 更新推广活动的当前阶段、状态和结束日期；
9. 同步更新排期表的 `promotion_status`；
10. 全部成功后统一提交；任一步失败则整笔回滚。

完整状态转换：


| 当天阶段 | `review_decision`  | 下一日活动状态            | 下一日当前阶段   | 排期 `promotion_status` | 阶段处理             |
| ---- | ------------------ | ------------------ | --------- | --------------------- | ---------------- |
| 测试   | `test_continue`    | `testing`          | `testing` | `testing`             | 保持测试阶段           |
| 测试   | `start_scaling`    | `scaling`          | `scaling` | `scaling`             | 当天关闭测试，下一天创建放量阶段 |
| 测试   | `test_discarded`   | `test_discarded`   | `null`    | `test_discarded`      | 当天关闭测试并结束活动      |
| 放量   | `scaling_continue` | `scaling`          | `scaling` | `scaling`             | 保持放量阶段           |
| 放量   | `formal_discarded` | `formal_discarded` | `null`    | `formal_discarded`    | 当天关闭放量并结束活动      |
| 放量   | `ended`            | `ended`            | `null`    | `ended`               | 当天正常结束放量和活动      |


`current_stage` 只表示现在是否处于测试或放量，不能保存淘汰或结束结果；淘汰和结束写入 `campaign.current_status`，并同步到 `schedule.promotion_status`。

### 6. 排期状态与推广活动状态的关系

排期页面直接读取 `operations_content_schedule.promotion_status`，不根据阶段表临时计算。推广活动存在后，正常状态流转会在同一个事务中同步：

```text
日度 review_decision
→ 计算下一状态
→ campaign.current_stage
→ campaign.current_status
→ schedule.promotion_status
```

两个状态字段业务含义统一，但状态集合不完全相同：


| 业务场景     | `schedule.is_promoted` | `schedule.promotion_status` | `campaign.current_status` | `campaign.current_stage` |
| -------- | ---------------------- | --------------------------- | ------------------------- | ------------------------ |
| 非推广帖     | `false`                | `none`                      | 无活动                       | 无活动                      |
| 推广帖、尚未实发 | `true`                 | `pending`                   | 无活动                       | 无活动                      |
| 测试中      | `true`                 | `testing`                   | `testing`                 | `testing`                |
| 放量中      | `true`                 | `scaling`                   | `scaling`                 | `scaling`                |
| 正常结束     | `true`                 | `ended`                     | `ended`                   | `null`                   |
| 测试淘汰     | `true`                 | `test_discarded`            | `test_discarded`          | `null`                   |
| 放量淘汰     | `true`                 | `formal_discarded`          | `formal_discarded`        | `null`                   |


`none` 和 `pending` 当前只存在于排期层；活动表目前不允许 `pending`。因此“实发后暂不推广”尚不能由现有活动状态完整表达，是下一 Phase 需要调整的数据库逻辑。

### 7. 推广活动与阶段的创建逻辑

当前创建流程：

```text
is_promoted = false
→ schedule.promotion_status = none
→ 不创建推广活动

is_promoted = true，尚未实发
→ schedule.promotion_status = pending
→ 不创建推广活动

is_promoted = true，填写实发时间
→ 以实发日期创建 campaign.started_on
→ campaign.current_status = testing
→ campaign.current_stage = testing
→ 以同一天创建 testing stage.started_on
→ schedule.promotion_status = testing
```

现行规则已经拆开实发日期和测试开始日：实发后保持待开始推广，Campaign 与首个 Testing Stage 只在明确开始测试时建立。

### 8. 最新生命周期的读取逻辑

最新生命周期以 `operations_promotion_stage` 为阶段事实来源：

1. 截止日期固定为北京时间昨天；
2. 查找昨天存在有效测试或放量阶段的活动；
3. 阶段满足 `started_on <= 昨天`，且 `ended_on` 为空或不早于昨天；
4. 展示该活动截至昨天已经发生的测试和放量阶段；
5. 按各阶段自然日天数计算比例；
6. 今天开始的阶段、未来阶段和更早已经结束的活动不进入最新生命周期。

生命周期不读取六项日度指标，也不通过数值推测阶段。历史活动及其阶段统一在历史总览的帖子 Inspector 中查询；排期 Inspector 入口暂缓。

### 9. 待完成复盘的计算逻辑

“待完成复盘”不是数据库字段，而是页面根据活动、阶段和日度事实动态计算：

```text
活动仍有 current_stage
→ 找该活动最新一条 daily_metric.metric_date
→ 有记录：下一待填日 = 最新 metric_date + 1 天
→ 无记录：下一待填日应取当前 stage.started_on
→ 从下一待填日列到昨天
→ 最早一天可填写，后续日期锁定
```

保存 API 会以“最新日度事实的下一天；没有事实时取当前阶段开始日”作为权威顺序校验，不允许跳过更早日期。

页面和 API 已统一使用这条规则：没有任何日度事实时从当前开放阶段的 `stage.started_on` 开始，不再错误回退到整轮活动的 `campaign.started_on`。数据库迁移同时增加保护，同一活动最多只能有一个开放阶段，测试和放量阶段不得发生日期重叠；迁移应用前会先检查已有数据，发现冲突时主动失败。

### 10. 实发日期或推广身份变化时的重置

已有推广活动后，如果修改实发日期或取消推广身份：

1. 先只读统计受影响的推广活动数和日度事实数；
2. 页面明确提示删除影响并要求二次确认；
3. 确认后在同一个事务中删除该排期的推广活动；
4. 阶段和日度事实通过外键级联删除；
5. 如果仍是推广帖且保留实发时间，回到待开始推广，不自动创建活动；
6. 取消推广身份时，排期改为 `is_promoted = false`、`promotion_status = none`。

这是破坏性重置，不是历史更正；取消确认时不修改任何记录。

### 11. 各页面和字段的事实来源


| 页面内容      | 主要事实来源                                  | 说明              |
| --------- | --------------------------------------- | --------------- |
| 排期推广身份    | `schedule.is_promoted`                  | 是否曾属于推广帖        |
| 排期推广状态    | `schedule.promotion_status`             | 页面直接展示的同步状态     |
| 活动当前或最终状态 | `campaign.current_status`               | 与排期状态在活动存在后保持同步 |
| 活动当前阶段    | `campaign.current_stage`                | 只可能是测试、放量或空     |
| 最新及历史生命周期 | `promotion_stage`                       | 阶段起止日期和结果       |
| 已填日度指标    | `promotion_daily_metric`                | 一天一条不可重复事实      |
| 当天历史阶段    | `daily_metric.stage_type_snapshot`      | 不随以后阶段变化        |
| 下一待填日期    | 最新 `metric_date` 或当前 `stage.started_on` | 查询计算，不单独保存      |
| 实际开口/留资成本 | 日度消耗和实际人数                               | 页面计算，不保存        |
| 生命周期比例与天数 | 阶段起止日期                                  | 页面计算，不保存        |


### 12. 页面计算但不保存的值

以下值不作为独立数据库字段：

- 实际开口成本；
- 实际留资成本；
- 生命周期测试/放量百分比；
- 测试天数和放量天数汇总；
- 复盘完成率；
- “今天应填写昨天”的待办状态。

它们都可以从现有事实重新计算，避免同一含义保存两份后产生不一致。

## 六、已完成确认与最后交付事项

### 已完成确认

- 最新生命周期固定截止北京时间昨天；已填事实统一进入历史总览，每日复盘只保留连续待办队列。
- 页面和保存 API 已统一从当前开放阶段开始计算第一条待填日期，不再混用整轮活动开始日。
- 排期 `promotion_status` 与活动 `current_status` 在活动存在后表达同一当前或最终状态，并在正常写入事务中同步。
- `current_stage` 只表示当前开放的测试或放量阶段；活动结束或淘汰后为 `null`。
- 已在 development 数据库执行“每轮活动最多一个开放阶段、同轮阶段日期不得重叠”的迁移保护。
- 已确认发布不等于立即开始测试。最终状态链在 `pending` 和 `testing` 之间增加 `awaiting_promotion`（待开始推广）：

```text
pending
→ awaiting_promotion
→ testing
→ scaling
→ ended / test_discarded / formal_discarded
```

- `awaiting_promotion` 期间允许按日选择“当日未推广”，不填写六项推广指标；明确选择开始测试后才创建测试阶段。测试开始后不允许中途跳过，只能继续测试、测试淘汰或接放量；进入放量后只能继续、放量淘汰或正常结束。

### 最终交付结论

1. **已完成：导入数据库并检查**
   - `awaiting_promotion`、当日未推广游标、开始测试和可空点击率已落地；
   - 最新迁移已经在 Neon development 执行；
   - 51 条历史推广日度事实已经事务导入并完成完整幂等复检。
2. **已完成：历史编辑与双粒度总览**
  - 业务指标、备注和下一步允许更正，系统身份字段只读；
  - 状态链更正先提示影响，再由事务删除后续事实并重建生命周期；
  - 帖子 Inspector 承担已结束生命周期入口，排期 Inspector 已移至暂缓。
3. **已完成：数据库成型检查**
  - 复核内容身份、内容版本、发布排期、推广活动、推广阶段和推广日度事实的职责边界；
  - 确认实发日期、活动开始日、测试开始日以及 `awaiting_promotion` 跳过事实能够正确表达真实业务；
  - 根据真实数据确认同一排期是否需要支持多轮推广活动；
  - 完成结构检查、规则测试、页面验收和最终交付结论。

## 七、验证与当前边界

本阶段已经执行：

- `pnpm check`
- `pnpm test`
- `pnpm db:check`
- `pnpm build`
- Git diff 格式检查

Phase 05 边界外、由后续阶段处理：

- 非推广帖复盘；
- 周度、月度和年度推广汇总；
- Canva 首图同步；
- 正式登录、角色权限和完整操作者审计；
- 自动数据采集；
- 生产部署或生产数据库操作。

Phase 05 已正式完结。非推广、推广阶段复盘、周例会、月例会与会议中心统一进入 Phase 06 分步审视和实施。
