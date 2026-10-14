# 验证

`pnpm test` 运行现有业务规则检查与 `auth.test.ts` 的独立内存 PostgreSQL 认证测试，覆盖哈希、初始化幂等、会话撤销、角色来源、CSRF 和多实例限流。

先执行 `pnpm build`，再执行 `pnpm test:browser` 和 `pnpm test:annual-plan`。浏览器验收使用 `auth.fixture.ts` 自带的 PGlite 数据库、虚构账号与独立端口，覆盖真实 HTTP 权限、业务写入和桌面／手机登录体验，不连接 `.env` 中的共享 Neon 数据库。

浏览器工具通过 `PLAYWRIGHT_MODULE` 指定；默认读取项目内被忽略的 `.tools/tooling/node_modules/playwright/index.mjs`。Chromium 可通过 `PLAYWRIGHT_BROWSERS_PATH` 指定下载位置。截图保存在 `.tools/test-artifacts/`，不放入公开资源。

公网验收只做已授权账号登录、读取和无权限请求，不向共享业务库添加虚构数据。构建前需使用 Node 22；本机工具目录、测试产物及数据库备份不会提交或发布。

历史迁移含特定导入批次断言，隔离测试从当前 schema 建立业务结构，再执行本次认证 SQL；不会修改已共享的历史迁移，也不会使用真实业务数据补足断言。Chromium 系统库与中文字体可在 `.tools/system/` 解压，并用 `LD_LIBRARY_PATH`、`FONTCONFIG_FILE` 提供，避免修改系统配置。

年度规划测试覆盖半月边界、付费子区间汇总、自由备注、旧快照恢复、乐观锁、管理员权限、年度复制和并发防覆盖。追加迁移从上一个完整结构快照在隔离 PostgreSQL 验证，浏览器同时检查桌面全年对齐、跨页初始化和手机编辑。

`pnpm test:workflows` 在构建后验收延期逐日理由、实发原子提交、改期权限与并发审批、临时分类、非推广筛选、跳过／恢复及同类基准，并检查桌面与手机交互。`schedule-workflow.test.ts` 验证纯规则和事务，迁移测试从上一结构快照验证历史补齐与快照保留。
