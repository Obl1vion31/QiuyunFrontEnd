# Inspector 打开位移修复

基线8e913d52。真实Vercel目标包与隔离PostgreSQL、虚构账号／29篇样本，固定2026-11-18时钟。旧包与候选使用同一数据配方的独立临时库；截图来自真实界面，未改DOM制造效果。已查看图片与实际操作录像，已自检。

- 根因：排期路由body横向hidden在站内切页后覆盖共享clip；打开根滚动锁使body形成祖先滚动容器，sticky侧栏及顶栏按页面滚动量上移。正式只读复现312px，隔离旧包亦复现。
- 修复只移除这一条重复根样式，沿用公共壳层；Inspector外观、宽度、保存和权限保持。同步补齐既有趋势测试夹具的必需截止日期字段。
- 管理员1920／1440／1024、员工1440，分别检查月历／台账，共8组。直接进入与真实设置→排期切页、深滚动打开、编辑／发布往返、Esc／×／遮罩关闭及焦点返回，逐帧背景坐标保持。
- 未保存继续编辑／放弃、嵌套滚动锁、减少动态通过；390／320仅明显溢出及关闭入口。实际目标构建与最终测试类型检查通过。

[打开对照与录像](index.html) · [几何检查摘要](checks.json)

- [旧包复现 · 1440](baseline-open-1440.png)
- [修复后月历 · 1440](screenshots/admin-calendar-1440-open.png)
- [修复后台账 · 1440](screenshots/admin-ledger-1440-open.png)
- [实际操作录像](inspector-scroll-operation.mp4)

| 角色／桌面 | 月历关闭／打开 | 台账关闭／打开 |
| --- | --- | --- |
| 管理员1920 | [关闭](screenshots/admin-calendar-1920-closed.png)／[打开](screenshots/admin-calendar-1920-open.png) | [关闭](screenshots/admin-ledger-1920-closed.png)／[打开](screenshots/admin-ledger-1920-open.png) |
| 管理员1440 | [关闭](screenshots/admin-calendar-1440-closed.png)／[打开](screenshots/admin-calendar-1440-open.png) | [关闭](screenshots/admin-ledger-1440-closed.png)／[打开](screenshots/admin-ledger-1440-open.png) |
| 管理员1024 | [关闭](screenshots/admin-calendar-1024-closed.png)／[打开](screenshots/admin-calendar-1024-open.png) | [关闭](screenshots/admin-ledger-1024-closed.png)／[打开](screenshots/admin-ledger-1024-open.png) |
| 员工1440 | [关闭](screenshots/employee-calendar-1440-closed.png)／[打开](screenshots/employee-calendar-1440-open.png) | [关闭](screenshots/employee-ledger-1440-closed.png)／[打开](screenshots/employee-ledger-1440-open.png) |
