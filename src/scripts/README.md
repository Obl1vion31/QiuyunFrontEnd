# 页面交互

`promotion-pauses.ts` 管理员工与管理员共用的团队暂停表单，携带幂等请求键和并发版本，失败保留输入，成功后刷新状态。

`annual-plan.ts` 负责年度规划的半月编辑、备注预览、Inspector、版本恢复和年度复制。通过页面的 JSON 数据初始化，监听 `astro:page-load` 支持客户端导航；同一页面只绑定一次事件。

共享范围和展示函数来自 `src/db/annual-plan-rules.mjs`。这里不得导入数据库连接、认证密钥或服务端写入模块；所有写入通过受权限保护的 API 完成。

`schedule-notifications.ts` 为持久化侧栏刷新延期、待补理由及审批计数；`operations-workflow.ts` 管理排期 Inspector 的申请与逐日理由，以及实发时的理由核对与原子提交。客户端只请求受权限保护的接口，不导入数据库连接。

`business-inspector.ts` 统一详情开关、焦点、深链接与未保存保护；`non-promotion-review.ts` 只处理筛选、排序、业务保存和 GET 刷新。接入方式见[共享界面实例](../../docs/code-study.md#共享界面接入)。

排期的 `operations-workflow.ts` 处理统一发布的到期理由、分享文案预览及更正历史，旧预约只读展示。新建、编辑、改帖共用日期与时分控件，日历点击只提供预填日期。提醒由 `schedule-notifications.ts` 刷新，不再提供预约审核或到点确认。

`business-datetime.ts` 管理共享日期／时间拆分控件，捕获输入与提交时拼合原字段；SSR 与动态表单共用相同配置方法，同步只读／禁用，不转换业务时区。

`business-date.ts` 统一工作台完整时间的上海时区显示；SSR 与浏览器共用，不转换业务日期键或替代原生日期选择控件。

- `business-dialog.ts`：站内未保存确认与 Sheet／Dialog 的成对进出生命周期。
- `business-permissions.ts`：读取服务端下发的操作权限、同步入口显示；服务端始终独立复核。

`promotion-timeline.ts` 绑定首次安排、待定下一步与历史更正；保存后只刷新本篇业务行，保留其他草稿和公共节点。`schedule-approvals.ts` 绑定共享 Inspector 内的新旧审核，结果原位显示并刷新提醒；过期申请明确显示失效。

`business-change-diff.ts` 用安全文本节点生成纵向字段对照，与 `BusinessChangeDiff.astro` 共用 `business-changes.css`；用于异步排期申请详情，不引入独立滚动容器。
