# 页面交互

`promotion-review-days.ts` 管理推广日期行的午夜／返回刷新，数据开放沿用服务端日期规则；团队一键暂停表单和轮询已移除。

`annual-plan.ts` 负责年度规划的半月编辑、备注预览、Inspector、版本恢复和年度复制。通过页面的 JSON 数据初始化，监听 `astro:page-load` 支持客户端导航；同一页面只绑定一次事件。

共享范围和展示函数来自 `src/db/annual-plan-rules.mjs`。这里不得导入数据库连接、认证密钥或服务端写入模块；所有写入通过受权限保护的 API 完成。

`schedule-notifications.ts` 为持久化侧栏刷新延期、待补理由及审批计数；`operations-workflow.ts` 管理排期 Inspector 的申请与逐日理由，以及实发时的理由核对与原子提交。客户端只请求受权限保护的接口，不导入数据库连接。

`business-inspector.ts` 统一详情开关、焦点、深链接与未保存保护；模板行内标题和显式动作使用 `data-inspector-trigger` 接入同一行键，关闭回到实际触发按钮，不重复声明 `data-inspector-key`；`non-promotion-review.ts` 只处理筛选、排序、业务保存和 GET 刷新。接入方式见[共享界面实例](../../docs/code-study.md#共享界面接入)。

排期的 `operations-workflow.ts` 处理统一发布的到期理由、分享文案预览及更正历史，旧预约只读展示。新建、编辑、改帖共用日期与时分控件，日历点击只提供预填日期。提醒由 `schedule-notifications.ts` 刷新，不再提供预约审核或到点确认。

`business-datetime.ts` 管理共享日期／时间拆分控件，捕获输入与提交时拼合原字段；SSR 与动态表单共用相同配置方法，同步只读／禁用，不转换业务时区。

`business-date.ts` 统一工作台完整时间的上海时区显示；SSR 与浏览器共用，不转换业务日期键或替代原生日期选择控件。

`business-read.ts` 统一目标容器读取：`beginBusinessRead(target, {signal, isCurrent})` 返回请求信号、落地守卫和 `finish/cancel`；500ms 内保持安静，超过后仅目标区域显示一处反馈。相同目标的新读取取消旧任务，导航与 Inspector 关闭清理状态，业务在写入 DOM 前检查 `isCurrent()`。`readBusiness` 可包裹包含 JSON／HTML 解析的完整任务。导航进度由共享侧栏监听 Astro 读取生命周期，不依赖入口按钮。

- `business-dialog.ts`：站内未保存确认与 Sheet／Dialog 的面板、遮罩成对进出生命周期，以及详情／抽屉／嵌套确认共用的滚动锁；实际退出完成后才原生关闭，快速重开取消旧任务。
- `business-permissions.ts`：读取服务端下发的操作权限、同步入口显示；服务端始终独立复核。

`promotion-timeline.ts` 绑定首次安排、待定下一步与历史更正；保存后只刷新本篇业务行，保留其他草稿和公共节点。`schedule-approvals.ts` 绑定共享 Inspector 内的新旧审核，结果原位显示并刷新提醒；过期申请明确显示失效。

`business-change-diff.ts` 用安全文本节点生成纵向字段对照，与 `BusinessChangeDiff.astro` 共用 `business-changes.css`；用于异步排期申请详情，不引入独立滚动容器。

推广待办由 `promotion-daily-form.ts` 管理活动＋日期草稿、独立状态气泡、轻量笔记 ID 草稿、一键保存与 Inspector 镜像；`promotion-timeline.ts` 按稳定键合并所有相关队列及分组，保留其他节点和输入。`promotion-residual.ts` 提供笔记 ID 搜索、显式选择活动／版本／日期及固定残留行，与正常日度共用 API。

`promotion-disclosure.ts` 管理数据的成对展开／收起；文字、比例与轨道几何保持稳定，收起归零后才关闭原生 details。快速反向、键盘与减少动态效果统一处理，筛选、读取详情和局部刷新不重播。

`business-data-motion.ts` 按真实导航区分生命周期与非推广结果展示，等新画面可见后按约 600ms 顺序呈现真实节点和连线，或轻量呈现结果；从其他模块返回会重播，同视图筛选、详情和局部保存不重播。工作表单不接入，减少动态效果统一静态显示。

`promotion-note-id.ts` 负责首次 ID 的锚定气泡和只读查看，确认由同 contentId 草稿同步；已有 ID 更正仍走原确认入口。
