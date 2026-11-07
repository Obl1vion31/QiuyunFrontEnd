# 排期历史语义与旧定稿归属验收

应用：`7414a80`。沿用已发布的磨砂材质与680px单层Inspector。状态：已自检，待用户反馈；候选部署已通过，正式核对随后补记。

排期表移除计划W号。详情和查帖共用执行／具体改期／内容设置三组，默认折叠、空组省略；同次遗留接入及跨授权Week合为一条，日期与R修订号只在变更组。定稿按明确关联先预留名额，旧读取按冻结具体排期及候选恢复身份，22篇不会因重复名额少算。

## 直接查看

- [执行记录](screenshots/admin-history-execution-1440.png)、[日期变更](screenshots/admin-history-schedule-1440.png)、[内容设置](screenshots/admin-history-content-1440.png)、[查帖](screenshots/lookup-history-1440.png)。
- [V0的原Week 1帖子](screenshots/admin-v0-1440.png)、[V0的Week 4遗留帖](screenshots/admin-v0-carry-1440.png)。
- [展开、保存与未保存保护录像](media/workflow-1440.mp4)、[慢字体、慢历史、刷新及站内导航录像](media/first-paint-1440.mp4)。原始WebM同目录保留。录像包含测试脚本停留，不作为性能计时依据。
- [新生成的冻结月会PDF](pdf/monthly-sealed.pdf)，四页已逐页查看；[打印对照](review/pdf-monthly-sealed-01.jpg)。

## 数据与核查

页面样张来自本机独立临时PostgreSQL：22篇同类计划，包含明确遗留、较早未关联的V1、长标题及旧重复名额。真实接口完成跨月接入、同Week微调、混合标题修改及管理员定稿；旧重复数据仅注入隔离库，读后逐值比较冻结JSON不变。样本为测试同周微调将15:00改为18:00；正式目标仍为11月25日15:00，修订号3。

指定技术纠正的执行JSON一条、日期历史一条已在锁定事务中精确删除，私有前值不公开；正常“未收到需求”“需求未到”、当前日期、修订号、另一帖、计划及冻结材料哈希均保持。清理不产生新的业务历史。[正式只读核对](checks/live-after.json)。

| 视图／状态 | 视口 | 角色 | 数据来源 | 实查状态 |
|---|---|---|---|---|
| 详情默认折叠、执行／日期／设置各展开 | 1920／1440／1024 | 管理员、员工 | 隔离22篇样本 | 已自检／待用户反馈 |
| V0明细两帖各自归属、长标题 | 1920／1440／1024 | 管理员、员工 | 同一隔离样本 | 已自检／待用户反馈 |
| 查帖历史全部展开 | 1920／1440／1024 | 管理员 | 同一隔离样本；接口与详情分组逐值相等 | 已自检／待用户反馈 |
| 保存回显、键盘折叠、未保存继续／放弃 | 1440 | 管理员 | 真实接口及公共确认框 | 已自检／待用户反馈 |
| 首次进入、1200ms慢字体／900ms慢历史、硬刷新、暖刷新、站内导航 | 1440 | 管理员 | 新浏览器上下文、真实接口，仅注入网络延迟 | 已从首次绘制录制并审查 |
| 明显遮挡、页面级溢出与关闭入口 | 390 | 管理员 | 同一隔离样本 | 有限触屏检查，非手机填写验收 |
| 冻结月会与PDF | 1440／A4横版 | 管理员 | 同种子独立隔离样本，当前正式组件 | 四页已自检 |

## 验证记录

- 291项规则通过；历史、旧周板及PDF的18项聚焦复验通过；schema检查、Node及Vercel构建均0错误／0警告。
- 实际Vercel运行包7组专项、6组排期核对接口及公共UI回归通过；运行包依赖、Chromium和中文PDF均实际检查。
- 46张稳定截图、两段录像已审查；工作流2fps、首屏10fps共284抽样帧，另保留清晰原图和局部复核。标题疑点经原图像素与DOM核对为预览误判，未改动标题实现。
- 打印空事项尾页在整套专项后修正，修正后的同样本首屏／PDF聚焦流程再次通过；网页布局保持，最终PDF为后一次实际输出。未知计划依据由规则测试覆盖，未另做独立界面样张。

