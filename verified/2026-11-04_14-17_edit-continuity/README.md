# 编辑权连续性修复

已自检，发布核对中。此批沿用原界面、权限、60秒租约与业务版本校验，无数据库迁移或生产业务写入。

## 根因与修复

- 原前端将本地到期直接永久记为失锁；浏览器后台限频后返回，即使没有别人编辑，也必须手动接管。现在返回／聚焦时立即续期核实；只有自然到期且对象空闲时普通申请，复用原回读与指纹保护，原输入保持。
- 原pagehide只释放服务端，缓存页面仍留旧凭证；返回后续期判失效。现在离开同时清理本地持有状态，普通换页等待释放后申请，缓存返回重新核实。
- 原续期与占用读取可能迟到，影响换页后的新编辑权。现在核对页面代次及请求token，忽略旧页面／旧凭证响应。他人确认接管仍使旧编辑者只读，不自动夺回。

## 实际验证与边界

- [旧版复现](validation/continuity-before.log)：用仓库隔离时钟将浏览器与真实PostgreSQL接口同时推进61秒，旧版回页后无法继续，8秒等待失败；同一测试修复后通过。
- [连续性专项](validation/continuity.json)：过期返回、迟到PATCH跨Astro换页、pagehide/pageshow恢复处理、双角色接管及草稿保持。生命周期测试主动派发浏览器事件验证处理器，不声称实际浏览器命中BFCache。
- [协作回归](validation/regression.json)：真实并发、确认接管、旧确认拒绝、单对象续期、旧草稿拒绝覆盖、慢请求首次输入、推广／非推广／例会占用、排期Sheet、查帖及手机触控均通过。旧专项改用曝光／阅读量驱动点击率，避免操作已改为只读的计算字段。
- 259项规则、schema、类型检查、Node及Vercel构建通过。发布包预检与实际serverless包运行检查通过，原字体／中文PDF可正常生成；运行包PDF仅用于依赖核对，本次未将其重新声明为视觉验收。
- 45张桌面／手机稳定截图已实际查看；两段专项录像按0.5秒连续取样共62帧已逐张审查。合成账号及业务数据仅在本机独立测试库，无生产业务写入。

## 查看效果

| 场景 | 链接 |
| --- | --- |
| 管理员返回后继续填写 | [1920](screenshots/continuity-admin-resumed-1920.png) · [1440](screenshots/continuity-admin-resumed-1440.png) · [1024](screenshots/continuity-admin-resumed-1024.png) · [390](screenshots/continuity-admin-resumed-390.png) · [320](screenshots/continuity-admin-resumed-320.png) |
| 员工返回后继续填写 | [手机](screenshots/continuity-employee-resumed-390.png) |
| 真实接管仍需确认 | [确认框](screenshots/continuity-real-takeover-confirm-1440.png) |
| 非推广只读占用 | [桌面](screenshots/regression-nonpromotion-locked-1440.png) · [手机](screenshots/regression-nonpromotion-locked-390.png) |
| 例会占用与排期编辑 | [例会](screenshots/regression-meeting-whole-lock-1440.png) · [排期](screenshots/regression-schedule-edit-1440.png) |
| 专项过程 | [管理员](video/continuity-1.mp4) · [员工](video/continuity-2.mp4) |

原始产物在`.tools/test-artifacts/continuity-final/`和`collaboration-regression/`，[源码与覆盖](validation/source.json)。复现命令：设置本机`TEST_POSTGRES_URL`后运行`pnpm test:collaboration-continuity`、`pnpm test:collaboration-lookup`；使用项目Node22与Playwright缓存。
