# 月度运营导航间距修正

已实际看图自检并发布，待使用反馈。截图使用正式组件与隔离PGlite虚构数据，手机为Chromium模拟触屏。

原因是“月度运营”位于导航分组外，使用14px组间距；同组项目使用4px。现在加入“复盘与沉淀”的同一模块列表，复用图标、行高、选中态及组内间距。未新增样式补丁，手机仍从账号菜单进入。

## 实际验证

- 年度页和月度看板覆盖1920／1440／1024／390／320px；管理员／员工同数据对照，16张截图已打开并通过联系图逐一检查。
- 桌面实测同组两处相邻间距均4px、项目高42px；月度专项和公共UI回归通过。[测量及结果](result.json)／[日志](logs/)。
- [桌面九图对照](review-sheets/desktop.jpg)／[手机七图对照](review-sheets/mobile.jpg)。静态导航分组调整不涉及动效或编辑流程。
- 规范与共享接入补充同组导航从groups.modules接入，组间距仅服务不同分组；原批的侧栏视觉结论已[更正](../2026-10-30_20-00_monthly-operations/README.md)。
- 当前会话未提供frontend-design技能；按仓库现有桌面／手机、真实几何和实际图片审查要求执行。

| 页面 / 角色 | 1920 | 1440 | 1024 | 390 | 320 |
| --- | --- | --- | --- | --- | --- |
| 年度页／管理员 | [查看](screenshots/annual-sidebar-1920.png) | [查看](screenshots/annual-sidebar-1440.png) | [查看](screenshots/annual-sidebar-1024.png) | [查看](screenshots/annual-sidebar-390.png) | [查看](screenshots/annual-sidebar-320.png) |
| 看板／管理员 | [查看](screenshots/admin-overview-1920.png) | [查看](screenshots/admin-overview-1440.png) | [查看](screenshots/admin-overview-1024.png) | [查看](screenshots/admin-overview-390.png) | [查看](screenshots/admin-overview-320.png) |
| 看板／员工 | [查看](screenshots/employee-overview-1920.png) | [查看](screenshots/employee-overview-1440.png) | [查看](screenshots/employee-overview-1024.png) | [查看](screenshots/employee-overview-390.png) | [查看](screenshots/employee-overview-320.png) |

[手机账号入口](screenshots/mobile-account-entry-390.png)。

## 发布

实现源码`f2f751de7394f677a77b0ce492912d2654e509e1`，工作分支`codex/sidebar-monthly-spacing`。

Node构建、Vercel类型检查／构建及运行包中文PDF通过。部署`dpl_Bvmh2mX6HGezjNZBftaTM1w1TByd`；[8项候选检查](candidate-smoke.json)、[114项正式检查与70个资源哈希](public-smoke.json)全部通过，已更新[正式站](https://qiuyun-frontend.vercel.app)。公开核对未写业务数据，无数据库迁移，main保持独立确认。
