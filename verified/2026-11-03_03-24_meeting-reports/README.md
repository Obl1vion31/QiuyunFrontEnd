# 例会趋势、展示卡片与三步月计划

后续局部替换：逐帖日消耗图、月会执行双图、空跑历史与来源、计划卡片宽度及分配池已由 [2026-11-03 14:18 批次](../2026-11-03_14-18_meeting-followup/README.md) 接续；本批旧证据保留，不再代表上述模块的当前效果。其余已认可字体与视觉保持。

状态：**已完成本机功能与视觉自检，待本轮视觉反馈；尚未提交、推送或发布。** 按用户要求不上传私有预览页。

截图为实际运行页面，数据来自隔离PGlite／PostgreSQL夹具，不代表正式运营业绩。最终整页为真实保存并会后定稿的V1；过程图保留草稿、修订及故障状态，不混作最终定稿。

## 直接查看

- **[周会完整页1440px](screenshots/weekly-final-full-1440.png)** · **[月会完整页1440px](screenshots/monthly-final-full-1440.png)**
- 月计划：[确认数量／新做2＋遗留1](screenshots/flow-carry-candidate-1440.png) → [分配Week](screenshots/flow-plan-distributed-1440.png) → [确认后的小卡片](screenshots/flow-monthly-plan-edit-1440.png)
- 手机：[周会推广](screenshots/weekly-promotion-390.png) · [7／15天](screenshots/weekly-non-promotion-390.png) · [月会核心](screenshots/monthly-section-core-390.png) · [分类投入](screenshots/monthly-section-categories-390.png) · [数量](screenshots/flow-plan-quantity-390.png) · [分Week](screenshots/flow-plan-weeks-390.png)
- [周会PDF，3页](pdf/weekly.pdf) · [月会PDF，7页](pdf/monthly.pdf)

## 本批实现

- 周会主结果使用本期全量推广日度事实，和前一个等长区间比较；近四周趋势为截至本期末的四个连续七天区间。缺数不补零，成本按总消耗／总人数计算，阶段候选仍按原规则独立引用。旧冻结材料缺少新统计时沿用原展示。
- 四个结果子卡与推广／非推广卡使用白底、浅雾色和轻边界形成层次，沿用MiSans。逐帖主要指标及pp直接可见，推广右侧显示真实日消耗；详细基准、样本及历史仍可展开。不同日期的非推广累计量不相加。
- 月会执行概览复用月度运营的同一双图组件；空跑按总量／较上月／月内周分布与来源组织，默认显示前五条、可查看全部。学科及帖子分类投入使用图形卡与加权成本，原始来源可追溯。
- 月计划为“确认数量→分配到周→确认安排”；新做2篇另选遗留1篇即共3篇，已有本月排期消耗新做名额。拖动和Week下拉共用稳定名额；重排只清周次，不清真实关联。保存成功才进入确认态；失败保留输入。原审批、48小时、追加与周会锁定保留。
- 月度运营不同月份成功显示时重播图形，同月刷新、筛选和局部保存不重播；慢请求保留旧图，旧响应不能覆盖新选择。减少动态效果直接显示终值。

## 已检查的覆盖

五档均独立运行，表中“图”链接各自视图，不能借用相邻模式代表通过。稳定图另外查看；录像覆盖完整过程，逐段抽帧审查。整页手机长图保留真实固定导航，阅读局部请用模块图及录像。

| 视图／状态 | 1920px | 1440px | 1024px | 390px | 320px |
| --- | --- | --- | --- | --- | --- |
| 周会真实V1整页 | [图](screenshots/weekly-final-full-1920.png) | [图](screenshots/weekly-final-full-1440.png) | [图](screenshots/weekly-final-full-1024.png) | [图](screenshots/weekly-final-full-390.png) | [图](screenshots/weekly-final-full-320.png) |
| 月会真实V1整页 | [图](screenshots/monthly-final-full-1920.png) | [图](screenshots/monthly-final-full-1440.png) | [图](screenshots/monthly-final-full-1024.png) | [图](screenshots/monthly-final-full-390.png) | [图](screenshots/monthly-final-full-320.png) |
| 推广卡／日消耗 | [图](screenshots/weekly-promotion-1920.png) | [图](screenshots/weekly-promotion-1440.png) | [图](screenshots/weekly-promotion-1024.png) | [图](screenshots/weekly-promotion-390.png) | [图](screenshots/weekly-promotion-320.png) |
| 7／15天对照 | [图](screenshots/weekly-non-promotion-1920.png) | [图](screenshots/weekly-non-promotion-1440.png) | [图](screenshots/weekly-non-promotion-1024.png) | [图](screenshots/weekly-non-promotion-390.png) | [图](screenshots/weekly-non-promotion-320.png) |
| 零阅读／未到期 | [图](screenshots/weekly-future-1920.png) | [图](screenshots/weekly-future-1440.png) | [图](screenshots/weekly-future-1024.png) | [图](screenshots/weekly-future-390.png) | [图](screenshots/weekly-future-320.png) |
| 长金额，不拆数字 | [图](screenshots/weekly-long-amount-1920.png) | [图](screenshots/weekly-long-amount-1440.png) | [图](screenshots/weekly-long-amount-1024.png) | [图](screenshots/weekly-long-amount-390.png) | [图](screenshots/weekly-long-amount-320.png) |
| 数量与遗留 | [图](screenshots/flow-plan-quantity-1920.png) | [图](screenshots/flow-carry-candidate-1440.png) | [图](screenshots/flow-plan-quantity-1024.png) | [图](screenshots/flow-plan-quantity-390.png) | [图](screenshots/flow-plan-quantity-320.png) |
| Week分配 | [图](screenshots/flow-plan-weeks-1920.png) | [图](screenshots/flow-plan-distributed-1440.png) | [图](screenshots/flow-plan-weeks-1024.png) | [图](screenshots/flow-plan-weeks-390.png) | [图](screenshots/flow-plan-weeks-320.png) |
| 确认安排／小卡片 | [图](screenshots/flow-monthly-plan-edit-1920.png) | [图](screenshots/flow-monthly-plan-edit-1440.png) | [图](screenshots/flow-monthly-plan-edit-1024.png) | [图](screenshots/flow-monthly-plan-edit-390.png) | [图](screenshots/flow-monthly-plan-edit-320.png) |
| 待审／实际落实 | [图](screenshots/flow-plan-execution-review-status-1920.png) | [图](screenshots/flow-plan-execution-review-status-1440.png) | [图](screenshots/flow-plan-execution-review-status-1024.png) | [图](screenshots/flow-plan-execution-review-status-390.png) | [图](screenshots/flow-plan-execution-review-status-320.png) |

