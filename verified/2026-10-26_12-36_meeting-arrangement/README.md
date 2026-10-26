# 次日安排单行与原位更正

- 状态：已自检，待用户反馈；代码 `4911d17`（工作分支 `agent/content-console-redesign`）。
- 数据：正式组件与隔离 PGlite 的虚构业务事实；时间固定在上海 2026-10-24，生产业务数据未用于写入验收。
- 界面：安排结果／例会决定链接／修改同行；来源在新标签定位原会议版本。浮层保存独立于指标，列表与 Inspector 共用草稿，失败保留输入。
- 手机横滑时日期随表格滚动，防止遮住安排文字；指标输入宽度保留。

## 最终界面

| 场景 | 图片 |
| --- | --- |
| 桌面单行 | [1920px](desktop/daily-1920.png) · [1440px](desktop/daily-1440.png) · [1024px](desktop/daily-1024.png) |
| 桌面浮层 | [1920px](desktop/editor-1920.png) · [1440px](desktop/editor-1440.png) · [1024px](desktop/editor-1024.png) |
| 手机单行 | [390px](mobile/daily-390.png) · [320px](mobile/daily-320.png) |
| 手机浮层 | [390px](mobile/editor-390.png) · [320px](mobile/editor-320.png) |
| 校验与异常 | [理由必填](states/reason-required-1440.png) · [断网保留](states/network-failure-1440.png) · [版本冲突](states/version-conflict-1440.png) · [保存后刷新失败](states/refresh-failure-1440.png) |
| 详情与保存 | [共用草稿](states/inspector-draft-1440.png) · [保存回执](states/saved-inspector-1440.png) · [最终列表](states/final-1440.png) |

[实际操作录像](motion/interaction.webm) · [进入动效关键帧](motion/contact.png)。截图与关键帧已实际查看；录像包含五档视口、原位修改、未保存确认、断网重试、列表与详情衔接、保存及冲突。

## 验证

197 项规则测试、类型检查、Node／Vercel 构建与 db:check 通过。专项覆盖最长安排／复测、指标宽度、真实 MiSans、视口避让、Esc 与焦点、后退取消、单条与批量互锁、断网及冲突、保存成功后重新读取、减少动态效果和原节点／数值／滚动保留。

公共 UI、每日工作台、状态更正、面板动效、完整例会内联流程与独立复测回归通过；[专项结果](checks/browser.json)与[验证日志](checks/)保留。新增浏览器用例为 `node --import tsx tests/meeting-arrangement.browser.ts`。

## 公网发布

2026-10-26 已发布至 [正式推广复盘](https://qiuyun-frontend.vercel.app/business/daily-promotion-review)，发布源 `4911d17`，部署 `dpl_Fsi2hPAHgMDkdFjsSZXo8n2m1neG`。独立地址动态接口先通过后再切换正式域名；82 项匿名公网检查、59 个资源 SHA-256 一致，登录保护、同源表单 401／外站 403、私有路径拒绝均通过。[公网结果](checks/public-smoke.json) · [部署核对](checks/deployment.txt)。公网没有执行业务写入；交互与异常写入仅使用隔离库。
