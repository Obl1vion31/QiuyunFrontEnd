# 工作台待办与统计口径验收

应用代码 `924b61e5`。使用实际 Vercel 运行包、本机隔离 PostgreSQL 与验收账号。已自检并发布，待用户反馈。部署 `dpl_AWz4sU6acna7eNdEQZQHVen4vLJR`，候选与正式各 6 项 HTTP 和 3 个静态资源核对一致。正式已登录只读核对合并待复盘、管理员提醒与月度缺项跳转。

- 三账号的新旧申请计数和详情、管理员驳回回显、三种待办与真实录入／跳过／恢复、推广保存回显、月度缺项直达与消失均通过。提醒验证 SSR、分钟刷新、返回聚焦、读取失败及迟到响应。
- 桌面 1440／1024 按受影响状态检查内容宽度、显示与键盘关闭。390 仅检查明显溢出、遮挡和关闭。月会网页与实际归档 PDF 核对成交成本说明，冻结快照一致。
- 非推广历史筛选、分类与保存回归，合入同期 Inspector 更新前的公共首次绘制，窄详情关闭手势及影子遮罩反馈通过。推广精细状态专项有两项 PGlite API 用例返回 503，旧主线基线同样复现。本轮新增覆盖用实际运行包及独立 PostgreSQL 验证日度真实保存。

- [员工待复盘与三条提醒（1440）](employee-pending-1440.png)
- [非推广小桌面四列（1024）](employee-pending-1024.png)
- [员工个人申请为空（1440）](employee-own-empty-1440.png)
- [管理员审批及单条提醒（1440）](admin-approvals-1440.png)
- [已复盘按方式筛选（1440）](employee-history-1440.png)
- [从提醒进入推广录入（1440）](employee-promotion-link-1440.png)
- [提醒读取失败（1440）](employee-reminders-unavailable-1440.png)
- [消耗有缺项（1440）](monthly-gaps-1440.png)
- [日度保存后的完整金额（1440）](monthly-complete-1440.png)
- [封存月会成交成本（1440）](monthly-meeting-1440.png)
- [正式运行包生成的 PDF 首页](monthly-pdf-page.png)
- [手机复盘详情与关闭入口（390）](employee-review-390.png)
- [排期关闭手势回归实录](pointer-gestures.mp4)
