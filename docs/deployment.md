# 预览、发布与回滚

## 正式运行包归档与旧部署清理

GitHub 保存源码历史，本机永久保存每次正式发布的运行包；Vercel 保留最近三个成功 Production 版本、最近三个部署，以及域名绑定、当前目标、回滚目标和本机最近观察到的两个正式版本。实际保留数量可能超过三个。旧预览地址随部署删除失效；应用包不等于真实数据或密钥备份。

统一工具为 `scripts/vercel-releases.py`（Python 3，Linux／WSL，无新增 Python 依赖）。两个仓库的工具和专用测试保持相同实现。先激活既有 Node 环境；CLI 不在 PATH 时用 `VERCEL_CLI` 指向现有可执行文件，不另行全局安装。工具核对当前仓库和项目，只操作指定项目；所有动作默认预检，写入使用显式 `--apply`。

```bash
python3 scripts/vercel-releases.py inspect --project qiuyun
python3 scripts/vercel-releases.py archive --project qiuyun --deployment dpl_ID --apply
python3 scripts/vercel-releases.py verify --project qiuyun --deployment dpl_ID
python3 scripts/vercel-releases.py publish --project qiuyun --deployment dpl_ID --apply
python3 scripts/vercel-releases.py cleanup --project qiuyun --limit 20 --apply
python3 scripts/vercel-releases.py policy --project qiuyun --apply
```

正式发布顺序为：沿用本项目现有构建生成不接正式域名的 READY 候选 → 完成对应功能验收 → 通过 `publish` 归档原始产物、切换版本、只读核对并清理。不能绕过归档直接切正式域名；本工具不替代候选功能验收、不重新构建，也不调整应用或数据库配置。

归档按项目和部署 ID 区分，包含压缩的原始运行目录、源码快照、依赖锁、运行时、文件摘要和配置键的 ID／更新时间。部署元数据与包内 SOURCE_COMMIT 不同时保留两个源码快照，不声称 Git 提交等同于当时可能有未提交内容的构建。已有包校验通过后复用；损坏、下载失败、空间不足或配置缺失均停止发布与清理，不覆盖旧包。SHA256SUMS 支持独立校验；恢复时仍须核对数据库版本和另存的密钥。

清理先核对所有正在使用的域名均有完整本机归档，再检查正式服务；每次最多二十个，每个删除前重新核对发布清单和域名。发布变化、构建进行中、接口错误或检查失败即停止，不自动修改域名或回滚。每批私有日志保留具体删除 ID 和前后检查结果。七天自动保留策略仅为补充，平台例外仍可能保留更多部署。

本机运行包不自动删除。云盘由用户处理；电脑／WSL 损坏的风险仍存在，但不作为删除无用旧部署的前置条件。秘密单独私有保存，不进入 Git、公开日志或归档元数据；本次不追溯下载所有更早的运行包。

归档位于 Git 公共目录所属工作区的 `.tools/backups/vercel-releases/qiuyun/`，不随临时 worktree 删除。正式发布需通过私有会话显式提供 `RELEASE_DATABASE_URL`，仅执行强制只读的结构／迁移记录导出；或设置 `RELEASE_DATABASE_BASELINE` 指向已核对的 schema.sql、migration-journal.csv 所在目录。不能使用开发库连接，不导出业务行。相同结构与迁移记录在本机共享基线，包内仍包含可独立使用的文件。Vercel 中不能读取原值的密钥继续单独管理，不把下载配置键当成完整密钥备份。

## 公网托管

