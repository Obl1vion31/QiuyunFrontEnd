# 项目交接

先读根 [README](README.md)、[AGENTS](AGENTS.md)，再按[文档导航](docs/README.md)进入目标主题。

## 最新交付（2026-10-23）

- 工作分支 `agent/content-console-redesign`，本轮实现 `798acaf`。用户批准的周例会整合及四项每日体验已经接入正式组件，验收证据见[本轮索引](verified/2026-10-22_22-04_weekly-review/README.md)。已按用户授权于 2026-10-23 公网发布，发布源 `f2e0730`；工作分支尚未合入 `main`。
- 推广页顶部恢复每日复盘／历史总览；新增阶段讨论进入周例会。旧阶段快照只读、旧 v2/v3 例会继续兼容。周例会新建 v4 空白文字模板，候选默认不勾选，可全选本期；月例会暂缓。
- 结论与行动在前，月历核对仅保留链接。测试按最后测试日和暂停／终止节点纳入完整阶段，放量按区间真实事实；卡片提供历史／同期比较、本帖历史、上次复盘及来源。二轮携首轮对照，对照不重复增加主复盘数。实际截止日、首次录入和最近更新分别呈现。
- 本期总量按日期内全部真实跑量独立统计，不累加跨期测试卡。暂停／待定和残留归原阶段而不计正常投放日；残留和历史放量更正通过往期追加卡呈现相关事实。草稿显式刷新、保留输入和有效勾选，失效项确认；定稿核对来源指纹，冻结 V0，修订追加 V1+。
- 每日内容／版本旁可悬停看笔记 ID、点击或键盘查看；首次 ID 用行旁小气泡补齐，不自动打开 Inspector。逻辑帖子的各版本共用 ID 草稿，随指标原子保存，已有 ID 更正仍走原确认入口。
- 测试结束待定的新草稿默认五项零及继续待定。每日提供一键保存，捕获当前可填最早日期队列，全部成功或全部回滚；保留单行提交、初始指纹、请求幂等、权限和 ID 一致性，保存后更新累计与全部分组，下一日不自动并入本批。
- 已上线的当日状态再次更正继续保留，误选终态可恢复该日覆盖前状态；数字、合法次日安排与其他记录节点不丢。终止当日仍可结算真实指标，之后不自动进入普通待办；测试淘汰后残留走单独补录。

## 验证与设计沉淀

全部 166 项测试通过，其中周例会规则 7 项；类型检查、构建与 `db:check` 通过。`test:weekly`、`test:review-workbench`、`test:ui`、`test:reviews`、`test:status-correction`、`test:timeline`、`test:motion` 通过。正式每日与周例会检查 1920／1440／1280／1024／736／390／320px；状态更正九组含 1440／1024／390／320px，面板动效含 1440／1280／390／320px。已实际查看截图和录像关键帧；完整范围、数据来源和链接见验收索引。

业务规则更新到 [DECISIONS](docs/DECISIONS.md)，字体、层级、卡片放置、每日列与 ID 气泡、批量动作、加载及动效继承进入 [DESIGN](docs/DESIGN.md)。已替换旧的独立阶段入口、提醒日默认勾选及 Inspector 首次补 ID 条款；源码定位和真实接入实例同步到 [code-study](docs/code-study.md)、目录 README 和测试说明。

## 发布与数据边界

本轮只扩展现有会议 JSON v4 和日度事务服务，没有新增 SQL 迁移；测试全部使用隔离 PGlite 和虚构账号／业务事实，未向共享 Neon 写入验收数据。共享库已在上一轮应用 `0036_precise_promotion_review.sql`，不要重复迁移。

公网已发布本轮 `798acaf` 实现，发布源 `f2e0730`，地址 [工作台](https://qiuyun-frontend.vercel.app/business/operations-schedule)／[周例会](https://qiuyun-frontend.vercel.app/business/meeting-review)，部署 `dpl_7XGXzLX94YoKjAp5gn9CJiVQSxeb`。2026-10-23 北京时间发布后 69 项检查通过，45 个线上资源与干净发布构建的 SHA-256 一致；正式域名绑定、登录保护、API 未登录拒绝、私有路径不可访问及 1440／390px 登录页已核对。业务写入沿用隔离验收，不在线上补造数据。发布时将已提交版本导出到独立目录，未包含另一组未提交的非推广／Inspector 改动。应用回滚基线为上一部署 `dpl_6Ksm5RJ2gmcPHfjnVdQJv2U9VVDP`；既有备份与回滚入口见[部署指南](docs/deployment.md)。推送分支不会自动部署。

## 接手入口

Node 22、pnpm 9.15.9；WSL 仓库 `/home/obl1vion/projects/qiuyunFrontend`，运行时 `.tools/runtime/node-v22.23.3-linux-x64/bin`。先构建，`pnpm test:weekly` 验证本轮，其他命令见[测试说明](tests/README.md)。原始产物 `.tools/test-artifacts/meeting-weekly/`、`review-v8/`，最终截图与录像在上述 verified 索引。

业务与界面以本轮规范覆盖旧条款，既有第八版布局和状态更正仍继承；下次不重新设计已确认的概览、每日列或公共 Inspector，不把旧图中的整套首次 ID Inspector、独立阶段新建入口恢复回来。
