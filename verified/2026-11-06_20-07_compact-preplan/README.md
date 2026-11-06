# 预排期五条紧凑行

状态：已自检／待用户反馈，候选检查通过，待正式域名核对。最终应用fd96de4，基线2f1a469（应用ff3a64c），分支codex/compact-preplan-rows。界面、录像与PDF均使用正式组件和实际Vercel运行包，全部样本在本机隔离PostgreSQL，未向正式库写入测试数据。

## 实际变化与高度对照

五周默认全可见：左208px集中Week、日期及数量，右侧紧接36px帖子标签；取消每周灰色大卡，周间细分割线。长名只在所属周换行；遗留当前日期、安排与待审状态仍可读。阶段标题20px／总数16px，说明有空间时同行；选择与拖放说明共用36px底栏，取消选择恢复说明，日历不因选择跳动。

同一21篇样本按3／6／6／5／1分周，显示来源3／5／3／4／1组，包含长名、遗留及指定。以下高度为阶段头加预排期区域，实测日历可用宽度逐档保持一致：

| 视口 | 修改前 | 修改后 | 减少 | 真实前后画面 |
| --- | --- | --- | --- | --- |
| 1920px | 734px | 429px | 41.6% | [之前](before/before-workspace-1920.png)／[之后](screenshots/workspace-1920.png) |
| 1440px | 734px | 463px | 36.9% | [之前](before/before-workspace-1440.png)／[之后](screenshots/workspace-1440.png) |
| 1024px | 899px | 649px | 27.8% | [之前](before/before-workspace-1024.png)／[之后](screenshots/workspace-1024.png) |

[原始测量](checks/comparison.json)。对照均为相同隔离样本直接运行渲染，未修改DOM、未拼造页面。月会阅读、PDF布局、API和数据库结构保持。

## 关键画面

- 排期整页：[1920](screenshots/schedule-full-1920.png)／[1440](screenshots/schedule-full-1440.png)／[1024](screenshots/schedule-full-1024.png)；Week原尺寸：[1920](screenshots/compact-weeks-1920.png)／[1440](screenshots/compact-weeks-1440.png)／[1024](screenshots/compact-weeks-1024.png)。
- 1440px：[选择及紧凑取消按钮](screenshots/selection-compact-1440.png)、[原录入表单](screenshots/source-form-1440.png)、[遗留原帖改期](screenshots/carry-original-form-1440.png)、[待审名额](screenshots/source-pending-1440.png)、[来源失败](screenshots/source-read-failure-1440.png)、[清单更新](screenshots/checklist-updated-1440.png)、[提交失败保留输入](screenshots/submit-failure-1440.png)、[员工待核对](screenshots/review-employee-1440.png)。
- 管理员核对操作：[1920](screenshots/review-admin-1920.png)／[1440](screenshots/review-admin-1440.png)／[1024](screenshots/review-admin-1024.png)；[封存台账1440](screenshots/ledger-sealed-1440.png)、[未开放月份1440](screenshots/closed-1440.png)、[已封存及空周1024](screenshots/sealed-calendar-1024.png)。
- 月会原阅读结构：[1920](screenshots/meeting-preplan-1920.png)／[1440](screenshots/meeting-preplan-1440.png)／[1024](screenshots/meeting-preplan-1024.png)；[最终3篇](screenshots/meeting-sealed-1024.png)、[历史21篇](screenshots/meeting-original-preplan-1024.png)。
- 首屏1440px：[直接进入](screenshots/first-paint-direct-1440.png)／[刷新](screenshots/first-paint-reload-1440.png)／[站内导航](screenshots/first-paint-navigation-1440.png)；390px仅检查明显问题：[排期](screenshots/schedule-mobile-390.png)／[Inspector关闭](screenshots/inspector-mobile-390.png)，不代表完整手机填写验收。

最终33张稳定画面及三档区域裁图已自检。取消按钮在首轮复查中发现浏览器默认样式，已修正后使用最终运行包重新回归，归档采用修正后的实际捕获。

## 操作、PDF与验证

[操作录像](video/workflow.webm)覆盖点击／取消、键盘、真实拖放、原帖改期、未保存保护、待审防重复、来源503及慢响应、更新清单、保存／提交失败、退回重交、管理员封存及模式切换。[首屏录像](video/first-paint.webm)覆盖从首次绘制开始的直接进入、刷新及站内导航，含慢字体；[坐标记录](checks/first-paint.json)。流程4fps共13组、首屏10fps共7组连续帧已实际查看，review目录保存检查图。

[完整预排期PDF](pdf/preplanned-monthly.pdf)、[定稿PDF](pdf/sealed-monthly.pdf)各4页，实际服务端生成，8页逐页渲染查看。月会与PDF继续原阅读结构，封存与历史数量仍分别3／21。

[最终运行包11组回归](checks/browser.json)、[必要检查](checks/validation.json)、[运行包依赖与中文PDF](release/runtime-bundle.json)：271项规则、公共UI、schema、类型及Node／Vercel构建通过。首轮与最终样式分别完成实际浏览器回归，最终检查无页面错误。保留源工作区无关修改，无迁移。

## 前批补正

[前批排期验收](../2026-11-06_19-21_scheduling-workspace/README.md)的样本按周使用单一新做来源，没有覆盖截图中同周五种来源的密度；本批换成16组来源的21篇样本并保留同样本前后证据。旧图及记录保留，当前密度以本批为准。
