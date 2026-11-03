# 周月例会局部调整与排期左右对照

状态：**已完成功能与视觉自检，待本轮视觉反馈，尚未发布。** 不上传私有预览页。

本批空跑来源的常显链接／整轮金额、固定宽名额卡及常显分周选择已按后续反馈由[轻量分周板](../2026-11-03_15-20_compact-month-plan/README.md)替代；旧图保留作迭代记录，不作为这些区域当前的视觉验收效果。其余周会趋势及月会组织延续。

本批图片来自实际运行页面及隔离 PGlite 夹具，不代表正式业绩；完整页面为真实保存并会后定稿的 V1，操作图另记录草稿、部分分配与失败状态。分支 `codex/meeting-visual-samples`，基线 `0ec7d81`；当前源码哈希见 [manifest](checks/source-manifest.json)，保留仓库原有未提交修改。

## 直接查看

- **[完整周会 · 1440px](screenshots/weekly-final-full-1440.png)** · **[完整月会 · 1440px](screenshots/monthly-final-full-1440.png)**
- **[排期左右对照 · 含遗留、已分配与待分配](screenshots/flow-plan-partial-1440.png)** · [1920px](screenshots/flow-plan-partial-1920.png) · [1024px](screenshots/flow-plan-partial-1024.png)
- [周会手机完整页](screenshots/weekly-final-full-390.png) · [月会手机完整页](screenshots/monthly-final-full-390.png) · [手机部分分配](screenshots/flow-plan-partial-390.png)
- 留资图：[鼠标悬停](screenshots/weekly-lead-hover-1440.png) · [键盘](screenshots/weekly-lead-keyboard-1440.png) · [手机触屏](screenshots/weekly-lead-touch-390.png)
- 空跑完整来源：[桌面抽屉](screenshots/waste-sources-1440.png) · [320px滚到底](screenshots/waste-sources-bottom-320.png)
- [周会PDF · 3页](pdf/weekly.pdf) · [月会PDF · 8页](pdf/monthly.pdf)；[逐页渲染](pdf/pages/)

## 录像

- **[月计划真实拖放、移回、分周与保存](videos/plan-flow.mp4)**：约第7–13秒是确认数量、部分分配、移回、分完、确认保存及重新分周；后续保留月历落实、审批和锁定回归。
- **[周会趋势、月会全部来源及完整页面](videos/weekly-and-monthly.mp4)**：约第24–27秒为来源抽屉，第28–29秒为留资点位气泡。录制包含真实视口切换，灰色部分为录像画布外区域。
- [手机触屏查看留资点](videos/touch-trend.mp4) · [月度运营切月桌面](videos/monthly-desktop.mp4) · [月度运营切月手机](videos/monthly-phone.mp4) · [手机输入保护](videos/plan-phone.mp4)

六段录像均全程连续抽帧检查：长片2fps，短片4fps，共44张联系图，具体时长及采样率见 [元数据](checks/video-metadata.json)；[连续帧](video-review/)。稳定截图另行检查，不把动画中间帧当作最终效果。

## 本批结果

- 周会右图改为同原帖、同阶段的真实定稿留资成本，跨V0/V1，最多四个有效历史点与本次；相同版本和统计区间按实际定稿时间取最新有效结果。旧快照格式兼容，不使用累计摘要冒充点位；无历史明确置灰，未知成本不画零。
- 月会执行仅保留左侧发布分布及右侧四卡，两种延期率共用已登记分母；提醒留在下方。投入去向迁至学科／分类区，月度运营继续使用原有双图，两页复用共享面板。
- 空跑按消耗月生成包含所选月的五个月序列，缺月断线、真实零保留，少于两个有效点不画趋势；一次读取事实，不逐月请求数据库。默认来源最多三条，完整名单用公共只读Sheet，手机单层滚动、Esc和焦点返回已测。PDF保留全部来源，分类图与学科卡没有拆开分页。
- 月计划每个稳定名额独立卡片，桌面约240px且不超过260px；左侧所有Week，右侧按来源组织待分配池，拖入减少、支持移回与原生选择。遗留、审批、48小时、锁定及重排身份保持。
- 可选序列进入材料指纹与新定稿快照；刷新材料保留人工输入，旧定稿不补实时历史。无数据库结构或路由变更。

## 覆盖与实际自检

| 视图／关键状态 | 1920 | 1440 | 1024 | 390 | 320 |
| --- | --- | --- | --- | --- | --- |
| 周会完整定稿、推广跨版本趋势／无历史、非推广对照 | 通过 | 通过 | 通过 | 通过 | 通过 |
| 月会完整定稿、执行四卡、空跑断月／零值、投入移位 | 通过 | 通过 | 通过 | 通过 | 通过 |
| 计划部分分配（含遗留）、全分完、确认后卡片 | 通过 | 通过 | 通过 | 通过 | 通过 |
| 完整来源抽屉与滚动、Esc／焦点返回 | — | 通过 | — | 通过 | 通过 |
| 图点悬停／键盘、手机点击／触屏 | — | 通过 | — | 通过 | — |

实际查看整页和局部文字、宽度与层级，复核来源列表高度、卡片宽度及左右接收区；PDF共11页逐页检查，正文、图形、版本与来源完整。181张稳定和过程图归档于 `screenshots/`，不是以数量替代视觉判断。

## 已执行检查

- `pnpm test`：259项通过；[日志](checks/meeting-followup-rules.log)。留资成本／空跑目标测试12项通过：[日志](checks/meeting-followup-final-unit.log)。
- `pnpm db:check`：[通过](checks/meeting-followup-db.log)。`pnpm build`含类型检查：0 errors、0 warnings、25条既有hints，[日志](checks/meeting-followup-final-build.log)。
- 公共UI、月度运营、17个首屏场景、月计划隔离接口与浏览器全链路、例会展示与真实PDF均通过；日志位于 [checks](checks/)。
- 月计划覆盖确认失败保留、拖入／移回、全分完、延迟保存、重排ID、月历落实、员工待审／驳回、48小时及首次周会锁定。统计覆盖测试／放量隔离、同区间去重、跨版本、缺月／零值与跨月消耗；冻结材料随版本读取。

原始调试输出位于 `.tools/test-artifacts/meeting-followup-render-final` 与 `.tools/test-artifacts/meeting-followup-plan-final`。本轮没有迁移、生产数据写入、提交推送或部署；先提供截图与操作效果，按用户本轮反馈决定发布。
