# 非推广复盘入口与帖子资料验收

- 代码：`24c88bec9b01f798b5a348e9ba430d2b2c6341ae`，工作分支 `agent/content-console-redesign`。
- 状态：已自检；2026-10-23 按用户持续授权发布公网，发布源 `2bf3ccf6991156dd30dab8ba172b7aa71814d40e`。
- 来源：正式 Astro 页面、共享 Inspector 及受认证 API，隔离 PGlite 与虚构账号／帖子。测试业务时钟固定为北京时间 2026-10-23 12:00；没有向共享 Neon 写入验收数据。
- 三种入口统一定位排期＋轮次；资料区含项目文档、小红书链接、应发／实发时间、排期详情及笔记 ID。缺失资料显示“未登记”，外链新标签保留当前草稿。
- 1024px 及停靠详情下按内容容器调整列宽，日期保持单行，标题最多两行，两项指标使用一致层级；手机动作位于日期行右侧。

## 正式截图

| 宽度 | 待复盘 | 资料与填写 | 缺失资料 | 长标题／首次 ID | 已复盘 |
| --- | --- | --- | --- | --- | --- |
| 1440px | [查看](pending/pending-1440.png) | [查看](pending/inspector-1440.png) | [查看](pending/missing-resources-1440.png) | [查看](pending/long-title-1440.png) | [查看](history/history-flat-1440.png) |
| 1024px | [查看](pending/pending-1024.png) | [查看](pending/inspector-1024.png) | [查看](pending/missing-resources-1024.png) | [查看](pending/long-title-1024.png) | [查看](history/history-flat-1024.png) |
| 390px | [查看](pending/pending-390.png) | [查看](pending/inspector-390.png) | [查看](pending/missing-resources-390.png) | [查看](pending/long-title-390.png) | [查看](history/history-flat-390.png) |
| 320px | [查看](pending/pending-320.png) | [查看](pending/inspector-320.png) | [查看](pending/missing-resources-320.png) | [查看](pending/long-title-320.png) | [查看](history/history-flat-320.png) |

[分类均值与展开明细](history/history-category-1440.png) · [不复盘资料与恢复入口](history/skipped-1440.png) · [跨月排期定位](schedule/schedule-deep-link-1440.png)

## 交互与动效

[实际操作录像](motion/non-promotion-interactions.webm) · [进入前](motion/keyframe-01.png) · [进入途中](motion/keyframe-02.png) · [展开后](motion/keyframe-03.png) · [逐帧进入采样](motion/entry-frames.json) · [检查与尺寸记录](checks.json)

实际操作覆盖行／标题／按钮、键盘、焦点返回、重复点击保留表单、未保存取消与确认切换、查看资料保留输入、首次保存后重开、首二轮与同名版本、分类和平铺切换。录像包含桌面与手机视口切换；末段检查 220ms 进入／退出及减少动态效果。已实际打开正式截图及录像关键帧审查，修正了中等宽度下按钮不可见、日期折行、两项指标排列不一致，以及手机滚动后打开详情导致工具栏失去吸顶的问题。静态截图等待开关动画结束，避免将过渡中的半透明画面当作最终状态。

## 已运行验证

- `pnpm build`：类型检查、构建通过。
- `pnpm test`：166 项通过。
- `pnpm test:non-promotion`：本轮四档宽度与正式录入流程通过。
- `pnpm test:ui`：六页公共几何、分类节点、草稿、焦点和浏览器前后退通过。
- `pnpm test:motion`：1440／1280／390／320px 公共面板逐帧进出与减少动态效果通过。
- `pnpm test:interaction`：100／450ms 安静读取、慢读反馈、旧响应隔离、导航／退出确认、权限和删除失败恢复通过；将旧例会字段选择器更新为现有“临时事项”可访问标签。

长期规则同步至 DESIGN、DECISIONS 与共享界面接入实例；仅扩展现有只读模型字段，无数据库迁移。

## 公网发布（2026-10-23）

[正式非推广复盘](https://qiuyun-frontend.vercel.app/business/non-promotion-review)；部署 `dpl_C7zVp6npPyCnduuCpH2nxRh5uufL` 已为 READY，正式域名已绑定。干净导出的提交构建与线上 45 个资源 SHA-256 一致；69 项匿名读取、登录跳转、接口拒绝未登录和私有路径检查通过。线上 1440／390px 登录页已实际查看，业务录入与三入口继续沿用本轮隔离验收，无线上业务写入或数据库迁移。

[发布回执](checks/production-release.json) · [公网检查](checks/production-smoke.json) · [浏览器检查](checks/production-browser.json) · [桌面登录](checks/production-login-1440.png) · [手机登录](checks/production-login-390.png)

用户已确认后续修改完成必要测试及视觉自检后直接发布；Windows／WSL 全局 AGENTS、项目 AGENTS、DECISIONS 和部署指南同步记录，直到用户通知变更。main 合并仍独立确认。