## 全部截图

- [admin-detail-folded-1024](screenshots/admin-detail-folded-1024.png)
- [admin-detail-folded-1440](screenshots/admin-detail-folded-1440.png)
- [admin-detail-folded-1920](screenshots/admin-detail-folded-1920.png)
- [admin-history-content-1024](screenshots/admin-history-content-1024.png)
- [admin-history-content-1440](screenshots/admin-history-content-1440.png)
- [admin-history-content-1920](screenshots/admin-history-content-1920.png)
- [admin-history-execution-1024](screenshots/admin-history-execution-1024.png)
- [admin-history-execution-1440](screenshots/admin-history-execution-1440.png)
- [admin-history-execution-1920](screenshots/admin-history-execution-1920.png)
- [admin-history-schedule-1024](screenshots/admin-history-schedule-1024.png)
- [admin-history-schedule-1440](screenshots/admin-history-schedule-1440.png)
- [admin-history-schedule-1920](screenshots/admin-history-schedule-1920.png)
- [admin-v0-1024](screenshots/admin-v0-1024.png)
- [admin-v0-1440](screenshots/admin-v0-1440.png)
- [admin-v0-1920](screenshots/admin-v0-1920.png)
- [admin-v0-carry-1024](screenshots/admin-v0-carry-1024.png)
- [admin-v0-carry-1440](screenshots/admin-v0-carry-1440.png)
- [admin-v0-carry-1920](screenshots/admin-v0-carry-1920.png)
- [detail-mobile-390](screenshots/detail-mobile-390.png)
- [employee-detail-folded-1024](screenshots/employee-detail-folded-1024.png)
- [employee-detail-folded-1440](screenshots/employee-detail-folded-1440.png)
- [employee-detail-folded-1920](screenshots/employee-detail-folded-1920.png)
- [employee-history-content-1024](screenshots/employee-history-content-1024.png)
- [employee-history-content-1440](screenshots/employee-history-content-1440.png)
- [employee-history-content-1920](screenshots/employee-history-content-1920.png)
- [employee-history-execution-1024](screenshots/employee-history-execution-1024.png)
- [employee-history-execution-1440](screenshots/employee-history-execution-1440.png)
- [employee-history-execution-1920](screenshots/employee-history-execution-1920.png)
- [employee-history-schedule-1024](screenshots/employee-history-schedule-1024.png)
- [employee-history-schedule-1440](screenshots/employee-history-schedule-1440.png)
- [employee-history-schedule-1920](screenshots/employee-history-schedule-1920.png)
- [employee-v0-1024](screenshots/employee-v0-1024.png)
- [employee-v0-1440](screenshots/employee-v0-1440.png)
- [employee-v0-1920](screenshots/employee-v0-1920.png)
- [employee-v0-carry-1024](screenshots/employee-v0-carry-1024.png)
- [employee-v0-carry-1440](screenshots/employee-v0-carry-1440.png)
- [employee-v0-carry-1920](screenshots/employee-v0-carry-1920.png)
- [first-paint-hard-refresh-1440](screenshots/first-paint-hard-refresh-1440.png)
- [first-paint-internal-navigation-1440](screenshots/first-paint-internal-navigation-1440.png)
- [first-paint-slow-1440](screenshots/first-paint-slow-1440.png)
- [first-paint-warm-refresh-1440](screenshots/first-paint-warm-refresh-1440.png)
- [lookup-history-1024](screenshots/lookup-history-1024.png)
- [lookup-history-1440](screenshots/lookup-history-1440.png)
- [lookup-history-1920](screenshots/lookup-history-1920.png)
- [saved-content-1440](screenshots/saved-content-1440.png)
- [sealed-meeting-1440](screenshots/sealed-meeting-1440.png)
