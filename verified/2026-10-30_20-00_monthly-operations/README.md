# 月度运营看板第一版

已自检并发布，待使用反馈；归档时间为北京时间。正式组件及隔离PGlite虚构数据，截图中的大额消耗仅用于长数字验收，不是实际经营结果。390／320px为Chromium模拟触屏。

## 本轮交付

- 两角色共用自然月看板，桌面侧栏与手机账号菜单进入；应发／实发／消耗分别按自身日期归月，延期按当前有效排期，运营原因按任务去重。
- 超过48小时未登记、改期未登记及移出本月可追溯；按时、正常待发不显示欠归因。改期继续清旧原因，无负责人或月初计划快照。
- 消耗按真实日度事实，空跑只含明确失败轮次及残留，失败V0改V1可追溯；放量淘汰不反推测试失败，分类成本按总量相除。缺失、真实零值分开，待补日期可展开。
- 图形首次可见播放，修正SSR满条后缩回的初始闪动；筛选不重播。手机金额、数量和单位完整分组，完整日期不拆开。
- 月会六块后续方向已记录现有ROADMAP；本月先交付看板。

## 实际验证

233项规则、数据库结构检查、Node构建、Vercel类型检查／构建、运行包中文PDF、月度专项、公共UI、当前发布、最新排期延期和推广生命周期回归通过。[月度结果](result.json)／[日志](logs/)。学科与分类筛选、分类组成、图形钻取、原记录定位、503保留重试、慢响应隔离、跨上海午夜及双角色同数据均实际执行。

旧综合 `test:workflows` 尚未接入当前完整租约／指纹协议，本轮未计为通过；调试输出保留在[旧脚本记录](logs/legacy-workflows-not-passed.log)。当前发布与改期路径分别由现行发布专项、最新排期延期专项及规则测试验证。

53张稳定截图按视图、状态和宽度实际查看，并结合[整组联系图](review-sheets/)检查整体比例、长名称／分类、数值、父子边界及手机横滚。公开核对未写业务数据，无数据库迁移。

| 视图 / 状态 | 1920 | 1440 | 1024 | 390 | 320 |
| --- | --- | --- | --- | --- | --- |
| 管理员概览 | [查看](screenshots/admin-overview-1920.png) | [查看](screenshots/admin-overview-1440.png) | [查看](screenshots/admin-overview-1024.png) | [查看](screenshots/admin-overview-390.png) | [查看](screenshots/admin-overview-320.png) |
| 分布图 | [查看](screenshots/admin-charts-1920.png) | [查看](screenshots/admin-charts-1440.png) | [查看](screenshots/admin-charts-1024.png) | [查看](screenshots/admin-charts-390.png) | [查看](screenshots/admin-charts-320.png) |
| 混合归因展开 | [查看](screenshots/admin-publication-expanded-1920.png) | [查看](screenshots/admin-publication-expanded-1440.png) | [查看](screenshots/admin-publication-expanded-1024.png) | [查看](screenshots/admin-publication-expanded-390.png) | [查看](screenshots/admin-publication-expanded-320.png) |
| 分类与消耗组成 | [查看](screenshots/admin-promotion-1920.png) | [查看](screenshots/admin-promotion-1440.png) | [查看](screenshots/admin-promotion-1024.png) | [查看](screenshots/admin-promotion-390.png) | [查看](screenshots/admin-promotion-320.png) |
| 测试空跑 | [查看](screenshots/admin-wasted-1920.png) | [查看](screenshots/admin-wasted-1440.png) | [查看](screenshots/admin-wasted-1024.png) | [查看](screenshots/admin-wasted-390.png) | [查看](screenshots/admin-wasted-320.png) |
| 待补日期展开 | [查看](screenshots/admin-gaps-1920.png) | [查看](screenshots/admin-gaps-1440.png) | [查看](screenshots/admin-gaps-1024.png) | [查看](screenshots/admin-gaps-390.png) | [查看](screenshots/admin-gaps-320.png) |
| 空月份 | [查看](screenshots/admin-empty-1920.png) | [查看](screenshots/admin-empty-1440.png) | [查看](screenshots/admin-empty-1024.png) | [查看](screenshots/admin-empty-390.png) | [查看](screenshots/admin-empty-320.png) |
| 真实零值 | [查看](screenshots/admin-zero-1920.png) | [查看](screenshots/admin-zero-1440.png) | [查看](screenshots/admin-zero-1024.png) | [查看](screenshots/admin-zero-390.png) | [查看](screenshots/admin-zero-320.png) |
| 员工同数据对照 | [查看](screenshots/employee-overview-1920.png) | [查看](screenshots/employee-overview-1440.png) | [查看](screenshots/employee-overview-1024.png) | [查看](screenshots/employee-overview-390.png) | [查看](screenshots/employee-overview-320.png) |

横滚末列：[推广1024](screenshots/admin-promotion-right-1024.png) · [390](screenshots/admin-promotion-right-390.png) · [320](screenshots/admin-promotion-right-320.png)；[空跑1024](screenshots/admin-wasted-right-1024.png) · [390](screenshots/admin-wasted-right-390.png) · [320](screenshots/admin-wasted-right-320.png)。[手机入口](screenshots/mobile-account-entry-390.png) · [失败保留](screenshots/read-failure-1440.png)。

## 操作过程

[桌面录像](video/desktop.webm)／[手机触屏录像](video/mobile.webm)已按8fps连续帧完整审查，覆盖首次可见动画、空跑、分类消耗与真实零值筛选；未见满条缩回或筛选重播。[时长](video/clips.json)。

桌面：[连续帧1](video/desktop-frames-01.jpg) · [连续帧2](video/desktop-frames-02.jpg)；手机：[连续帧1](video/mobile-frames-01.jpg) · [连续帧2](video/mobile-frames-02.jpg)。

## 发布

实现源码 `84e9009cbc5009ffd7ff8828b490d0627aafc4b8`，部署 `dpl_AA8EzoV1F2fRyTc3DhQiDVWykcpX`。[8项候选检查](candidate-smoke.json)通过，已切换[正式月度运营](https://qiuyun-frontend.vercel.app/business/monthly-operations)，[114项正式检查与70个资源哈希](public-smoke.json)通过。

首次正式检查在切换期间看到新页面404，保留[首次报告](public-smoke-transition.json)；随后普通路径、带月份及尾斜杠路径均正常进入登录保护，完整重跑通过，未修改路由绕过认证。

工作分支 `codex/monthly-operations`；合入main仍独立确认。
