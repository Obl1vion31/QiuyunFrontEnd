# 源代码

本目录包含静态首页、动态业务页面、受会话保护的 API，以及共享界面和业务规则。全局功能定位见 [代码索引](../docs/code-study.md)，首页逐段教学见 [首页代码学习](../docs/home-code-study.md)。

| 目录／文件 | 职责 |
| --- | --- |
| `pages/index.astro` | 静态总枢纽首页 |
| `components/ContentTunnel.tsx`、`scripts/home-motion.ts` | 首屏浅弧→平带的连续循环、暂停与可见性管理 |
| `styles/home.css`、`components/ContentTunnel.module.css` | 首页基础排版、紧凑后两区与首屏局部样式 |
| `pages/login.astro` | 用户名登录 |
| `pages/business/` | 年度规划、排期、推广、非推广、例会和设置页面 |
| `pages/api/` | 同源、登录与权限校验后的 HTTP 入口 |
| `components/` | 共享控制台、工具栏、Inspector、指标与暂停控件 |
| `scripts/` | 打包后的浏览器交互与共享时间格式 |
| `styles/` | 显式接入的共享表单、筛选和对话框规范 |
| `data/` | 首页文案与公开封面配置 |
| `db/` | schema、数据库连接、业务事务和共享纯规则 |
| `auth/` | Better Auth、内部账号和权限 |
| `middleware.ts` | 业务页／接口访问保护与性能计时 |

`src/pages/` 及其子目录不放置 README，避免 Astro 将 Markdown 生成为公开页面；这些目录的说明统一保留在本页与代码索引中。

修改共享导航、字体或布局进入共享组件，不在页面复制壳层。客户端不得导入数据库连接和认证密钥。业务写入使用服务端校验与事务，角色从已验证会话读取。新增入口同步检查[已确认边界](../docs/DECISIONS.md)和对应目录说明。

推广页承载每日／历史；新增阶段复盘进入周例会，`BusinessPromotionStageView` 只读展示旧快照。`meeting-review.astro` 区分旧 v2/v3 编辑与 v4 周／月例会，v4 候选／基准在 `db/meeting-weekly-material.ts`，卡片和编辑在 `BusinessWeeklyMeeting`／`WeeklyReviewCards`。图片只走认证接口，不放入公开资源。

推广状态由 `db/promotion-timeline.ts` 维护业务日期、首次安排、实际当日暂停及历史更正；推广历史和排期通过同一组件展示。排期待审直接位于排期管理，设置默认账号权限，旧年度审核地址继续兼容；学科和分类在年度规划内联追加，全站共用数据库字典。

例会内联流程使用既有 JSON 的 `workflowVersion=5`，会前／会后版本和来源由 `meeting-decisions.ts` 读取；理由更正写入原审计表，不添加迁移。推广实际指标继续由专属日度接口保存，非推广内联确认复用原非推广接口。
