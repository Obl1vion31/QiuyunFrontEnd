# 源代码

本目录包含静态首页、动态业务页面、受会话保护的 API，以及共享界面和业务规则。全局功能定位见 [代码索引](../docs/code-study.md)，首页逐段教学见 [首页代码学习](../docs/home-code-study.md)。

| 目录／文件 | 职责 |
| --- | --- |
| `pages/index.astro` | 静态总枢纽首页 |
| `pages/login.astro` | 用户名登录 |
| `pages/business/` | 年度规划、排期、推广、非推广、例会和设置页面 |
| `pages/api/` | 同源、登录与权限校验后的 HTTP 入口 |
| `components/` | 共享控制台、工具栏、指标与暂停面板 |
| `scripts/` | 打包后的浏览器交互 |
| `data/` | 首页文案与公开封面配置 |
| `db/` | schema、数据库连接、业务事务和共享纯规则 |
| `auth/` | Better Auth、内部账号和权限 |
| `middleware.ts` | 业务页／接口访问保护与性能计时 |

`src/pages/` 及其子目录不放置 README，避免 Astro 将 Markdown 生成为公开页面；这些目录的说明统一保留在本页与代码索引中。

修改共享导航、字体或布局进入共享组件，不在页面复制壳层。客户端不得导入数据库连接和认证密钥。业务写入使用服务端校验与事务，角色从已验证会话读取。新增入口同步检查[已确认边界](../docs/DECISIONS.md)和对应目录说明。

推广复盘分为 `pages/business/daily-promotion-review.astro` 的每日／历史，以及 `pages/business/promotion-stage-review.astro` 的自选时间段与不可变快照。例会五部分位于 `meeting-review.astro`，草稿和定稿的事实装配在 `db/meeting-snapshots.ts`；图片只走受认证的 `api/meeting-attachments`，不放入公开资源。
