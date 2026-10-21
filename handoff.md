# 项目交接

先读根 [README](README.md)、[AGENTS](AGENTS.md)，再按[文档导航](docs/README.md)进入目标主题。

## 最新交付

- 工作分支 `agent/content-console-redesign`，第八版页面实现 `861b565`，当日状态再次更正 `3111c28`。推广按第八版改为生命周期在上、每日单行录入在下；真实节点与累计三指标对齐，状态气泡固定数据日、次日安排独立，宽屏五条概览连标题 396px。
- 当日状态保存后保留“修改”，误选测试／放量淘汰可恢复本日覆盖前状态或重选其合法后继，完整刷新后仍可更正。数字及其他记录节点保留，恢复合法次日安排；详情入口共用并保留焦点。服务端复核同日原状态、权限、指纹和幂等，终态之后不得借此重启活动。
- 精确状态、指标事实和残留分开回放。暂停／测试结束待定逐日复盘，新草稿默认零且保留已有输入；非零跑量及残留计原阶段，残留不重启生命周期。稳定原阶段归属与实际区间追加快照已接入，旧事实和冻结快照兼容保留。
- 保存与午夜按活动＋日期合并队列及分组，保留其他草稿、节点、焦点和滚动；首次缺 ID 在公共 Inspector 原子补齐。非推广使用“分类均值查看／历史数据总览”、六列单层表头与两轮上下排列，明细复用真实节点。
- MiSans 5.0.0 自托管并保留许可；公共读取 500ms 延迟目标反馈、取消及旧响应隔离，导航统一 120ms 进度。总周期和排期保留现有业务布局。旧团队暂停写入仍返回 410。

## 验证与接手

159 项规则／事务／权限／迁移测试、类型检查、构建与迁移检查通过。本次状态更正在 1440／1024／390／320px 通过九组浏览器检查，覆盖测试／放量误选、同气泡及刷新后更正、数字与次日安排、其他记录节点、Inspector 与焦点；完整 `test:review-workbench` 回归通过。已实际查看本次截图和录像帧，见[更正交互验收索引](verified/2026-10-21_22-53_promotion-status-correction/README.md)。第八版完整视觉范围保留于下方历史索引。

公共 UI、时间线、阶段／例会快照与认证、年度、工作流、发布、登记时限、交互、退役暂停和面板动效回归完成。最终证据见[本轮正式组件验收索引](verified/2026-10-21_22-15_review-workbench-v8/README.md)，状态为已自检、待用户验收。

已按用户发布授权将 `3111c28` 上线至[正式推广复盘入口](https://qiuyun-frontend.vercel.app/business/daily-promotion-review)，Vercel 部署 `dpl_6Ksm5RJ2gmcPHfjnVdQJv2U9VVDP`。共享库此前已应用兼容迁移 `0036_precise_promotion_review.sql`，该次迁移前后均有私有备份，47 张表原有记录核对一致；本次更正不增加迁移。工作分支尚未合入 `main`。

本次发布后 36 项公网只读检查通过，含页面／接口登录保护、私有路径 404、15 份脚本／样式／字体许可资源与验收构建的摘要一致。业务写入与多状态视觉由上述隔离数据库验收覆盖，未向共享库写入验收数据。私有发布核对保存在 `.tools/review-state-edit-*.json` 与 `.tools/test-artifacts/review-state-edit-public-smoke.json`；原 `0036` 发布备份仍按[部署指南](docs/deployment.md)管理。

## 运行入口

- Node 22、pnpm 9.15.9；本机运行时 `.tools/runtime/node-v22.23.3-linux-x64/bin`。先构建，再运行 `pnpm test:review-workbench` 启动隔离业务验收，避免向共享 Neon 写入虚构记录。
- 公网：[内容工作台](https://qiuyun-frontend.vercel.app/business/operations-schedule)。Vercel CLI 手动发布，推送工作分支不会自动部署。
- 代码定位：[共享接入实例](docs/code-study.md#共享界面接入)；数据库维护：[数据库指南](docs/database-guide.md)；完整验证入口：[测试说明](tests/README.md)。
