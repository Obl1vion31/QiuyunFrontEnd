# 历史月份沿用月排期 V0

应用代码 `66407af`；复用实际 Vercel 目标运行包，构建包含类型检查，0错误／0警告。正式部署 `dpl_CedNaMG8Co9xaDVeEFPrMgKtrMis` Ready，正式域名与候选为同一部署。已自检并发布，待用户反馈。

2026-10及以前没有首次预排期确认的月份按历史月排期V0读取，不补造确认、封存或内容版本记录。历史月份调整仍要求原因；2026-11及以后保留原预排期门禁，帖子已有版本编号及发布／最新版本／权限规则保持。

截图来自真实隔离PostgreSQL与虚构帖子，非正式业务数据。八张最终图已实际查看；两角色1440覆盖历史月、补原因与实际创建V1，管理员1024查看布局，390仅检查明显遮挡、溢出与关闭可达。原面板与动效实现沿用。

| 角色／状态 | 最终截图 |
| --- | --- |
| 管理员／历史月份 | [1440](screenshots/admin-legacy-1440.png) |
| 管理员／调整原因 | [1440](screenshots/admin-reason-1440.png) |
| 管理员／已创建V1 | [1440](screenshots/admin-created-1440.png) |
| 员工／历史月份 | [1440](screenshots/employee-legacy-1440.png) |
| 员工／调整原因 | [1440](screenshots/employee-reason-1440.png) |
| 员工／已创建V1 | [1440](screenshots/employee-created-1440.png) |
| 管理员／历史月份 | [1024](screenshots/admin-legacy-1024.png) |
| 管理员／有限手机检查 | [390](screenshots/admin-legacy-390.png) |

验证覆盖本次月份兼容与直接共用门禁的改帖、移动／对换路径，同一目标包的结果复用。

- [历史V0接口与双角色真实创建](checks/legacy-v0.json)：旧月只读兼容、原因必填、未发及旧版本限制、11月原流程和12月门禁。
- [既有改帖门禁](checks/revision-gate.json)：发布、版本链、遗留请求重放与账号禁用。
- [移动／对换](checks/placement.json)：目标重核对、事务、幂等、并发、月份与封存事实保持。
- [候选读取](checks/candidate-checks.json)／[正式读取](checks/production-checks.json)：历史页匿名302、匿名会话200/null、受保护详情接口401。
- 正式已登录只读核对：2026-10显示“历史月排期V0”；《面试课第一轮②》V2（实发2026-10-27 18:01）的“创建改帖”已可用，并实际打开V2→V3表单。正式核对未提交业务变更。
