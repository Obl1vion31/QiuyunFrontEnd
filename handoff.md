# 项目交接

先读根 [README](README.md) 与 [AGENTS](AGENTS.md)，再按[文档导航](docs/README.md)进入目标主题。

## 最新交付

- 推广复盘合并为同一入口，顶部“每日复盘 / 阶段复盘”；历史总览在每日内部，默认全部记录。节假日暂停移到待完成标题栏，旧阶段链接带参数重定向。
- 已复盘支持全部／首轮／二轮与按帖子分组，默认按实发排期版本聚合，两轮各自显示基准与差值；待复盘业务流程继续使用既有规则。
- 业务正文共用容器留白；四个业务详情共用 Inspector 和控制器，保留列表、筛选与滚动，统一键盘、焦点、未保存保护和浏览器历史。非推广保存更正后通过认证 GET 更新列表及同轮基准。
- [AGENTS](AGENTS.md) 规定前端必读、复用与交付检查；[设计规范](docs/DESIGN.md)、[真实接入示例](docs/code-study.md#共享界面接入)和[浏览器验收](tests/README.md#界面一致性验收)分别维护规则、代码入口和验证方式。

## 验证与接手

91 项测试、类型检查、迁移检查、本地与 Vercel 构建通过，25 项公网匿名只读检查确认登录保护、私有路径及新脚本摘要。隔离浏览器覆盖认证、排期、员工暂停、阶段快照与例会、年度规划及新增共享界面验收；检查 1440／390／320px 的公共几何、节点保留、轮次基准、快速切换、慢请求、失败保留、键盘、未保存保护和浏览器历史。年度矩阵另覆盖 1280px 全年对齐及员工只读。

完整入口见[测试说明](tests/README.md)。本轮更改界面、读取接口与协作规范，业务保存权限和历史快照口径沿用既有规则。当前工作分支供用户最终验收；确认通过后再合入 `main`，随后邀请其他账号试用。公网交付见[最新跟进](docs/archive/results/20261015跟进内容.md#2026-10-16-复盘整合与共享界面规范)。

## 运行入口

- 公网：[内容工作台](https://qiuyun-frontend.vercel.app/business/operations-schedule)；阶段：[阶段复盘](https://qiuyun-frontend.vercel.app/business/daily-promotion-review?view=stage)。Vercel CLI 手动发布，Git 推送不自动部署。
- GitHub：`agent/content-console-redesign` 分支；用户确认前不合入 `main`。
- 本地和公网共享选定 Neon 分支，虚构测试使用隔离数据库。项目 Node 22，包管理器 pnpm 9.15.9。
- 代码定位：[代码索引](docs/code-study.md)；数据库与备份：[数据库指南](docs/database-guide.md)；发布与回滚：[部署指南](docs/deployment.md)。
