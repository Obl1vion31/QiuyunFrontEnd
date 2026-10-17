# 预览、发布与回滚

## 公网托管

正式入口：[内容工作台](https://qiuyun-frontend.vercel.app)。Vercel 项目为 `qiuyun-frontend`，与 Formward 使用同一账号、独立配置；当前通过 CLI 手动发布，Git 推送不自动部署。

Production 变量为 `DATABASE_URL`、`BETTER_AUTH_SECRET`、`BETTER_AUTH_URL` 和 `ENABLE_EXPERIMENTAL_COREPACK=1`。数据库连接与认证密钥设为 Secret；认证 URL 使用正式 HTTPS 根地址。本机 `.env` 保留本机 URL，预览环境不连接共享业务库。

更新代码时先执行 `pnpm check`、`pnpm test`、`pnpm db:check`、`pnpm build`；认证和权限变化还需要隔离浏览器验收。安装并登录 Vercel CLI 后，在已关联的仓库根目录运行：

```bash
vercel deploy --prod
```

新增迁移时先运行 `pnpm db:backup` 保存私有数据备份，核对待执行迁移，再运行 `pnpm db:migrate`；确认既有业务事实保持一致后发布。构建不执行迁移，后续结构变更需兼容仍运行的旧版本。

`.vercelignore` 排除环境配置、原始表格、参考截图和本机工具；私有资料使用根目录限定规则 `/data/`，使 `src/data/` 首页配置仍进入构建。备份位于被忽略的 `.tools/backups/`，不得公开。网站故障可通过 Vercel 回滚应用部署；应用回滚不自动恢复数据库，不删除新增表或历史事实。


## 临时公网预览

本机已将 Cloudflare Quick Tunnel 工具下载到 `.tools/cloudflared`，该目录被 Git 忽略，不会提交二进制文件。需要让其他人临时访问本地网站时，在项目根目录打开两个终端。

终端一启动本地网站：

```bash
pnpm dev
```

终端二启动临时公网隧道：

```bash
./.tools/cloudflared tunnel --url http://localhost:4321 --no-autoupdate
```

终端二会输出一个随机的 HTTPS 地址，例如 `https://random-name.trycloudflare.com`。把该地址发给访问者即可；本机仍然使用 `http://localhost:4321`。

- 两个终端都必须保持运行；关闭任一进程或电脑休眠后，公网地址就会失效。
- 每次重新启动 Quick Tunnel 都会生成不同地址，它只用于临时预览，不是正式部署。
- 以终端一实际显示的 `Local` 端口为准；如果 `4321` 被占用并自动改为 `4322`，终端二的 URL 也要同步改成 `http://localhost:4322`。
- 首页公开；业务页面使用网页登录。临时域名登录需要将 `BETTER_AUTH_URL` 改为实际 HTTPS 根地址并重启服务，结束后恢复本机地址。不要发送数据库连接串、认证密钥或 `.env`。
- 如果 `.tools/cloudflared` 不存在，可在当前 Linux x86_64 环境重新下载：

```bash
mkdir -p .tools
curl -fL --retry 3 \
  -o .tools/cloudflared \
  https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64
chmod 0755 .tools/cloudflared
./.tools/cloudflared --version
```


## 验收与回滚

应用发布后核对正式域名、登录保护和新资源；写入与角色验收使用隔离数据库。Git 推送不触发自动部署。回滚应用不恢复数据库，结构变化必须兼容旧版本，恢复数据需要核对版本和外键顺序后单独执行。
