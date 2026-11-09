# 取消新版后继续改帖与全站使用说明

应用代码`1b1314f`，基于`311e7da`。正式部署`dpl_35QzKdJTCmgpsbnsVP3MnLmv9oAQ` Ready，与候选为同一部署。已自检并发布，待用户反馈。

最新有效版本按仍有未取消排期的最高版本判断，只有登记实发后才能派生；编号按包含取消版本的全部历史递增。V0已发、V1取消后可从V0创建V2，连续取消后继续递增。页面入口、表单、实发局部回显及创建事务共用资格规则，保留月份、原因、权限及推广安排限制。

说明沿用原页面、目录与操作图，先列常用操作，再说明条件与高影响操作；覆盖全站主要按钮、管理员专属与账号授权边界，并保留统计口径和原章节锚点。章节使用正确标题层级，键盘定位保留可见焦点，员工仍无管理页入口。

19张最终图含两张实际区块图，已通过整组与关键原图审阅。截图来自真实隔离PostgreSQL与虚构业务数据。1440×1000比较双角色同一来源和主要说明状态；1024×1000核对阅读布局，390×1000仅核对明显溢出、目录与关闭可达。面板和滚动动效沿用，不将有限手机检查表述为完整手机验收。

| 页面／状态 | 最终图 |
| --- | --- |
| 取消V1后同一V0恢复入口 | [管理员](screenshots/admin-restored-1440.png)／[员工](screenshots/employee-restored-1440.png) |
| 改帖预览V0→V2 | [员工表单](screenshots/employee-revision-v2-1440.png) |
| 实际创建与发布后恢复入口 | [已创建V2](screenshots/employee-created-v2-1440.png)／[已登记实发V2](screenshots/employee-published-v2-1440.png) |
| 全站操作与权限速查 | [管理员1440](screenshots/admin-guide-actions-1440.png)／[员工1440](screenshots/employee-guide-actions-1440.png)／[员工1024](screenshots/employee-guide-actions-1024.png) |
| 排期、发布与改帖 | [管理员1440](screenshots/admin-guide-versions-1440.png)／[员工1440](screenshots/employee-guide-versions-1440.png)／[员工1024](screenshots/employee-guide-versions-1024.png) |
| 高影响权限与取消示例 | [权限表区块](screenshots/employee-guide-high-impact-1440.png)／[取消后编号示例区块](screenshots/employee-guide-cancel-example-1440.png) |
| 日常复盘及年度／月会流程 | [日常复盘](screenshots/employee-guide-reviews-1440.png)／[年度与月会](screenshots/admin-guide-monthly-1440.png) |
| 管理员维护与员工页尾 | [管理员](screenshots/admin-guide-end-1440.png)／[员工](screenshots/employee-guide-end-1440.png) |
| 有限手机检查 | [目录390](screenshots/employee-guide-directory-390.png)／[改帖说明390](screenshots/employee-guide-versions-390.png) |

验证按影响选择，最终实际Vercel目标构建包含类型检查，0错误／0警告，保留59条既有hint。接口和历史月份路径未随说明精修变化，其已通过结果复用；最终包定点重验说明布局、目录与角色。

- [改帖接口8组](checks/revision-api.json)：发布、连续取消、已发V1继续派生、取消来源拒绝、编号与取消记录保持、双方真实并发、推广结束事实及权限。
- [改帖浏览器3组](checks/revision-browser.json)：同对象双角色入口与V2预览、员工真实创建、V2首次发布后局部恢复V3资格及关闭权限。
- [说明浏览器](checks/guide-browser.json)：目录顺序、原锚点、键盘、前后退、刷新、正文节点保留、角色裁剪及管理页403。截图等到目标章节完成定位后取证。
- [历史月份回归](checks/legacy-month.json)：历史V0只读兼容、11月流程、12月门禁、原因和两角色真实创建。
- [候选](checks/candidate-checks.json)／[正式](checks/production-checks.json)：相关受保护页面、匿名会话及接口状态通过；改帖脚本和说明样式各一项SHA-256与实际目标包一致。

正式账号只读查看了新说明目录及取消编号示例；原《面试课第一轮②》V2已有有效新版，入口保持隐藏；最新有效且已发的《面试课第二轮①》V0可打开V1表单。正式数据当时无现成的“已发来源＋更高取消版本”样本，该场景由上述实际包与隔离数据库验证；正式核对未提交业务变更，无迁移或历史回填。
