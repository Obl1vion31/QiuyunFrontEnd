# 工作台共享样式

`business-typography.css` 负责工作台及原生弹层的字体基准，组件按语义设定标题、正文、辅助和控件层级；统计使用正文字体与等宽数字，代码／原始 ID 可使用等宽字体。

`business-forms.css` 由 `BusinessConsoleFrame` 引入，集中维护常规表单 `business-form`、紧凑筛选 `business-filter` 与居中 `BusinessFormDialog` 的视觉规格。

样式显式接入，不使用裸元素重置影响首页、日历事件卡片、年度矩阵或行内指标。页面只组织业务字段与必要布局；公共规格变更时检查所有消费者，并同步设计规范、接入实例与浏览器验收。

`business-changes.css` 统一 SSR 与异步详情的申请差异，原内容／申请内容按字段纵向排列；台账表格样式必须限定在主列表内，避免影响 Inspector。
