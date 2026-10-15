# 页面交互

`promotion-pauses.ts` 管理员工与管理员共用的团队暂停表单，携带幂等请求键和并发版本，失败保留输入，成功后刷新状态。

`annual-plan.ts` 负责年度规划的半月编辑、备注预览、Inspector、版本恢复和年度复制。通过页面的 JSON 数据初始化，监听 `astro:page-load` 支持客户端导航；同一页面只绑定一次事件。

共享范围和展示函数来自 `src/db/annual-plan-rules.mjs`。这里不得导入数据库连接、认证密钥或服务端写入模块；所有写入通过受权限保护的 API 完成。

`schedule-notifications.ts` 为持久化侧栏刷新延期、待补理由及审批计数；`operations-workflow.ts` 管理排期 Inspector 的申请与逐日理由，以及实发时的理由核对与原子提交。客户端只请求受权限保护的接口，不导入数据库连接。
