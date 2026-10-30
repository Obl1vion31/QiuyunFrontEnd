# 工作台共享样式

`business-typography.css` 负责工作台及原生弹层的字体基准，组件按语义设定标题、正文、辅助和控件层级；统计使用正文字体与等宽数字，代码／原始 ID 可使用等宽字体。

工作台优先使用固定自托管的 `MiSans VF`，由共享 `BusinessConsoleFonts` 在head引入原始 `/fonts/misans-5.0.0/MiSansVF.css` 并预加载常用文字与数字切片；Frame仅在首帧前全部所需字形已就绪时启用MiSans，否则本次文档保持系统回退，保留系统中文无衬线回退。该样式也维护目标容器的延迟读取反馈；读取控制器见 `src/scripts/business-read.ts`。

`business-forms.css` 由 `BusinessConsoleFrame` 引入，集中维护常规表单 `business-form`、紧凑筛选 `business-filter` 与居中 `BusinessFormDialog` 的视觉规格。

Sheet／Dialog 的遮罩进入、退出及面板退出动画也在此统一维护；面板进入位置由对应组件提供，关闭完成与滚动锁交由共享控制器处理。

样式显式接入，不使用裸元素重置影响首页、日历事件卡片、年度矩阵或行内指标。页面只组织业务字段与必要布局；公共规格变更时检查所有消费者，并同步设计规范、接入实例与浏览器验收。

`business-changes.css` 统一 SSR 与异步详情的申请差异，原内容／申请内容按字段纵向排列；台账表格样式必须限定在主列表内，避免影响 Inspector。

`promotion-pending.css` 仅作用于推广“待完成复盘”，集中维护首次安排、持续状态与正常数据行的宽度、头部、语义日期、指标、行内展开和操作区，复用表单变量；不更改共享工作台外壳。

`promotion-overview.css` 统一原黄绿生命周期条、行内展开每日表格及表尾汇总及所选记录 Inspector。使用内容容器断点保护标签和金额可读性，与 `promotion-pending.css` 的录入区域分工。
