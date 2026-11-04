# 统一工作台页面宽度

状态：已自检并发布；发布结果见[正式核对](release/README.md)。应用源码 `c6ee76d`，含远端月计划数量控件更新；其后仅归档与交接。

七模块统一沿公共工作区全宽、桌面左右24px组织。推广/会议去独立限宽，月度接公共main并去重复padding，授权表全宽且控件就近；1024px账号角色/状态与长金额已修正并复验。规范与真实接入例同步更新。

## 跨页对照

| 页面 | 2560 | 1920 | 1440 | 1024 |
| --- | --- | --- | --- | --- |
| 总周期规划 | [图](screenshots/workspace/annual-plan-2560.png) | [图](screenshots/workspace/annual-plan-1920.png) | [图](screenshots/workspace/annual-plan-1440.png) | [图](screenshots/workspace/annual-plan-1024.png) |
| 排期管理 | [图](screenshots/workspace/operations-schedule-2560.png) | [图](screenshots/workspace/operations-schedule-1920.png) | [图](screenshots/workspace/operations-schedule-1440.png) | [图](screenshots/workspace/operations-schedule-1024.png) |
| 推广帖复盘 | [图](screenshots/workspace/daily-promotion-review-2560.png) | [图](screenshots/workspace/daily-promotion-review-1920.png) | [图](screenshots/workspace/daily-promotion-review-1440.png) | [图](screenshots/workspace/daily-promotion-review-1024.png) |
| 非推广复盘 | [图](screenshots/workspace/non-promotion-review-2560.png) | [图](screenshots/workspace/non-promotion-review-1920.png) | [图](screenshots/workspace/non-promotion-review-1440.png) | [图](screenshots/workspace/non-promotion-review-1024.png) |
| 例会总览 | [图](screenshots/workspace/meeting-review-2560.png) | [图](screenshots/workspace/meeting-review-1920.png) | [图](screenshots/workspace/meeting-review-1440.png) | [图](screenshots/workspace/meeting-review-1024.png) |
| 月度运营 | [图](screenshots/workspace/monthly-operations-2560.png) | [图](screenshots/workspace/monthly-operations-1920.png) | [图](screenshots/workspace/monthly-operations-1440.png) | [图](screenshots/workspace/monthly-operations-1024.png) |
| 系统设置·操作授权 | [图](screenshots/workspace/settings-2560.png) | [图](screenshots/workspace/settings-1920.png) | [图](screenshots/workspace/settings-1440.png) | [图](screenshots/workspace/settings-1024.png) |

[实际正文及一级内容坐标](validation/geometry.json)：七档105个状态，最大偏差0px，包含1920px真实侧栏点击七模块；不以空外壳或padding声明代替。其他视图截图位于[screenshots/workspace](screenshots/workspace/)，桌面1920/1024接触表位于[review](review/)。

## 关键状态

- 推广[帖子历史](screenshots/workspace/daily-promotion-review-view-history-1920.png)／[日历史](screenshots/workspace/daily-promotion-review-view-history-mode-day-1920.png)；非推广[分类均值](screenshots/workspace/non-promotion-review-view-history-group-1-1920.png)／[历史平铺](screenshots/workspace/non-promotion-review-view-history-group-0-1920.png)／[不复盘](screenshots/workspace/non-promotion-review-view-skipped-1920.png)。
- 周/月例会不是用总览空态代替：[周会正文](screenshots/meeting/weekly-promotion-2560.png)、[周会只读整页](screenshots/meeting/weekly-read-full-1920.png)、[月会草稿](screenshots/meeting/monthly-draft-2560.png)、[月会只读](screenshots/meeting/monthly-read-1920.png)、[月会编辑整页](screenshots/meeting/monthly-edit-full-1440.png)、[月计划编辑](screenshots/meeting/monthly-plan-edit-1440.png)。
- 月度运营[管理员长金额](screenshots/monthly/admin-overview-2560.png)／[员工同数据](screenshots/monthly/employee-overview-2560.png)／[空月](screenshots/monthly/admin-empty-1920.png)／[读取中](screenshots/monthly/loading-1440.png)／[刷新失败](screenshots/monthly/read-failure-1440.png)／[初始读取失败](screenshots/monthly/initial-read-failure-1440.png)／[恢复](screenshots/monthly/initial-read-recovered-1440.png)。
- 1024px修正结果：[长金额](screenshots/monthly/admin-promotion-1024.png)及[横滚右侧](screenshots/monthly/admin-promotion-right-1024.png)、[账号角色与状态](screenshots/workspace/settings-view-accounts-1024.png)。手机只核查明显回归，沿用桌面优先规则。

## 验证

- 类型检查、Node/Vercel构建、261项规则、schema、公共UI、月度运营/延期与非空例会回归通过；Inspector键盘、开合、草稿保护、失败重试和原位回显沿用真实公共UI流程。日志在[validation](validation/)。
- 本批归档151张最终业务截图、36张首屏/提醒截图，已实际审查的视图与视口见[覆盖记录](validation/visual-coverage.json)（接触表与关键单图）；独立复核发现的两项拆行已修正。首屏17场景于公共宽度完成时录制，后续只改表格数字及账号列，未重复首屏专项。
- [切页录像](video/navigation.mp4)、[公共UI与Inspector](video/inspector.mp4)、[月度操作](video/monthly.mp4)、[桌面慢请求首屏](video/first-paint-desktop.mp4)、[手机慢请求首屏](video/first-paint-mobile.mp4)，连续取样共159帧，已查看。末页以各模块稳定截图和坐标记录核对；过程帧不作为稳定效果。
- 最终运行包依赖、Chromium和中文字体核对通过，生成[月会5页](release/runtime-monthly.pdf)与[周会3页](release/runtime-weekly.pdf)，8页渲染已查看。Impeccable仅保留既有例会选中标记的3px侧线告警，未改已确认样式。

数据来源为隔离PGlite测试内容，网络延迟/失败仅作故障注入。业务API、模型、节点及统计口径保持；无迁移或生产业务写入。源码哈希见[source.json](validation/source.json)。
