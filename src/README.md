# 源代码

本目录包含静态首页、动态业务页面、受会话保护的 API，以及共享界面和业务规则。全局功能定位见 [代码索引](../docs/code-study.md)，首页逐段教学见 [首页代码学习](../docs/home-code-study.md)。

| 目录／文件 | 职责 |
| --- | --- |
| `pages/index.astro` | 静态总枢纽首页 |
| `components/ContentTunnel.tsx`、`scripts/home-motion.ts` | 首屏浅弧→平带的连续循环、暂停与可见性管理 |
| `styles/home.css`、`components/ContentTunnel.module.css` | 首页基础排版、紧凑后两区与首屏局部样式 |
| `pages/login.astro` | 账号或完整用户名登录 |
| `pages/organization.astro` | 组织岗位、协作资料与现有人员任职；管理员维护，员工只读 |
| `pages/business/` | 年度规划、排期、推广、非推广、月度运营、例会和设置页面 |
| `pages/api/` | 同源、登录与权限校验后的 HTTP 入口 |
| `components/` | 共享控制台、工具栏、Inspector、指标与暂停控件 |
| `scripts/` | 打包后的浏览器交互与共享时间格式 |
| `styles/` | 显式接入的共享表单、筛选和对话框规范 |
| `data/` | 首页文案、公开封面及组织岗位的共享类型／初始职责 |
| `db/` | schema、数据库连接、业务事务和共享纯规则 |
| `auth/` | Better Auth、内部账号和权限 |
| `integrations/` | 已授权第三方平台的服务端协议、聚光授权校验与加密凭据存储 |
| `middleware.ts` | 业务页／接口访问保护与性能计时 |

`src/pages/` 及其子目录不放置 README，避免 Astro 将 Markdown 生成为公开页面；这些目录的说明统一保留在本页与代码索引中。

`pages/api/integrations/xiaohongshu/` 提供聚光授权发起、回调和管理员状态读取，接入与官方协议入口见 [第三方接入说明](integrations/README.md)。精确回调路径的无参数 GET／HEAD 为公开就绪检查；带参回调与其余接口保持管理员会话保护。

修改共享导航、字体或布局进入共享组件，不在页面复制壳层。客户端不得导入数据库连接和认证密钥。业务写入使用服务端校验与事务，角色从已验证会话读取。新增入口同步检查[已确认边界](../docs/DECISIONS.md)和对应目录说明。

切页 A 方案由 `BusinessNavigationLoading`、`scripts/business-navigation.ts` 和 `styles/business-navigation.css` 共用；保留当前页，以顶部细线和慢请求提示反馈，不维护目标页布局、不请求或缓存业务结果。生命周期沿用Astro，原位详情／展开和写入仍由原控制器处理。

推广页承载每日／历史；新增阶段复盘进入周例会，`BusinessPromotionStageView` 只读展示旧快照。`meeting-review.astro` 区分旧 v2/v3 编辑与 v4 周／月例会，v4 候选／基准在 `db/meeting-weekly-material.ts`，卡片和编辑在 `BusinessWeeklyMeeting`／`WeeklyReviewCards`。图片只走认证接口，不放入公开资源。

推广状态由 `db/promotion-timeline.ts` 维护业务日期、首次安排、实际当日暂停及历史更正；历史已登记日由 `db/promotion-day-edit.ts` 统一处理单日修改、相邻衔接与三天确认；推广历史和排期通过同一组件展示。排期待审直接位于排期管理，设置向全员提供使用说明（维护区仅管理员），账号管理、操作授权和旧年度审核兼容地址继续仅管理员可用；学科和分类在年度规划内联追加，全站共用数据库字典。

例会准备使用既有 JSON 的 `workflowVersion=7`：按本次来源核对完整性，推广／非推广均回原入口补齐，正文只读引用非推广事实；会前／会后版本与安排由原控制器维护。`meeting-readiness.ts`、`promotion-review-required.ts` 统一完整性和日度应填口径。协作、查帖和账号管理分别由 Frame、共享控制器及受保护 API 接入；`BusinessAssistantEntry` 提供左栏／手机账号菜单中的助手入口，`BusinessPostLookup` 提供直接查帖的共享右侧面板，`non-promotion-table.css` 集中维护非推广列表的语义列与窄屏布局，不复制页面壳层。

账号管理的行结构由 `BusinessAccountRow.astro` 共用；`account-management.ts` 处理新增、改名及改号，服务端复用 `auth/identifiers.ts` 边界与 `auth/provision.ts` 事务创建。标识解析在 Better Auth 之前完成，密码验证和会话仍由原认证服务负责。

各工作台页的head共用 `BusinessConsoleFonts`；`styles/business-font-assets.ts` 为 `pages/fonts/business.css.ts` 与 `business.js.ts` 构建生成共享静态字体资源，常用原始切片在正文解析前同步准备，其余按需读取。Frame保留原字体栈，不以首帧速度切换字体。

排期月度阶段由 MonthlyArrangementPanel、monthly-arrangement 与 schedule-edit-policy 共用；首轮在原月历落实、整月提交、管理员核对及永久封存。审批重放也经过同一事务守卫。取消排期标记撤下，schedule-execution-history 在排期与查帖共用前后变更展示。