其他关键状态：

- 月会手机各模块：[执行390](screenshots/monthly-section-execution-390.png)／[320](screenshots/monthly-section-execution-320.png)、[空跑390](screenshots/monthly-section-waste-390.png)／[320](screenshots/monthly-section-waste-320.png)、[计划390](screenshots/monthly-section-plan-390.png)／[320](screenshots/monthly-section-plan-320.png)。
- 1440px实际修改、后台保存、接续修订、只读切换、确认失败保留与重试；[失败图](screenshots/flow-plan-confirm-failure-1440.png)。真实拖动、重排、首次定稿、月历建帖／遗留改期、审批和周会锁定均走原接口。
- 1440／390px：11→10→11、慢请求、快速切月、同月刷新、失败保留和减少动态效果；[桌面记录](checks/monthly-motion-1440.json)／[手机记录](checks/monthly-motion-390.json)。
- 390px触屏：详情展开、指标修改保存、原焦点与列表连续性；320px减少动态效果。首屏另检查直接进入、刷新、站内导航、慢字体及提醒加载，17场景结果见检查日志。
- 本批共167张网页截图。已打开最终整页、关键原图与手机模块，并实际审查六段录像覆盖全时长的25张抽帧联络图；不是只检查生成成功。

## 录像与PDF

| 录像 | 内容 |
| --- | --- |
| [周／月完整桌面过程](videos/reports-desktop.mp4) | 草稿、编辑保存、比较、长金额及五档页面 |
| [手机例会](videos/meetings-mobile.mp4) | 月会对照、周会节点与详情展开 |
| [桌面切月](videos/month-change-desktop.mp4) | 不同月份动效、慢／旧响应、刷新与减少动态效果 |
| [手机切月](videos/month-change-mobile.mp4) | 触屏及视口外进入播放 |
| [排期完整流程](videos/plan-flow-desktop.mp4) | 数量、遗留、拖放、失败重试、定稿、落实、审批及锁定 |
| [手机私域保存](videos/plan-flow-mobile.mp4) | 真实输入、未保存确认和保存回显 |

录像来源及完整时长见[来源记录](checks/video-sources.json)，抽帧保存在`video-review/`。录制过程中调整视口时，视频画布的灰色补边不属于网页。

PDF先通过真实“会后定稿”与下载流程验证，再用该次冻结快照及最后构建的同一渲染器生成归档版本；最后修正仅涉及打印分页。周会3页、月会7页逐页打开检查，指标／趋势／空跑柱图不跨页切断：

- 周会：[1](pdf/weekly-1.png)／[2](pdf/weekly-2.png)／[3](pdf/weekly-3.png)
- 月会：[1](pdf/monthly-1.png)／[2](pdf/monthly-2.png)／[3](pdf/monthly-3.png)／[4](pdf/monthly-4.png)／[5](pdf/monthly-5.png)／[6](pdf/monthly-6.png)／[7](pdf/monthly-7.png)

## 实际验证与代码对应

| 检查 | 结果 |
| --- | --- |
| `pnpm test` | 256项通过，[日志](checks/rules.log) |
| 新统计与PDF单测 | 5项通过，[日志](checks/unit-final.log) |
| `pnpm test:monthly-workflow` | 隔离接口与完整浏览器通过，[日志](checks/workflow.log) |
| `pnpm test:monthly-workflow:postgres` | 真实PG兼容、唯一占用及锁定并发通过，[日志](checks/postgres.log) |
| `pnpm test:meeting-display` | 展示／动效／保存／真实定稿PDF通过，[日志](checks/display-final.log) |
| `pnpm test:ui` | 共享UI通过，[日志](checks/ui.log) |
| `pnpm test:first-paint` | 17场景通过，[日志](checks/first-paint.log) |
| `pnpm db:check` | 通过，[日志](checks/db-check.log) |
| 类型检查与构建 | 0错误、0警告，保留25项既有提示；[日志](checks/build.log) |

实现位于分支`codex/meeting-visual-samples`，本机起点`0ec7d81`；当前工作树包含接续任务的未提交改动，文件内容以[SHA-256](checks/source-sha256.json)对应。冻结数据保存在[周会快照](checks/weekly-snapshot.json)及[月会快照](checks/monthly-snapshot.json)。测试未向正式库写入虚构数据；临时PG已停止。本轮无需迁移。

复现入口与夹具说明见仓库`tests/README.md`。本批替代01:27及23:35的外观判断；旧证据保留，已补正说明。发布仍遵从本轮先看完整效果的约定。
