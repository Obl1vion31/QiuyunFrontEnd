# 工作台共享样式

`business-typography.css` 负责工作台及原生弹层的字体基准，组件按语义设定标题、正文、辅助和控件层级；统计使用正文字体与等宽数字，代码／原始 ID 可使用等宽字体。

工作台使用固定自托管的 `MiSans VF`，共享 `BusinessConsoleFonts` 在head引入构建生成的 `/fonts/business.css`／`business.js`。常用原始切片在正文解析前同步准备，其余由CSS按需读取；字体栈始终优先MiSans，不因加载速度改成系统字体。辅助系统回退只处理字体不可用。延迟读取控制器见 `src/scripts/business-read.ts`。

`business-forms.css` 由 `BusinessConsoleFrame` 引入，集中维护常规表单 `business-form`、紧凑筛选 `business-filter` 与居中 `BusinessFormDialog` 的视觉规格。

`business-navigation.css` 只负责A方案的顶部蓝色细线与等待提示；固定层独立于Sidebar，减少动态效果显示静态细线。真实页面、表单与局部读取的样式仍由原组件维护。

Sheet／Dialog 的遮罩进入、退出及面板退出动画也在此统一维护；面板进入位置由对应组件提供，关闭完成与滚动锁交由共享控制器处理。

样式显式接入，不使用裸元素重置影响首页、日历事件卡片、年度矩阵或行内指标。页面只组织业务字段与必要布局；公共规格变更时检查所有消费者，并同步设计规范、接入实例与浏览器验收。

`business-changes.css` 统一 SSR 与异步详情的申请差异，原内容／申请内容按字段纵向排列；台账表格样式必须限定在主列表内，避免影响 Inspector。

`promotion-pending.css` 仅作用于推广“待完成复盘”，集中维护首次安排、持续状态与正常数据行的宽度、头部、语义日期、指标、行内展开和操作区，复用表单变量；不更改共享工作台外壳。

`promotion-overview.css` 统一原黄绿生命周期条、行内展开每日表格及表尾汇总及所选记录 Inspector。使用内容容器断点保护标签和金额可读性，与 `promotion-pending.css` 的录入区域分工。

`meeting-records.css` 管理例会总览与历史紧凑列表：主入口、集中元信息、动作分级及手机重排；不覆盖会议正文与PDF打印样式。

已认可的桌面材质由 `workspace-glass.css` 管理，全部页面在 `data-glass-surface` 内使用公共宽度、MiSans、控件和面板；`schedule-glass.css` 负责排期连续筛选、日历／Week与详情的局部适配。主要容器承载光影，密集格子和输入保持清晰实底；比较颜色由指标语义标记维护，减少动态／透明度及打印有降级。`public-entry-glass.css` 承接首页与登录，不改九图构图与轮播。长期规则见设计规范，本轮整体验收保持本地、未发布。

- `schedule-panel.css`：排期专属680px单层模态布局、内部视图与单层模糊优化，不改变其他Inspector消费者。

- `schedule-history.css`统一排期详情及查帖中的折叠历史、主变化、理由及辅助时间／修订信息，保持公共字号和单正文滚动。
