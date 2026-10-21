# 复盘视觉方案第二版 · 2026-10-21 01:46

状态：独立方案已自检，待用户反馈；业务页面尚未实施。使用用户选定的 MiSans。名称、学科、指标与阶段日期均为交互和布局示例，不连接业务数据库。原应用未提交改动未修改。

## 主要变化

- 阶段节点加入业务日期；开始测试、待定、放量、暂停沿实际事件排列；继续放量属于最近复盘决定，不重复创建同阶段节点。
- 每篇帖子的一天数据直接占一条 78px 台账行，状态、五项输入、后续动作及提交同行。成本在对应实际人数下方，取消展开表单和独立底栏；日期使用整行高度的浅色区域。
- 非推广取消两层轮次分组表头，一次展示分类、轮次、样本和两项指标。分类名称跨两条轮次记录，明细仍就地打开。
- 正文上限收紧至 1120px；窄屏在数据表内部横向滚动，保留输入宽度。

## 截图与录像

- [推广：带日期阶段历程与单行填写](promotion-mixed-desktop.png)
- [推广：1024px 示意宽度](promotion-1024.png)
- [五篇测试，暂无待填写](promotion-empty-desktop.png)
- [阶段详情下的每日数据](promotion-details-desktop.png)
- [较长金额与数量输入](promotion-long-numbers-desktop.png)
- [非推广：单层汇总表头](nonpromotion-summary-desktop.png)
- [非推广：保留原位明细](nonpromotion-details-desktop.png)
- [筛选等待反馈](nonpromotion-loading-desktop.png)
- [390px 推广与表格左侧](promotion-mobile.png)
- [390px 表格右侧操作](promotion-mobile-actions.png)
- [390px 非推广](nonpromotion-mobile.png)
- [320px 四个阶段节点](stage-history-mobile.png)
- [阶段变化中间帧](stage-change-middle.png)
- [交互录像](review-proposal-v2.webm)

## 验证范围

浏览器测量 1280／1024／736／390／320px，实际查看桌面、390px 与320px 图像。桌面五条概览连同标题及列名为 396px；台账每行 78px，金额输入至少 104px、人数输入至少 88px。1024px 示意宽度内可完整显示整行；窄屏局部滚动，页面不横向溢出。

已操作成本计算、零分母、较长数值、状态编辑取消和应用、草稿恢复、提交成功与数量同步、详情开关、非推广明细、超过 300ms 的读取反馈、快速筛选及减少动态效果。标题、按钮和指标实际字形取自 MiSans VF；原生数值输入采用相同计算字体并查看实际渲染，CDP 未返回其内部字形信息。无页面脚本错误，测量见 [check.json](check.json)。

这是本地方案的交互检查；真实接口、权限、跨午夜及业务事务仍需应用实现后单独验收。源文件见 [review-direction.html](review-direction.html)。旧版仍保存在上一批目录。
