# 预排期默认设置与整月草稿

状态：已发布、已自检／待用户反馈。应用 e3928df，基线 2d07613，分支 codex/plan-defaults-draft。正式组件及实际 Vercel 运行包使用本机隔离 PostgreSQL 运行，截图、录像、PDF均为真实页面结果。

## 本次行为

拖入或选择计划后默认带入学科、分类与运营类型：

| 计划分类 | 默认运营类型 |
| --- | --- |
| 模考、推广讲义 | 推广后持续复盘 |
| 小班／一对一、大班、集训、面试课程 | 纯推广 |
| 其他分类 | 非推广常规 |

人工改选继续保留；已有帖子编辑与改版沿用原值。持续复盘最终日期仍由录入人填写。

“保存草稿”保存整月工作说明，管理员和员工刷新后都可接续，阶段保持原状。每篇帖子保存后的日期已实时入库。保存失败保留输入；慢保存期间新输入不会被覆盖或误标为已保存。保存反馈放在“本次说明”旁，避免按钮位于屏幕底部时看不到结果。

“更新核对清单”只重新读取已保存的排期、数量和核对依据，不保存正在填写的表单、不提交审批；“提交首轮排期核对”才进入待核对。

## 关键画面

- 默认设置1440px：[讲义](screenshots/default-handout-1440.png)／[模考](screenshots/default-mock-1440.png)／[课程](screenshots/default-course-1440.png)。
- 草稿1440px：[员工保存](screenshots/draft-employee-saved-1440.png)／[管理员续写](screenshots/draft-admin-saved-1440.png)／[失败保留输入](screenshots/draft-failure-1440.png)。
- 排期整页：[1920](screenshots/schedule-full-1920.png)／[1440](screenshots/schedule-full-1440.png)／[1024](screenshots/schedule-full-1024.png)。
- 月会原计划：[1920](screenshots/meeting-preplan-1920.png)／[1440](screenshots/meeting-preplan-1440.png)／[1024](screenshots/meeting-preplan-1024.png)；[封存后](screenshots/meeting-sealed-1024.png)。
- 390px仅检查明显问题：[排期](screenshots/schedule-mobile-390.png)／[Inspector关闭入口](screenshots/inspector-mobile-390.png)，不代表完整手机填写验收。

全部39张稳定图已查看；主要桌面布局三档实查，默认类型、草稿及异常状态在1440px实查。各状态具体画面见下方清单，不借用同页其他状态的结果。

## 录像、PDF与验证

[操作录像](video/workflow.webm)包含真实拖入、默认分类、人工覆盖、双方草稿刷新续写、503重试、慢保存新输入、键盘、提交退回及封存；全程按2fps抽帧查看。[首屏录像](video/first-paint.webm)覆盖直接进入、刷新、站内导航和慢字体，全程按10fps抽帧查看。检查图保存在 review/。

[预排期PDF](pdf/preplanned-monthly.pdf)、[封存PDF](pdf/sealed-monthly.pdf)各4页，实际服务端生成并逐页查看。密集21篇隔离样本含遗留、指定与长名；核对封存才切到实际3篇，原历史仍保留21篇。

[13组最终运行包回归](checks/browser.json)、[检查回执](checks/validation.json)：272项规则、类型检查、schema、Node与Vercel构建、共享UI通过。覆盖未保存保护、来源失败、待审防重复、封存后不可修改及角色权限。已修正初次复查中保存反馈位于视口外的问题；原始中间稿留在私有调试目录，归档全部来自最终运行包。

本轮用户授权的单项调整已独立复读核对：Week 2 面试课推广讲义帖移到 Week 1，总数21篇，分周4／5／6／5／1；未增加业务修改记录，月会历史版本保持。该操作与隔离样本无关。

## 发布结果

