# 例会准备与多人协作升级验收

- 对应实现：`a1e8faa`、`c80661d`，最终代码 `b0f2ba8`；工作分支 `agent/content-console-redesign`。
- 时间：2026-10-28 18:15，北京时间。状态：已实际查看最终图像与录像关键帧，待用户使用反馈。
- 发布：正式部署 `dpl_3B2VDnS8nLpSYv2KWWSTVqGrt3zk`；[7项候选检查](candidate-smoke.json)、[105项正式核对及66项资源哈希](public-smoke.json)通过；[验证汇总](validation.json)。公网检查未写业务数据。
- 数据：正式组件配合本机独立 PostgreSQL 临时库和虚构账号／业务事实；图中数字不代表真实运营结果。临时地址已关闭。
- 业务验证：221项规则、db:check、Node构建、真实HTTP认证、公共界面、年度规划、例会创建／修订／回溯／PDF及多人综合回归通过。当前综合回归见 [结果](result.json)。
- 桌面：1920／1440／1280／1024px准备缺项态；1440px齐全、正文、定稿、账号、查帖、管理员位置、员工冲突与历史只读。相邻原界面回归还覆盖390／320px；本轮新增功能没有做手机专项改版。
- 恢复：独立空库50张表、109行逐表摘要一致，拒绝覆盖非空目标；[演练结果](restore-result.json)。这是小型隔离演练，不作为生产恢复耗时承诺。
- 迁移：0041仅追加协作／账号审计表及启用字段；原有47张表逐表核对保持，[迁移核对](migration-result.json)。备份在私有工具目录，不进入本索引。

| 场景 | 验收重点 | 最终图像 |
| --- | --- | --- |
| 例会缺项 | 仅本次合格来源；未结束测试不出现；日期和版本清楚；未齐全不能展开 | [1440](meeting-gaps-1440.png) · [1024](meeting-gaps-1024.png) · [1280](meeting-gaps-1280.png) · [1920](meeting-gaps-1920.png) |
| 来源齐全 | 原页补齐后刷新，保留文字与选择，可进入正文 | [准备完成](meeting-ready-1440.png) |
| 正文与定稿 | 准备区收起；继承原卡片及结论布局；非推广只读；冻结来源 | [正文](meeting-body-1440.png) · [定稿](meeting-finalized-1440.png) |
| 管理员位置 | 导航同行，不改变行高；只看姓名、记录和字段，不显示未保存值 | [管理员](admin-presence-1440.png) |
| 员工冲突 | 占用时冻结字段、提示可见，按钮不挤压文字；旧表单不能覆盖新值 | [被占用](employee-locked-1440.png) |
| 历史截止日 | 旧窗口外值原样保留，明确只读 | [历史记录](nonpromotion-historical-1440.png) |
| 推广历史 | 宽屏帖子视图有对应金额与成本表头 | [表头](history-1440.png) |
| 账号管理 | 名称、角色、状态与操作分列；改名／停用／恢复与会话失效 | [账号](accounts-1440.png) · [更新后](accounts-updated-1440.png) |
| 查找旧帖 | 名称／ID查找、同名版本、只读全程与原页链接、空态和Esc | [结果](lookup-results-1440.png) · [详情](lookup-detail-1440.png) · [空态](lookup-empty-1440.png) |

[员工编辑、连续保存、续期失效及重新取得编辑权录屏](employee-collaboration-1440.webm)。已实际查看 [帧1](employee-frame-1.png)、[帧2](employee-frame-2.png)、[帧3](employee-frame-3.png)，输入保留、反馈和面板未发生异常跳动。
