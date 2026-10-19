# `src/components/` 组件

本目录存放需要复用或具有独立交互逻辑的界面组件。

## 当前文件

- `ContentTunnel.tsx`：首页 React Island，负责滚动进度、封面循环、流程状态和首屏结构。
- `ContentTunnel.module.css`：负责 Hero 的封面纵深、统一遮罩、信息排版、流程轨道和响应式样式。
- `BusinessConsoleSidebar.astro`：业务控制台共享导航，负责 Quiet Operations 视觉、持久化跨页切换、即时选择反馈、受控预取和加载状态。
- `BusinessConsoleFrame.astro`：业务页面的共享应用壳层，集中装配 Sidebar、Workspace 与控制台视觉变量。
- `BusinessConsoleToolbar.astro`：业务页统一工具栏，通过中部和右侧插槽承载日期、视角、汇总与主要动作。
- `BusinessToolbarPeriodNav.astro`：Toolbar 统一年月切换控件。
- `BusinessToolbarSegmented.astro`：Toolbar 统一视角与显示方式切换控件。
- `BusinessToolbarSummary.astro`：Toolbar 统一“标签 + 数值 + 补充信息”汇总结构。
- `BusinessToolbarActions.astro`：Toolbar 统一主要与次要操作按钮的几何和交互状态。
- `BusinessToolbarContext.astro`：Toolbar 中部的单行上下文信息。
- `BusinessPageHeader.astro`：统一“中文主标题 + 必要说明”的页面标题结构，元信息缺省时不生成空区域。
- `BusinessSectionHeader.astro`：统一内容区块的标题、说明和右侧元信息。
- `NonPromotionReviewCard.astro`：旧版非推广阶段复盘卡，当前主页面不再使用。
- `MetricCell.astro`：数据表复用指标单元格，统一百分比、同类 pp 差值、样本 tooltip 与正向/中性/负向状态。
- `BusinessViewSwitch.astro`：互斥展示方式的原生单选分段控件，统一紧凑高度、键盘、选中及焦点样式，业务适配器负责原位状态变化。
- `BusinessFormSheet.astro`：编辑表单共用抽屉容器及字段规格，统一深蓝标题栏、滚动内容、固定操作区和窄屏布局；业务表单以插槽接入，沿用既有字段与提交控制器。

- `BusinessFormDialog.astro`：居中任务的共享容器，按内容指定宽度，头部／操作区固定、正文滚动；保留原有中性或深蓝标题栏。
- `../styles/business-forms.css`：由 Frame 引入的显式表单与筛选规范，集中维护字号、标签、40／36px 控件、只读、焦点、选项分组与反馈；不使用裸元素全站重置。

- `BusinessDateTimeFields.astro`：完整日期时间的共享拆分输入，原生日期在左、原生时间在右；原时间戳字段由共享客户端控制器同步，动态改期申请克隆同一模板。

## 文件关系

```text
pages/index.astro
        │ Props
        ▼
ContentTunnel.tsx
        │ className 与 CSS 变量
        ▼
ContentTunnel.module.css
```

- 文案和封面数据来自 `src/data/home.ts`，组件不自行维护业务内容。
- TSX 负责“什么时候、移动到哪里”，CSS Module 负责“长什么样、层级在哪里”。
- `--scene-scale` 由 TSX 根据基准画布写入，CSS 用它整体缩放 3D 场景。

## 阅读方式

1. 先看两个文件顶部的说明卡。
2. 再看 TSX 的编号 1–3 和 5，理解输入、配置、状态和页面结构。
3. 最后看 TSX 编号 4 与 CSS 编号 1、3、5、6，理解动画和视觉层级。
4. 只想修改某项效果时，根据文件头的 `【修改入口】` 直接跳转，不必从头逐行阅读。

## 维护原则

- 页面文案优先放在 `src/data/home.ts`，不要直接散落进组件。
- 非直观的动画计算需要说明进度范围和视觉目的。
- 新增动效时继续支持 `prefers-reduced-motion`，并避免锁定正常滚动。
- 注释优先说明需求、关联和原因，不逐行复述能够直接看懂的语法。

`BusinessAccountMenu.astro` 在桌面侧栏和手机工具栏显示账号与退出，原生 popover 避免层级裁切。Frame 统一维护并发请求、延迟反馈及登录失效提示；管理员动作使用 `data-admin-only`，服务端权限另由 middleware 和业务事务检查。

`BusinessScheduleNotifications.astro` 在共享侧栏提供团队排期待办，手机通过排期导航角标显示延期数量；刷新逻辑位于 `src/scripts/schedule-notifications.ts`。

- `BusinessPromotionWaitRanges.astro`：每日与历史共用的待定区间和下一步编辑器。
- `BusinessPromotionToolbar.astro`：每日／阶段／历史共同持久化的工具栏；阶段正文由 `BusinessPromotionStageView.astro` 提供。
- `BusinessPromotionSnapshot.astro`：可供截图和例会引用的阶段汇总及来源明细。
- `BusinessMeetingSnapshot.astro`：五部分定稿的冻结内容及旧格式兼容展示。

`BusinessInspector.astro` 与 `src/scripts/business-inspector.ts` 是所有业务详情的共同入口。使用前先读[设计规则](../../docs/DESIGN.md#共享正文与-inspector)与[接入实例](../../docs/code-study.md#共享界面接入)；几何和开关流程不能在页面复制。

停靠详情通过 `data-inspector-host` 接入公共轨道，开合时保留正文宽度并一同过渡轨道与间距；覆盖详情在退出完成前保持定位。Sheet／Dialog 的面板与遮罩、嵌套滚动锁由 `business-dialog.ts` 统一管理，页面不得提前隐藏或原生移除容器。

`BusinessPromotionTimeline.astro` 每日委托 `BusinessPromotionPendingRows.astro` 表达首次安排和持续区间，历史和排期 Inspector 按需展开更正，共用业务日期、写入控制器与审计；`BusinessScheduleApprovals.astro` 沿用排期台账与共享 Inspector。`BusinessChangeDiff.astro` 与 `src/scripts/business-change-diff.ts` 为 SSR／异步详情提供相同的纵向字段对照，不另建详情开关或横向对比表。

`BusinessPromotionSummary / BusinessPromotionTotals / BusinessPromotionDetails / BusinessPromotionMetric` 供每日生命周期与历史总览共同使用，依次负责总览、七项只读数值、统一 Inspector 内容与逐日展开／原编辑表单。不要在视图中重复维护汇总或复制 Inspector 开关。
