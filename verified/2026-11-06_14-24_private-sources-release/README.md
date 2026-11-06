# 私域来源与成本：正式发布

状态：**已自检／已发布**。应用 `77bc74c`；正式部署 `dpl_H5Ctm8PKDA2GxsSAfLt1oNZrjx1E` 为 READY，正式域名指向已核对。用户本轮“发布”覆盖先前本地样张的暂停发布指示。

[正式月度运营](https://qiuyun-frontend.vercel.app/business/monthly-operations) · [例会总览](https://qiuyun-frontend.vercel.app/business/meeting-review) · [完整视觉标准与本地样张](../2026-11-06_13-22_private-sources/README.md)

## 发布结果

- 月度运营、月会共用推广／非推广来源和成本展示；推广按用途录人数，非推广独立，旧口径与封存材料保留。
- 新格式同时保存仅含推广人数的旧版读取投影；0049只安装防降级触发器，防止旧标签页或回滚版本覆盖已升级的来源结构。原月份可继续读取与补录，普通保存沿用最后成功值。
- 迁移前完成私有备份；51张业务表迁移前后逐表数量与内容摘要一致，没有重写经营事实，未向共享数据库写入测试样本。[迁移回执](data/migration.json)
- 候选20项／6资源及正式20项／70资源哈希通过；七模块登录保护、业务接口401、退役协作410、正式同源表单401／跨站403均符合预期。[候选](data/candidate.json) · [正式](data/production.json) · [部署](data/deployment.json)

## 实际运行包复验

267项规则、5组真实旧版兼容／并发检查、schema、类型与Node／Vercel构建通过。最终Vercel函数包在本机独立PostgreSQL执行15组浏览器检查，实际生成中文PDF，外置React、Chromium及正式域名配置核对通过。[兼容](data/compatibility.json) · [运行包](data/runtime-bundle.json) · [浏览器](data/runtime-checks.json)

| 视图与状态 | 视口及证据 | 实际审查 |
| --- | --- | --- |
| 月度完整数据、用途／来源 | [1440完整页](screenshots/monthly-complete-1440.png) · [私域](screenshots/monthly-private-1440.png) | 已自检 |
| 月会核心与来源 | [1440核心](screenshots/meeting-core-1440.png) · [1024来源](screenshots/meeting-sources-1024.png) | 已自检；宽表在区块内横滚 |
| 推广／非推广录入 | [1440推广](screenshots/editor-promotion-1440.png) · [1024非推广](screenshots/editor-organic-1024.png) | 已自检；固定头尾，正文单层滚动 |
| 部分录入、旧口径、长金额历史 | [部分](screenshots/monthly-partial-private-1440.png) · [旧口径](screenshots/monthly-legacy-private-1440.png) · [长金额](screenshots/meeting-history-long-1440.png) | 已自检；未知与真实0独立 |
| 手机关键入口 | [390抽屉](screenshots/editor-mobile-390.png) | 仅核查明显遮挡、关闭／保存入口和页面溢出 |
| 首屏、刷新、导航、慢数据 | [实际运行包录像](video/runtime-first-paint.webm) · [24帧取样](review/first-paint.jpg) · [计时](data/first-paint.json) | 与稳定图分开检查 |
| 保存、失败重试、未保存与焦点 | [本批录入取样](review/editor-flow.jpg) · [原固定视口录像](../2026-11-06_13-22_private-sources/video/clean-flow.mp4) | 正式表单与接口，本机隔离数据 |
| 完整桌面与慢字体覆盖 | [原样张覆盖索引](../2026-11-06_13-22_private-sources/README.md) | 原批1920／1440／1024实查；本批未改变页面视觉 |
| PDF | [来源6页](pdf/meeting-sealed.pdf) · [长金额5页](pdf/meeting-long.pdf) · [旧口径5页](pdf/meeting-legacy.pdf) | 本批实际运行包生成，16页渲染审查；[1](review/contact-1.jpg)／[2](review/contact-2.jpg)／[3](review/contact-3.jpg)／[4](review/contact-4.jpg) |

所有截图、录像及PDF使用 `tests/private-sources.fixture.ts` 的本机隔离样本，不代表正式经营数据。正式站核验使用无登录访问及资源哈希；未冒用账号执行正式业务录入。完整运行回归覆盖三档桌面、来源增删改、503重试、慢保存新输入、历史、冻结、角色及有限390px检查；本批归档10张已查看关键图，不把其余自动截图标为逐张复审。
