# 推广表头对齐与例会星号

- 状态：已自检，待用户反馈；代码 `2deb355`，工作分支 `agent/content-console-redesign`。
- 推广每日与残留补录共用居中表头；标题、单位、次日安排说明作为完整组居中，输入维持右对齐与原宽度。
- 仅例会固定状态右上角加星号，不挤偏文字或改变行高；普通安排仍为下拉框。表头显示“次日安排（*指例会决定）”，链接常显蓝色下划线、新标签打开总览，Inspector 同步。
- 长期规则按表格类型区分，写入 DESIGN 与 AGENTS，接入实例及验收说明同步。阅读型表格继续遵循其阅读与比较锚点。
- 数据来源：正式组件与隔离 PGlite 的虚构业务事实；业务写入仅在隔离库。

## 最终界面

| 场景 | 截图 |
| --- | --- |
| 表头与六种混合行 | [1920px](desktop/table-1920.png) · [1440px](desktop/table-1440.png) |
| 桌面上下文 | [1440px](desktop/daily-1440.png) · [1024px](desktop/daily-1024.png) |
| 手机内部横滚与星号 | [390px](mobile/daily-390.png) · [320px](mobile/daily-320.png) |
| 手机修改与纯文本原安排 | [390px](mobile/editor-390.png) · [320px](mobile/editor-320.png) |
| Inspector 字段与上标 | [1440px](states/inspector-field-1440.png) |
| 同类残留补录表头 | [1440px](states/residual-1440.png) |
| 失败保留输入 | [1440px](states/network-failure-1440.png) |

截图与[录像关键帧](motion/contact.png)已实际查看；[操作录像](motion/interaction.webm)覆盖五档视口、原位修改、失败重试、未保存确认、Inspector 衔接与保存回显。

## 验证

197项规则、db:check、类型检查、Node／Vercel构建、公共UI、每日工作台与安排专项通过。五档视口用实际文字／标题组测量表头中心，误差均不超过1 CSS px，相邻标签无重叠；上标不改变状态的中心与行高，最长复测完整，普通下拉选项／输入／节点保留。

专项还覆盖浮层“原安排”不含星号、理由必填、Esc与焦点、后退取消、共享草稿、批量互锁、断网／冲突、保存后刷新失败与减少动态效果。[专项结果](checks/browser.json) · [检查日志](checks/)。

## 公网发布

2026-10-26 已发布至[正式推广复盘](https://qiuyun-frontend.vercel.app/business/daily-promotion-review)，代码 `2deb355`，部署 `dpl_5VTyapax7JvrPez4yRBFgHiVBRjm`。独立动态探针先通过后切换正式域名；82项匿名公网检查及59个资源 SHA-256 一致，登录保护、同源表单401／外站403、私有路径拒绝通过。

[公网结果](checks/public-smoke.json) · [部署核对](checks/deployment.txt)。工作分支已推送，无数据库迁移或生产业务写入。
