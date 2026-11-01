# 月度运营延期率与归因分布

已自检并发布。延期率右上可选全部／运营原因，两者均以本月应发中已登记发布数为分母；数值按钮定位对应已发布明细，刷新、月份、学科、分类和失败重试保留选择。发布分布按运营深红／非运营浅红拆分，缺失或未知归因保留灰段，四项图例数量保持。

## 稳定截图

以下38张专项截图均已实际查看；全部选择为整页视口，运营选择和分布为局部清晰图。两角色使用同一组隔离数据：27篇应发，25篇已登记，18篇按时，运营延期2篇、非运营延期5篇、尚未登记2篇。未登记中另有运营原因，关注项为3，延期率分子仍为2。

| 宽度 | 管理员：全部 | 员工：全部 | 管理员：运营原因 | 员工：运营原因 | 发布分布 |
| --- | --- | --- | --- | --- | --- |
| 1920px | [整页](screenshots/admin-all-1920.png) | [整页](screenshots/employee-all-1920.png) | [8.0%](screenshots/admin-operational-card-1920.png) | [8.0%](screenshots/employee-operational-card-1920.png) | [分布](screenshots/admin-distribution-1920.png) |
| 1440px | [整页](screenshots/admin-all-1440.png) | [整页](screenshots/employee-all-1440.png) | [8.0%](screenshots/admin-operational-card-1440.png) | [8.0%](screenshots/employee-operational-card-1440.png) | [分布](screenshots/admin-distribution-1440.png) |
| 1240px | [整页](screenshots/admin-all-1240.png) | [整页](screenshots/employee-all-1240.png) | [8.0%](screenshots/admin-operational-card-1240.png) | [8.0%](screenshots/employee-operational-card-1240.png) | [分布](screenshots/admin-distribution-1240.png) |
| 1024px | [整页](screenshots/admin-all-1024.png) | [整页](screenshots/employee-all-1024.png) | [8.0%](screenshots/admin-operational-card-1024.png) | [8.0%](screenshots/employee-operational-card-1024.png) | [分布](screenshots/admin-distribution-1024.png) |
| 390px | [整页](screenshots/admin-all-390.png) | [整页](screenshots/employee-all-390.png) | [8.0%](screenshots/admin-operational-card-390.png) | [8.0%](screenshots/employee-operational-card-390.png) | [分布](screenshots/admin-distribution-390.png) |
| 320px | [整页](screenshots/admin-all-320.png) | [整页](screenshots/employee-all-320.png) | [8.0%](screenshots/admin-operational-card-320.png) | [8.0%](screenshots/employee-operational-card-320.png) | [分布](screenshots/admin-distribution-320.png) |

额外查看：[员工分布390px](screenshots/employee-distribution-390.png)、[管理员运营明细1440px](screenshots/admin-operational-details-1440.png)、[员工运营明细390px](screenshots/employee-operational-details-390.png)、[真实零延期](screenshots/zero-operational-1440.png)、[零分母](screenshots/empty-operational-1440.png)，以及未归因的[1920px](screenshots/unknown-distribution-1920.png)、[390px](screenshots/unknown-distribution-390.png)、[320px](screenshots/unknown-distribution-320.png)。

标题、选择框与数值无挤压，切换前后卡片外框和页面滚动位置一致；1240px补查四列临界宽度。手机延期名称和数量在同一项内换行，未知原因未混入非运营，表格沿用内部横滚。

冷启动回归另实看四张早期／稳定图：[1440px早期](screenshots/cold-1440-early.png)、[1440px稳定](screenshots/cold-1440-stable.png)、[320px早期](screenshots/cold-320-early.png)、[320px稳定](screenshots/cold-320-stable.png)。正文继续使用已确认MiSans，未替换字体；本批共42张图。其余首屏场景保留原始产物，未将所有首屏图标为人工逐张审查。

## 交互与验证

- [专项记录](checks.json)：双角色各六档，全部7/25→28.0%、运营2/25→8.0%；数值查看明细分别7／2条，图例查看全部7条，分段合计27。混合归运营，未登记运营原因不混入分子；零分母、真实零、未归因、键盘、筛选与失败重试通过。
- [桌面录像](motion/desktop.webm)与[手机触屏录像](motion/mobile.webm)已按完整时间范围的连续帧查看，涵盖首次进入、卡片切换、运营明细及全部延期明细；切换不移动原内容或重播已有图表。原始逐帧图在`.tools/test-artifacts/monthly-delay/frames/`。
- 236项规则、`db:check`、Node／Vercel类型检查构建、月度运营原专项及新增归因专项、公共UI通过。[首屏记录](first-paint.json)17场景通过，覆盖冷／暖／慢请求、提醒失败恢复及七页字体接入。[运行包中文PDF](bundle-check.json)和[正式来源预检](preflight.json)通过。
- 正式数据通过只读事务核对，分组与明细合计一致，核对记录保留于私有`.tools/test-artifacts/monthly-delay/live-counts.json`。业务交互与截图均用隔离PGlite及虚构账号，没有向正式库写入测试记录，无结构迁移。

## 正式发布

- 应用实现`1f6705e97bc47039dd83457622c013784d8e223a`，工作分支`codex/monthly-delay-attribution`，按持续授权同步main。
- 部署`dpl_AhtbWUoMvzkCHkbWuxCrEP8UoAHb`，[正式月度运营](https://qiuyun-frontend.vercel.app/business/monthly-operations?month=2026-10)。[候选检查](candidate.json)和[正式核对](public-smoke.json)通过，月度客户端资源与本机构建哈希一致；登录保护、同源表单与私有目录边界保持。
- 设计规范、统计口径、接入实例和测试说明同步更新。本轮只调整本次确认的卡片及分布，既有费用和关注项语义保留。
