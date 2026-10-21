# 复盘视觉参考 · 第三版

状态：独立参考稿已自检，待用户确认。全部帖子与指标为示例数据；未连接业务 API 或数据库，不代表业务实现已完成。

本轮保留已认可的生命周期与详情入口，使用 MiSans；调整每日单行的日期、状态、五项输入与独立成本列，分别提供当日状态修改和次日安排。暂停与待定仍可填写，测试淘汰残留通过 ID 搜索添加独立行，无次日安排。非推广使用“分类均值查看 / 历史数据总览”。

## 主要参考

- [测试、放量、暂停与待定 · 1440px](promotion-mixed-1440.png)
- [五篇测试、暂无待填写 · 1440px](promotion-empty-1440.png)
- [多条待填写 · 1440px](promotion-ready-1440.png)
- [当日状态修改](promotion-day-state-1440.png)
- [残留搜索](promotion-supplement-search-1440.png)与[单行补录](promotion-residual-1440.png)
- [分类均值查看](nonpromotion-summary-1440.png)、[分类明细](nonpromotion-detail-1440.png)与[历史数据总览](nonpromotion-history-1440.png)
- [局部加载反馈](nonpromotion-loading-1440.png)
- [交互与动效录像](review-reference-v3.webm)

## 宽度与检查

浏览器使用真实 232px 桌面侧栏与正文左右各 24px 留白；1920px 视口下内容面板上限 1440px。1440px 视口下，面板 1160px、内部台账 1158px，五项输入至少 88px，可完整显示一行；1280px 与窄屏在台账内横向查看，不压缩输入或产生页面横向溢出。

- [推广 1920px](promotion-mixed-1920.png)、[1280px](promotion-mixed-1280.png)、[390px](promotion-mixed-390.png)、[320px](promotion-mixed-320.png)
- [非推广 1920px](nonpromotion-summary-1920.png)、[1280px](nonpromotion-summary-1280.png)、[390px](nonpromotion-summary-390.png)、[320px](nonpromotion-summary-320.png)
- [六位金额与人数](promotion-long-numbers-1440.png)、[提交成功](promotion-saved-1440.png)与[待开放展开](promotion-upcoming-1440.png)
- [阶段变化起点](stage-change-start.png)、[过程](stage-change-middle.png)与[终点](stage-change-end.png)

浏览器检查覆盖 1920、1440、1280、1024、736、390、320px，无页面横向溢出或脚本错误；五行生命周期在桌面总高 396px，普通填写行 72px。操作检查包含状态修改保留指标、待定选项限制、零分母、补录计数、成功反馈、500ms 后局部加载与旧请求保护、键盘关闭及减少动态效果。已实际打开桌面与移动端关键渲染图，并检查阶段变化关键帧。

MiSans 实际字形已在标题、帖子名称、按钮和可见非推广数值上核对。原生输入的字形接口未返回字体列表，已检查其计算字体、14px/400 与渲染图。详见 [检查结果](check.json)、[字体记录](fonts.json)与[动效记录](motion-check.json)。

## 来源

参考源保存在 `reference-source.html`，浏览器包装保存在 `reference-preview.html`。业务仓库 HEAD 为 `55b6ff6`；参考稿独立于现有未提交业务修改。本批只验收示例界面的视觉与本地交互，真实规则、权限、迁移及持久化将在正式实施后另行验证。
