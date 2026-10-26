# 例会固定安排与当日状态一致

- 状态：已自检，待用户反馈；发布代码 `098334e`，工作分支 `agent/content-console-redesign`。
- 仅例会决定的次日安排采用居中两行：彩色状态在上、蓝色修改在下，与当日状态共用字体、字重、间距和状态色；普通安排保留原下拉框与选项。
- “例会决定”集中在次日安排表头括号内，默认蓝色下划线，新标签打开例会总览；Inspector 对应字段标签同步。
- 数据来源：正式组件、隔离 PGlite 与虚构业务事实，时钟固定为上海 2026-10-24。业务写入均在隔离库完成。

## 最终界面

| 场景 | 图片 |
| --- | --- |
| 固定状态与普通下拉混排 | [1920px](desktop/daily-1920.png) · [1440px](desktop/daily-1440.png) · [1024px](desktop/daily-1024.png) |
| 手机横滑 | [390px](mobile/daily-390.png) · [320px](mobile/daily-320.png) |
| 修改浮层 | [1920px](desktop/editor-1920.png) · [1440px](desktop/editor-1440.png) · [1024px](desktop/editor-1024.png) · [390px](mobile/editor-390.png) · [320px](mobile/editor-320.png) |
| Inspector | [对应字段与链接](states/inspector-field-1440.png) · [共享草稿](states/inspector-draft-1440.png) · [保存回执](states/saved-inspector-1440.png) |
| 校验与重试 | [理由必填](states/reason-required-1440.png) · [断网保留](states/network-failure-1440.png) · [版本冲突](states/version-conflict-1440.png) · [保存后刷新失败](states/refresh-failure-1440.png) |
| 保存后的混合列表 | [最终列表](states/final-1440.png) |

截图与[操作录像关键帧](motion/contact.png)已实际查看；[操作录像](motion/interaction.webm)覆盖五档视口、修改、未保存确认、失败重试、列表／Inspector 衔接和保存回显。

## 验证

197 项规则、类型检查、Node／Vercel 构建、db:check、公共 UI、当日状态更正、每日工作台与例会内联回归通过。专项核对两列实际字体与尺寸、红绿灰独立取色、最长复测文案、指标宽度、普通下拉选项／选择／节点保留、来源链接可访问、Esc／焦点、视口避让、草稿保护、批量互锁、断网重试、版本冲突、保存后刷新失败与减少动态效果。

[专项结果](checks/browser.json) · [验证日志](checks/)。发布包同时实际执行 React／PDFKit／内置字体与中文 PDF 生成检查。

## 公网发布

2026-10-26 已发布至[正式推广复盘](https://qiuyun-frontend.vercel.app/business/daily-promotion-review)，代码 `098334e`，部署 `dpl_2h2Krp68bggmG6ihJeDjFstK18VK`。独立地址动态探针先通过后切换正式域名；82 项匿名公网检查、59 个资源 SHA-256 一致，登录保护、同源表单 401／外站 403 和私有路径拒绝均通过。

[公网结果](checks/public-smoke.json) · [部署核对](checks/deployment.txt)。工作分支已推送；无数据库迁移，生产业务数据未写入。
