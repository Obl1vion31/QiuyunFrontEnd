# 月计划与已有排期直接关联

状态：已自检、已发布，待实际使用反馈。页面与数据库样本均为本机隔离数据；未向正式数据库写入测试内容。

## 使用方式

1. 月例会会后定稿后，进入排期月历，在上方查看 Week 1–5 的计划、已关联和待审数量。
2. 点击“TMUA 讲义 ×2”等计划，在原月历直接勾选同学科、同分类帖子。可以先选一篇；跨 Week 或更正关联时填写原因。
3. 点击“保存关联”。直接编辑权限即时生效；需审核的账号沿用原审批入口，并预留名额。退出选择后卡片恢复原 Inspector。

定稿前提前排好的帖子、定稿后普通入口建立的帖子都可补关联。补关联不建帖、不增加计划数量；真正新增任务仍按追加处理。已关联计划可展开更正／解除；若旧帖已移出本月或被筛选隐藏，条件出现“取消未显示的勾选”，只修改本次选择，确认保存后才生效。原计划明确指定的已有／遗留帖子沿用原入口。

## 页面证据

- [1440 原月历与 Week 进度](screenshots/calendar-default-1440.png)
- [1440 直接勾选](screenshots/calendar-selection-1440.png)
- [1920 已关联](screenshots/calendar-linked-1920.png) · [1440 已关联](screenshots/calendar-linked-1440.png) · [1024 已关联](screenshots/calendar-linked-1024.png)
- [跨 Week 原位原因](screenshots/calendar-cross-week-1440.png) · [保存失败保留选择](screenshots/calendar-save-failure-1440.png)
- [员工待审](screenshots/calendar-pending-employee-1440.png) · [管理员原 Inspector 审批](screenshots/calendar-approval-admin-1440.png)
- [过期保存必须刷新](screenshots/calendar-stale-refresh-1440.png) · [旧标签页补来源](screenshots/calendar-old-tab-source-1440.png)
- [实际运行包的跨月隐藏关联](runtime-roles/hidden-association-1440.png) · [关联及解除的具体历史](runtime-roles/association-history-1440.png)
- [完整操作录像](video/monthly-linking.webm) · [从首次绘制开始的首屏录像](video/first-paint.webm)
- [操作录像帧 1](review/monthly-linking-final-01.png) · [操作录像帧 2](review/monthly-linking-final-02.png) · [首屏过程帧](review/first-paint-final-01.png)

主浏览器流程有 23 张稳定图；桌面 1920／1440／1024 分别检查月历、选择与关联状态，手机 390／320 仅核查遮挡、页面溢出和入口可达。原卡片颜色、月历格网、导航与 MiSans 保留，选择前后不重排月历格网。两角色使用同一对象、同一 1440 视口另行对照；隐藏关联入口补查三个桌面宽度及手机两档。保存、新建、失败、更正、审批及 Inspector 状态分别按实际操作采集。

## 验证结果

- 隔离 PostgreSQL [9 组接口验证](checks/integration.json)：定稿前后补关联、部分保存、Week 5、跨 Week、占用、同时提交、独立分组、批量回滚、幂等、审批／驳回释放及旧审批兼容。计划数量、内容修订和冻结快照保持原值。
- [9 组真实浏览器流程](checks/browser.json)：键盘、取消与焦点、503 保留选择后重试、Inspector 恢复、普通新建跨月补读、旧页来源校验、员工提交／管理员批准及强制刷新。月计划无轮询；保留既有业务提醒。
- [最终 Vercel 运行包的两角色验证](runtime-roles/results.json)：员工先保存生效，管理员旧凭据返回 409，只有刷新后才能继续；真实改期接口把已关联帖移到下月后，可解除旧关系且保留其他关联与历史。
- [三种首屏场景](checks/first-paint.json)：冷缓存与字体慢请求、硬刷新暖缓存、站内导航。逐帧记录月历和来源池坐标，计划标记随 SSR 首次展示，未出现后补标记造成的位移。
- 261 项规则检查、schema 检查、Node 与 Vercel 类型／构建、公共 UI、完整月计划流程、排期与审批、发布时间回归通过。[检查清单](validation.json)记录各项覆盖与对应源码。
- [最终运行包检查](release/runtime-bundle.json)：外置依赖、Chromium 压缩文件、正式域名与中文字体可用；实际生成并渲染 [月会 5 页 PDF](release/runtime-monthly.pdf) 和 [周会 3 页 PDF](release/runtime-weekly.pdf)，8 页均已查看。[渲染总览](review/pdf-final.png)。
- 公网候选 18 项／3 个关键资源、正式域名 18 项／67 个构建资源哈希通过；同源表单未登录返回 401，跨站 403，新接口未登录 401，停用协作接口 410。[候选结果](release/candidate.json) · [正式结果](release/production.json)。

复验入口：`TEST_POSTGRES_URL=本机隔离连接 pnpm test:monthly-links`；首屏另运行 `node --import tsx tests/monthly-plan-links-first-paint.browser.ts`。实际运行包复验使用本地私有包装器连接隔离 PostgreSQL。主接口／浏览器样本固定业务时钟为 2026-11-05 12:00（上海），数据库审计时间使用真实时钟；最终运行包两角色与首屏流程使用真实时钟。PDF使用前轮已有的隔离冻结样本。

## 源码与发布

- 正式基线：`d4fbfb46282b971227a647873ea9732c595e3429`。
- 最终应用：`098835e3469138c7a213f1fa5c6d5c628e36ce1e`，分支 `codex/monthly-plan-linking` 已同步 `main`。
- 独立工作树：`.tools/releases/monthly-plan-linking-20261105`；原工作区无关修改保留。
- [正式排期入口](https://qiuyun-frontend.vercel.app/business/operations-schedule)；部署 `dpl_HDfNASxNyVqdNkj7qSprPXWE6JCH` 为 READY，正式域名指向一致。[发布记录](deployment.json)。
- 不新增表、迁移或前端依赖。执行关联使用现有记录和审批，版本指纹、事务内锁及请求幂等；只在进入选择、换月和保存时按需读取，不拉取完整例会快照。
