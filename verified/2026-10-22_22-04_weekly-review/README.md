# 周例会与每日复盘正式验收

状态：已自检，2026-10-23 按用户授权公网发布。对应代码 `798acaf`，发布源 `f2e0730`，工作分支 `agent/content-console-redesign`。

截图和录像全部来自正式组件、认证接口与隔离 PGlite 虚构数据。每日第八版回归使用 2026-10-21 业务时钟，周例会场景使用 2026-10-22；归档时间按北京时间。没有向共享库写入验收数据。本轮复用现有 JSON 快照，不增加 SQL 迁移。

## 先看这些

| 内容 | 桌面 | 手机 |
| --- | --- | --- |
| 推广阶段卡片、完整结果与同类比较 | [1440px](weekly/weekly-promotion-1440.png) · [1920px](weekly/weekly-promotion-1920.png) | [390px](weekly/weekly-promotion-390.png) |
| 非推广二轮携首轮对照 | [1440px](weekly/weekly-non-1440.png) | [390px](weekly/weekly-non-390.png) |
| 首次补 ID 小气泡 | [正式行内小组件](daily/daily-id-popover-1440.png) | [单行录入 390px](daily/daily-ready-390.png) |
| 五篇测试、没有可填写项 | [1440px](daily/promotion-empty-1440.png) | — |
| 多条待填写、直接录入 | [1440px](daily/promotion-ready-1440.png) | [390px](daily/daily-ready-390.png) |
| 测试／放量／暂停混合 | [1440px](daily/promotion-mixed-1440.png) | [390px](daily/promotion-mixed-390-viewport.png) |
| 周例会定稿 | [冻结 V0](weekly/weekly-final-1440.png) · [追加 V1](weekly/weekly-revision-v1-1440.png) | [320px](weekly/weekly-final-320.png) |

卡片区域截图在相同宽度下增加浏览器高度，使区域完整可见，避免固定导航和浮动保存栏遮住证据；正常高度的首屏保留于 `weekly-viewport-*`。完整长页截图中的浮动操作栏位于截图时的真实视口位置。

## 操作和动效

- [每日 ID、批量保存与周例会操作录像](motion/weekly-daily-actions.webm)：包含真实点击、填写、保存、宽度切换、草稿及 V0／V1。
- [生命周期入场与页面连续性录像](motion/promotion-trajectory-entry.webm)：正式页面切入、节点、详情与返回；约 600ms 的可见入场和减少动态效果由回归同时验证。
- [操作录像关键帧](motion/actions-keyframes.jpg) · [生命周期录像关键帧](motion/trajectory-keyframes.jpg)。另保留逐帧截图 `motion/natural-motion-*`。

已实际打开检查桌面、手机截图及录像关键帧；修正过单卡铺满、主按钮未继承样式、宽屏名称占位及截图遮挡。没有用原型代替正式业务页面。

## 已运行检查

- 全部 166 项规则／事务／权限／迁移测试通过，其中周例会规则 7 项；类型检查、构建和 `db:check` 通过。
- `test:weekly`：默认未勾选空白模板、实际截止候选、二轮首轮对照、历史／同期基准、节点和文字保留、慢读反馈、区间确认取消、草稿、过期来源拒绝、冻结 V0 和追加 V1。
- 每日批量：员工权限、首次 ID 原子提交、任一项失败全部回滚、指纹、共享 ID 冲突、幂等重试与队列刷新；待定默认五项零和继续待定。
- `test:review-workbench`、`test:ui`、`test:reviews`、`test:status-correction`、`test:timeline`、`test:motion` 通过，保留旧 v2/v3、只读阶段快照、Inspector、状态再次更正、跨午夜、草稿、焦点和减少动态效果。
- 正式页面检查宽度：1920／1440／1280／1024／736／390／320px；公共 UI 回归含 1440／1280／390／320px，面板动效同档；状态更正含 1440／1024／390／320px。

[检查摘要](checks/validation.json) · [周例会浏览器结果](checks/weekly-result.json) · [第八版回归结果](checks/v8-results.json)。其他视口截图按页面与宽度保存于 `daily/`、`weekly/`。

## 公网发布核对（2026-10-23）

正式入口：[每日复盘](https://qiuyun-frontend.vercel.app/business/daily-promotion-review) · [周例会](https://qiuyun-frontend.vercel.app/business/meeting-review)。部署 `dpl_7XGXzLX94YoKjAp5gn9CJiVQSxeb` 已 Ready 并绑定正式域名，发布源 `f2e0730`；不增加 SQL 迁移。

69 项公网检查通过，45 个脚本、样式、字体及许可资源与独立干净构建的 SHA-256 一致。首页与登录页可访问；业务页面要求登录，API 拒绝未登录请求，私有配置与资料路径不可访问。1440／390px 浏览器登录跳转无脚本错误、无横向溢出，已实际查看截图。线上只核对公开访问和登录保护；业务交互、写入与权限仍使用本批隔离验收，不向共享库写入测试事实。

[公网资源与权限检查](checks/production-smoke.json) · [公网浏览器检查](checks/production-browser.json)。另一组未提交的非推广／Inspector 修改保留在工作区，未进入此次部署。