[正式排期页](https://qiuyun-frontend.vercel.app/business/operations-schedule)已指向部署dpl_HDwijqyHovS5oRWiLeJsoK3zDDPQ，READY且与候选一致。应用e3928df及验收证据已同步main；候选20项／11资源、正式20项／71资源哈希核对通过。[发布回执](release/release.json)／[正式检查](release/production.json)。

## 稳定画面清单

- [carry-original-form-1440](screenshots/carry-original-form-1440.png)：隔离样本，已自检／待用户反馈。
- [checklist-updated-1440](screenshots/checklist-updated-1440.png)：隔离样本，已自检／待用户反馈。
- [closed-1440](screenshots/closed-1440.png)：隔离样本，已自检／待用户反馈。
- [compact-weeks-1024](screenshots/compact-weeks-1024.png)：隔离样本，已自检／待用户反馈。
- [compact-weeks-1440](screenshots/compact-weeks-1440.png)：隔离样本，已自检／待用户反馈。
- [compact-weeks-1920](screenshots/compact-weeks-1920.png)：隔离样本，已自检／待用户反馈。
- [default-course-1440](screenshots/default-course-1440.png)：隔离样本，已自检／待用户反馈。
- [default-handout-1440](screenshots/default-handout-1440.png)：隔离样本，已自检／待用户反馈。
- [default-mock-1440](screenshots/default-mock-1440.png)：隔离样本，已自检／待用户反馈。
- [draft-admin-saved-1440](screenshots/draft-admin-saved-1440.png)：隔离样本，已自检／待用户反馈。
- [draft-employee-saved-1440](screenshots/draft-employee-saved-1440.png)：隔离样本，已自检／待用户反馈。
- [draft-failure-1440](screenshots/draft-failure-1440.png)：隔离样本，已自检／待用户反馈。
- [first-paint-direct-1440](screenshots/first-paint-direct-1440.png)：隔离样本，已自检／待用户反馈。
- [first-paint-navigation-1440](screenshots/first-paint-navigation-1440.png)：隔离样本，已自检／待用户反馈。
- [first-paint-reload-1440](screenshots/first-paint-reload-1440.png)：隔离样本，已自检／待用户反馈。
- [inspector-mobile-390](screenshots/inspector-mobile-390.png)：隔离样本，已自检／待用户反馈。
- [ledger-sealed-1440](screenshots/ledger-sealed-1440.png)：隔离样本，已自检／待用户反馈。
- [meeting-original-preplan-1024](screenshots/meeting-original-preplan-1024.png)：隔离样本，已自检／待用户反馈。
- [meeting-preplan-1024](screenshots/meeting-preplan-1024.png)：隔离样本，已自检／待用户反馈。
- [meeting-preplan-1440](screenshots/meeting-preplan-1440.png)：隔离样本，已自检／待用户反馈。
- [meeting-preplan-1920](screenshots/meeting-preplan-1920.png)：隔离样本，已自检／待用户反馈。
- [meeting-sealed-1024](screenshots/meeting-sealed-1024.png)：隔离样本，已自检／待用户反馈。
- [review-admin-1024](screenshots/review-admin-1024.png)：隔离样本，已自检／待用户反馈。
- [review-admin-1440](screenshots/review-admin-1440.png)：隔离样本，已自检／待用户反馈。
- [review-admin-1920](screenshots/review-admin-1920.png)：隔离样本，已自检／待用户反馈。
- [review-employee-1440](screenshots/review-employee-1440.png)：隔离样本，已自检／待用户反馈。
- [schedule-calendar-1024](screenshots/schedule-calendar-1024.png)：隔离样本，已自检／待用户反馈。
- [schedule-calendar-1440](screenshots/schedule-calendar-1440.png)：隔离样本，已自检／待用户反馈。
- [schedule-calendar-1920](screenshots/schedule-calendar-1920.png)：隔离样本，已自检／待用户反馈。
- [schedule-full-1024](screenshots/schedule-full-1024.png)：隔离样本，已自检／待用户反馈。
- [schedule-full-1440](screenshots/schedule-full-1440.png)：隔离样本，已自检／待用户反馈。
- [schedule-full-1920](screenshots/schedule-full-1920.png)：隔离样本，已自检／待用户反馈。
- [schedule-mobile-390](screenshots/schedule-mobile-390.png)：隔离样本，已自检／待用户反馈。
- [sealed-calendar-1024](screenshots/sealed-calendar-1024.png)：隔离样本，已自检／待用户反馈。
- [selection-compact-1440](screenshots/selection-compact-1440.png)：隔离样本，已自检／待用户反馈。
- [source-form-1440](screenshots/source-form-1440.png)：隔离样本，已自检／待用户反馈。
- [source-pending-1440](screenshots/source-pending-1440.png)：隔离样本，已自检／待用户反馈。
- [source-read-failure-1440](screenshots/source-read-failure-1440.png)：隔离样本，已自检／待用户反馈。
- [submit-failure-1440](screenshots/submit-failure-1440.png)：隔离样本，已自检／待用户反馈。

## 后续适用范围补正（2026-11-07）

本批验证分类默认与整月草稿。待核对禁改、常驻更新核对清单已由后续V0规则替换；当时未覆盖V0净构成及周会截止回放，不能借用为本轮通过证据。原图保留，当前见[新验收](../2026-11-07_04-15_schedule-v0/README.md)。
