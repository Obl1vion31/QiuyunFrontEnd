# 月计划回显与首轮排期工作区

后续补正：本批按周单一新做来源的样本未覆盖同周五种来源的实际密度。已由[紧凑周行验收](../2026-11-06_20-07_compact-preplan/README.md)补齐并收紧，原图保留，当前布局以新批次为准。

状态：已发布、已自检／待用户反馈。应用源码 ff3a64c，基线5933231，分支 codex/scheduling-workspace。全部页面、录像和PDF使用真实组件及最终Vercel运行包，数据来自同一隔离PostgreSQL虚构样本。

## 已修复行为

- 管理员核对封存前，月会保留完整21篇预排期，Week数量3／6／6／5／1；实际1篇作为独立数量。提交、退回、再次提交均不提前替换计划。
- 核对通过并封存时才以最终实际安排形成定稿；样本最终3篇，后续日常改期不反写，原21篇版本保留。
- 排期阶段、Week、原月历或台账、底部核对操作在同一外壳。Week纵向按日期排列，新做、遗留及指定帖在原周，已安排／待审不能再作为新建名额。
- 来源自动读取，失败才出现重试；键盘、真实拖放、原帖改期、同日确认及跨Week原因保留。空同日说明与常驻刷新来源移除。
- 撤下安排入口及列表移除，旧地址回到正常排期。用户授权的技术记录清理已独立核对，现有有效计划及其他业务事实保持；私有清理凭据不进入本公开归档。

## 桌面画面

| 视图／状态 | 1920px | 1440px | 1024px |
| --- | --- | --- | --- |
| 首轮工作区完整页 | [查看](screenshots/schedule-full-1920.png) | [查看](screenshots/schedule-full-1440.png) | [查看](screenshots/schedule-full-1024.png) |
| Week真实文字与数量局部 | [查看](screenshots/schedule-full-1920-weeks.png) | [查看](screenshots/schedule-full-1440-weeks.png) | [查看](screenshots/schedule-full-1024-weeks.png) |
| 原月历可用宽度 | [查看](screenshots/schedule-calendar-1920.png) | [查看](screenshots/schedule-calendar-1440.png) | [查看](screenshots/schedule-calendar-1024.png) |
| 月会封存前21篇 | [查看](screenshots/meeting-preplan-1920.png) | [查看](screenshots/meeting-preplan-1440.png) | [查看](screenshots/meeting-preplan-1024.png) |
| 管理员待核对 | [查看](screenshots/review-admin-1920.png) | [查看](screenshots/review-admin-1440.png) | [查看](screenshots/review-admin-1024.png) |

其余实际状态：

- 1440px：[员工待核对](screenshots/review-employee-1440.png)、[键盘来源原表单](screenshots/source-form-1440.png)、[遗留原帖改期](screenshots/carry-original-form-1440.png)、[来源503及重试](screenshots/source-read-failure-1440.png)、[名额待审](screenshots/source-pending-1440.png)、[清单更新](screenshots/checklist-updated-1440.png)、[提交503保留说明](screenshots/submit-failure-1440.png)、[封存台账](screenshots/ledger-sealed-1440.png)、[未开放月份](screenshots/closed-1440.png)。
- 1024px：[已封存排期](screenshots/sealed-calendar-1024.png)、[定稿实际3篇](screenshots/meeting-sealed-1024.png)、[原预排期历史21篇](screenshots/meeting-original-preplan-1024.png)。
- 1440px首屏：[直接进入](screenshots/first-paint-direct-1440.png)、[刷新](screenshots/first-paint-reload-1440.png)、[站内导航](screenshots/first-paint-navigation-1440.png)。
- 390px有限检查：[排期](screenshots/schedule-mobile-390.png)、[Inspector及关闭](screenshots/inspector-mobile-390.png)。只核查明显遮挡、页面溢出和关闭入口，不代表完整手机填写验收。

以上29张稳定截图及3张局部均已实际查看；各状态不借用同页其他模式的通过结果。

## 操作与PDF

- [完整操作录像](video/workflow.webm)：键盘、真实拖放、未保存保护、来源失败重试、同日确认、待审防重复、清单更新、提交失败／退回重交、管理员封存、台账及手机关闭。
- [首屏录像](video/first-paint.webm)：从首次绘制记录直接进入、刷新及站内导航，含字体慢请求；[逐帧坐标及内容](checks/scheduling-first-paint.json)。阶段与侧栏稳定，未出现部分安排覆盖计划。
- [预排期PDF](pdf/preplanned-monthly.pdf)与[封存PDF](pdf/sealed-monthly.pdf)：各4页，真实服务端生成并逐页渲染查看。计划页对照：[完整21篇](pdf/pages/preplanned-monthly-04.png)、[封存3篇](pdf/pages/sealed-monthly-04.png)。中文、Week顺序、长名、数量与网页一致，无裁切。
- 录像全段按流程4fps／首屏10fps生成连续帧，9组流程及6组首屏接触图已实际查看，见review目录；稳定图及PDF分别独立审查。

## 验证记录

[最终运行包11组浏览器回归](checks/browser.json)、[必要检查](checks/validation.json)、[运行包依赖及中文PDF](release/runtime-bundle.json)、[视觉复核](checks/visual-review.json)、[设计检测复核](checks/detector.json)。

270项规则、6项最终组件复验、类型／Node与Vercel构建、schema、0047→0048隔离兼容迁移、6组月度接口、公共UI通过。另完成17种公共月度首屏回归；专门的排期三路径首屏由本批录像与坐标记录单独覆盖。真实并发、旧响应、慢请求与失败均由隔离数据和故障注入验证，不向正式库写入虚构数据。

## 前次验收补正

[00-30批次](../2026-11-06_00-30_scheduling-review/README.md)未覆盖“完整21篇预排期／仅1篇实际安排”的真实入口，也未验收乱序、遗留／指定共同分周后的完整阅读。原通过结论不能证明这些状态，本批补齐并修复；旧图、录像和PDF保留，不作为当前外观。

## 发布核对

[正式工作台](https://qiuyun-frontend.vercel.app/business/operations-schedule)已指向部署 dpl_6b4MKaoZvBSLYzGYmTmR35JrZHpp，READY，与候选部署一致。应用源码ff3a64c已同步main；候选20项／11个关键资源、正式20项／71个资源哈希核对通过，包含登录保护、同源表单、跨站拒绝和新排期资源。[发布回执](release/release.json)、[正式检查](release/production.json)。
