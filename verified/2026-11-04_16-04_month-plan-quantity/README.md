# 月计划减号移回与待分配数量器

已自检，正式发布核对待收尾。保留常驻内容池、108px空Week、字体及配色；无接口或数据库迁移，合成业务仅写入隔离数据库。

- 左侧减号直接移回一篇，无动作菜单；同周×N逐篇递减，总计划量不变。
- 右侧新做来源常驻“− 数字 +”，数字是待分配量。数量、分周、暂时确认后都可增减或输入，只改变空闲新做名额，保留已分周／关联ID；0时禁减、禁拖，仍可增加。手机完整名称在上、横排数量器靠右在下。
- 每篇遗留只对应一个名额，不显示数量器，未选择不自动纳入；锁定、追加、审核和48小时规则保留。
- 完整操作复现输入聚焦与保存分别取锁的竞争：迟到取锁回执会复活已释放凭证。现由可见编辑器与业务保存共用ensure任务，保留服务端租约、版本及真实接管校验。[旧版真实请求顺序](validation/lease-race-before.json)使用隔离数据与token哈希，不含生产凭据。

## 查看效果

| 场景 | 截图 |
| --- | --- |
| 桌面合并与直接减号 | [1920](screenshots/plan-merged-1920.png) · [1440](screenshots/plan-merged-1440.png) |
| 数量输入与遗留选择 | [1440](screenshots/plan-quantity-1440.png) · [390](screenshots/plan-quantity-390.png) |
| 归零仍可增加 | [1024](screenshots/plan-quantity-controls-1024.png) · [390](screenshots/plan-quantity-controls-390.png) · [320](screenshots/plan-quantity-controls-320.png) |
| 暂存、失败及锁定追加 | [暂存](screenshots/plan-partial-confirmed-1440.png) · [失败保留](screenshots/plan-confirm-failure-1440.png) · [锁定追加](screenshots/monthly-locked-addition-1440.png) |
| 操作过程 | [桌面拖放与数量](video/plan-desktop.mp4) · [手机真实触控](video/plan-phone.mp4) |

五档31张稳定图和两段录像的全部0.5秒取样48帧已实际打开审查。首版320px将名称挤成竖排，已修正，旧中间图仅在.tools保留。池内按原规则纵滚；首屏逐帧采样确认高度连续。最终运行包周／月PDF依赖核对通过，本轮不重声明整份PDF视觉验收。

[完整浏览器链路](validation/browser.json)覆盖逐篇移回、右侧0／1／2／3与输入、Week内ID及卡片顺序保护、清空数量按0保存、暂存刷新、失败重试、重排、已有／遗留、定稿、审批及锁定追加。261项规则、数据库结构检查、类型检查、Node／Vercel构建、月计划接口、公共UI、真实PostgreSQL双角色协作与后台返回专项通过；[后台专项](validation/continuity.json)。后台专项的61秒由隔离客户端／服务端统一推进，真实窗口失焦／恢复已验，hidden与BFCache仍为处理器测试。

源代码哈希见[source.json](validation/source.json)。复现：先Node构建，运行pnpm test、pnpm db:check、node --import tsx tests/monthly-workflow.integration.ts、node --import tsx tests/monthly-workflow.browser.ts、pnpm test:ui；协作两专项需本机TEST_POSTGRES_URL，使用项目Node22／Playwright缓存，截图位置由MONTHLY_WORKFLOW_EVIDENCE_DIR指定。

发布合并保留main的首页指针交互与非推广任务列表更新（6358bdb）。合并后的规则、Node构建、公共UI、真实PG协作及非推广Inspector通过；最终月计划流程含清空为0与已排卡片顺序保护，最终Vercel构建与运行包核对通过。
