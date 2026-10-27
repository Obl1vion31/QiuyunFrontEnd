# 每日主表灰行与数据界面一致性

- 状态：已自检，待用户反馈。实现 `a7305dd`；正式组件、隔离PGlite虚构业务事实，未写生产业务数据，无数据库迁移。
- 未开始／首次待定并入每日主表，状态下设置安排，五项指标禁用且不填假零；截止可空、T+1及有限截止规则保留。一键保存只处理指标，草稿保护、失败重试与跨午夜旧日期保留。
- 每日操作组统一36px／12px间距及文字整组居中；推广历史查看／重置同组，年度加号移除叠加间距，历史编辑日期按可读字段宽度换行。DESIGN、AGENTS、源码接入和验收规范已同步。

## 实际界面

| 场景 | 图像 |
| --- | --- |
| 每日混排 | [1920](desktop/daily-left-1920.png) · [1440](desktop/daily-left-1440.png) · [1024](desktop/daily-left-1024.png) |
| 手机左右滚动 | [390左](mobile/daily-left-390.png) · [390右](mobile/daily-right-390.png) · [320左](mobile/daily-left-320.png) · [320右](mobile/daily-right-320.png) |
| 状态下浮层 | [桌面](desktop/initial-popup-1440.png) · [390](mobile/initial-popup-390.png) · [320](mobile/initial-popup-320.png) |
| 失败／草稿与生效 | [失败保留](desktop/save-failure-1440.png) · [取消关闭](desktop/draft-confirm-cancel-1440.png) · [当日开始与成功提示](desktop/next-start-today-feedback-1440.png) · [跨午夜开放](desktop/midnight-start-opened-1440.png) |
| 同类入口 | [年度](peers/peer-annual-1440.png) · [排期](peers/peer-schedule-1440.png) · [历史操作](peers/peer-history-1440.png) · [非推广](peers/peer-non-promotion-1440.png) · [例会](peers/peer-meeting-1440.png) · [持续待定历史编辑](peers/peer-waiting-inspector-1440.png) |

图像及[录像关键帧](motion/contact.png)已实际查看。[操作录像](motion/arrangement.webm)，包含不同视口及隔离保存操作；按钮双位计数、保存中、成功及禁用图为正式组件的呈现状态验证，真实保存／失败由隔离接口验证。浏览器为Playwright Chromium，手机为视口模拟，未冒充真机软键盘验收。

## 验证

- 213项全量规则串行通过；db:check、类型检查、Node构建通过。
- 首次安排专项通过五档视口及关闭／导航保护、失败重试、修改必填理由、指标节点与123.45草稿保留、真实零值与禁用空值区分、有限截止、无截止、旧跨午夜草稿与T+1开始。排期历史的空截止与日期宽度实际核对。
- 每日工作台、首次安排／历史更正、公共UI、例会安排更正专项通过。年度、排期、历史、非推广及例会1440px截图已查看；同类顶栏已接共享规则、只读计数保留自身语义。修正上述可见间距与日期裁切，保留合理的业务布局。
- [检查记录](checks/)与[实际文字几何](checks/geometry.json)。Vercel构建与运行包React／Chromium／中文PDF通过。

## 发布

[正式每日复盘](https://qiuyun-frontend.vercel.app/business/daily-promotion-review)已指向 `dpl_8iy9Vc8TzcKqwqSSt7iiQvmvfWTi`，发布源 `a7305dd`。5项候选动态检查、正式域名97项检查与63个静态资源SHA-256一致；包含登录保护、同源表单认证拒绝、外站来源拒绝及私有路径不可访问。已提交并推送工作分支，main合并仍独立确认。

[候选结果](candidate-smoke.json) · [正式结果](public-smoke.json) · [部署核对](checks/initial-formal-inspect.txt)。正式核对为匿名路由／认证保护与资源版本检查；登录后的操作及截图使用隔离库。
