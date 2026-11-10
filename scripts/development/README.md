# 本机开发连接

`dev.ts` 是 `pnpm dev` 的入口：加载开发配置、验证目标、建立 SSH 通道并检查实际数据库身份后启动 Astro。通道退出会导致读取／保存明确失败，不切换到其他数据库。

`pnpm start`／`pnpm preview` 复用同一检查后运行本机 Node 构建，需先完成 `pnpm build`；Vercel 正式函数不使用这些本机启动命令。

`environment.ts` 定位当前 Git 仓库公共目录下被忽略的 `.tools/private/`。应用读取 `development.env`，维护工具读取独立的 `development-maintenance.env`；维护账号不会加入网站环境。已有外部环境变量不被静默覆盖，错误目标直接拒绝。

`tunnel.ts` 复用私有 `development-tunnel.json` 指定的 SSH 登录，只在本机监听 `127.0.0.1:15432`，连接上海回环 PostgreSQL。严格核对 SSH 主机指纹，失败时停止。重建前检查专用控制文件是否仍对应存活通道，清理 Linux 重启留下的失效文件；已有通道但数据库身份检查失败时直接停止。运行条件与恢复入口见[数据库指南](../../docs/database-guide.md)。

网站端口以本机认证地址为准；端口占用时停止，避免 Astro 自动换端口导致登录地址不符。显式 `pnpm dev --port 4322` 会同步本次进程的本机认证地址，不更改私有文件。

正式维护另须显式传入 `--production`、`APP_ENV=production` 及运行时连接；不会自动读取旧正式配置。本轮不执行正式维护。