正式入口：[内容工作台](https://qiuyun-frontend.vercel.app)。Vercel 项目为 `qiuyun-frontend`，与 Formward 使用同一账号、独立配置；当前通过 CLI 发布，Git 推送不自动部署。用户已于 2026-10-23 持续授权：修改完成必要测试与视觉自检后直接发布并核对结果，无需每轮再次确认，直到用户通知变更；用户于2026-10-31进一步授权，通过必要测试与视觉自检后可直接同步并推送 main，推送前核对远端并保留无关修改。

Production 变量为 `DATABASE_URL`、`BETTER_AUTH_SECRET`、`BETTER_AUTH_URL` 和 `ENABLE_EXPERIMENTAL_COREPACK=1`，继续使用原 Neon。数据库连接与认证密钥设为 Secret；认证 URL 使用正式 HTTPS 根地址。本机 `.env` 为 `APP_ENV=development`，仅通过 SSH 连接上海 `qiuyun_dev`；预览环境不连接正式业务库。运行时数据库地址不从构建期变量回退，Vercel Production 兼容已有系统环境标识。

开发库隔离工作只更新本机连接、工具及说明，不发布网站、不调整 Production 变量、不关闭 Neon。后续正常发布时按原流程显式取得 Production 构建配置，不能把开发 `.env` 当作正式运行配置。

聚光应用创建后增加服务端变量 `XHS_JUGUANG_APP_ID`、`XHS_JUGUANG_APP_SECRET`（密钥设为 Secret）；未配置时公开回调就绪检查仍可访问，发起授权明确返回尚未配置。令牌保存依赖0052兼容追加迁移；认证根密钥轮换后，聚光连接需重新授权。自动续期另需 Production Secret `CRON_SECRET`（随机至少32字符），`vercel.json` 中三个每日任务复用 `/api/cron/juguang-renewal`。当前Hobby每个任务每天一次，时刻有小时级偏差；剩余16小时内刷新，失败留待下一时段，手动检查保留到期刷新。发布后在 Vercel 项目 Cron Jobs 核对三个任务已启用，并查看执行日志；接入管理查看最近续期及有效期。定时凭据修改须重新部署生效，不向浏览器返回。正式回调固定使用 `https://qiuyun-frontend.vercel.app/api/integrations/xiaohongshu/callback`，协议及操作入口见 [第三方接入](../src/integrations/README.md)。

本机开发配置已与正式Neon分离时，发布和正式维护须显式读取已核对的Production配置；根`.env`及其他工作树的默认应用账号不作为正式迁移凭据。保持既有工作树与开发配置，不能为发布覆盖它们。

先按[检查选择](../tests/README.md#本轮如何选择检查)验证本次改动。`pnpm build`已包含类型检查；有本次有效构建结果时不再重复`pnpm check`。规则／接口／浏览器选受影响路径，schema或迁移变化才运行`pnpm db:check`；认证和权限变化保留相关角色及直调接口验证。

仅修改未参与应用构建的说明文档／协作规范时，检查文档后提交、同步main即可，不构建或部署网站。需要发布应用时，安装并登录Vercel CLI，在已关联的仓库根目录运行：

```bash
vercel deploy --prod --skip-domain
```

聚光定时任务的本机预构建使用 `vercel build --prod`，确认 `.vercel/output/config.json` 包含与 `vercel.json` 一致的三个 `crons`；仅运行 `astro build`／`pnpm build` 不会把定时配置合入预构建产物。

本机使用 `--prebuilt` 发布时，构建必须带 `VERCEL=1 VERCEL_ENV=production`。优先构建并验收实际发布目标，同一输入的产物不重复构建；Node与Vercel只有在adapter差异或现有夹具确需分别验证时才各构建一次。应用输入变化后仅重建最终受影响目标，说明文档／验收记录变化不触发重建。

`astro.config.mjs`显式信任正式HTTPS域名，不依赖本机`.env`中的认证URL；不得关闭`security.checkOrigin`或放开全部域名。发布前核对manifest包含正式域名。认证、来源校验、域名或adapter变化时，补测相关业务API的匿名同源`multipart/form-data`／URL编码表单401及外站403，不能只检查JSON；普通模块发布不重复遍历无关接口。

新的隔离构建目录须执行`pnpm install --frozen-lockfile`，不能软链仓库外的`node_modules`，避免Vercel追踪漏文件；同一目录的依赖已匹配锁文件时无需反复安装。新增运行时依赖、改变引用路径、adapter或打包追踪时，核对实际包中受影响的外置依赖。

中文PDF验证只在PDF生成／导出／打印链路，PDF实际使用的共享组件、打印样式或字体，以及其Chromium／Puppeteer等依赖、运行环境或打包追踪发生变化时执行。用实际目标包和最小代表样本验证受影响内容；共享打印组件同时影响周／月会时才分别覆盖。普通业务页面、文档修改和仅重新打包不触发PDF生成，也不重复运行整套例会流程。

需要先验证动态路由时，使用`deploy --prebuilt --prod --skip-domain`，核对候选后再通过上述`publish`入口归档并切换正式版本。同一部署ID提升到正式域名后，确认域名指向、受影响入口、登录边界及新增／修改资源；候选已经通过的同包完整套件不在正式域名再跑一遍。不可用静态资源成功替代受影响服务端功能验证。

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

应用发布后核对部署ID、正式域名、受影响入口、登录保护和本次变动资源；未改变的首页封面、字体切片和无关模块不逐项重测或重复哈希。改到公共资源分发或入口保护时再扩大对应范围。写入与角色验收使用隔离数据库。Git推送不触发自动部署。回滚应用不恢复数据库，结构变化须兼容旧版本；恢复数据需核对版本和外键顺序后单独执行。
