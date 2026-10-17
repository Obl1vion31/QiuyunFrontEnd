# 前端团队管理系统

面向内容运营的团队工作台：年度总周期规划、帖子版本与排期、推广每日与阶段复盘、非推广首轮／二轮复盘、推广阶段快照与例会。

- [公网工作台](https://qiuyun-frontend.vercel.app/business/operations-schedule)
- [最新交接](handoff.md)：最近交付、验证范围和接手顺序。
- [文档导航](docs/README.md)：业务规则、代码、数据库和发布说明。

## 本地启动

使用 `.nvmrc` 指定的 Node 22 和 pnpm 9.15.9：

```bash
pnpm install
pnpm dev
```

按 `.env.example` 配置数据库、独立认证密钥和本机认证 URL；配置值不提交。需要接入现有库或创建账号时，先读[数据库指南](docs/database-guide.md)。

**本地和公网共用已选定的 Neon 分支，网页写入会同时影响两端。** 测试使用隔离数据库。历史迁移包含特定导入校验，不能在空库中直接重放为初始化。

## 技术与命令

Astro 5、React 18、TypeScript、Neon PostgreSQL、Drizzle ORM、Better Auth。首页静态生成，业务页面和 API 动态运行；本机采用 Node adapter，公网采用 Vercel adapter。

```bash
pnpm check
pnpm test
pnpm db:check
pnpm build
```

浏览器验收及本机工具配置见[测试说明](tests/README.md)。数据库结构通过追加迁移更新；网页业务数据保存后立即生效，不需要重新构建或迁移。

## 前端开发与验收

每次页面改动先读 [AGENTS](AGENTS.md)、[设计规范](docs/DESIGN.md) 和[共享界面接入实例](docs/code-study.md#共享界面接入)，检查现有组件及控制器，再开始修改。跨页容器、相邻视图的公共节点和 Inspector 都按[浏览器验收标准](tests/README.md#界面一致性验收)核对；`pnpm test:ui` 提供可重复的隔离验证。

整个工作台使用同一套视觉和交互基准；局部操作只改变必要内容，空态、历史版本和异步内容同样遵守字体与组件规范。每次交付检查布局稳定、同类反馈、文案必要性和任务范围，突破既有基准须先说明并取得确认。

展示方式复用 `BusinessViewSwitch`，编辑表单抽屉复用 `BusinessFormSheet`；筛选、表单和操作区按功能分组并使用共享控件规格，接入入口见上述实例。

## 目录入口

| 位置 | 职责 |
| --- | --- |
| `src/` | 页面、API、共享组件、认证与业务规则 |
| `drizzle/` | 已版本化数据库迁移 |
| `scripts/` | 账号、备份和迁移等受控维护工具 |
| `tests/` | 规则、数据库与隔离浏览器验收 |
| `public/` | 网站实际使用的公开图片与脚本 |
| `data/` | 本机私有原始表格和核对素材 |
| `docs/` | 当前有效的规则、专题说明与历史归档 |
| `.tools/` | 被忽略的本机工具、测试产物和私有备份 |

## 日常使用与发布

- 年度规划：`/business/annual-plan`，总规划由学科细致规划自动汇总。
- 帖子排期：`/business/operations-schedule`，新做帖建立 V0，修改内容建立 V1+，默认按月历查看；发布统一登记时间与帖子链接，支持完整分享文案和未来时间。
- 推广日度：`/business/daily-promotion-review`，T+1 指标、测试／放量、待定区间与次日计划、历史更正和团队节假日暂停。
- 推广阶段：`/business/daily-promotion-review?view=stage`，自选日期汇总测试／放量，保存 V0/V1+ 快照供例会引用。
- 非推广复盘：`/business/non-promotion-review`，首轮／二轮指标、学科分类筛选及不复盘／恢复。
- 例会：`/business/meeting-review`，五部分报告、指定版本快照、私有图片和结论事项；全局规则：`/business/settings`。

账号分为管理员和员工；两种角色均可处理日常复盘和团队暂停。已有应发时间的员工改期需要管理员审批；已有实发时间更正仅管理员处理。完整权限及业务口径见[已确认决定](docs/DECISIONS.md)。

开发与修正先推送工作分支供验收，用户确认后再合入 `main`。公网通过 Vercel CLI 手动发布，Git 推送不自动部署。发布、临时隧道和回滚入口见[部署指南](docs/deployment.md)。
