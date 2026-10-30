# 月历默认视角与入口顺序

已自检并发布，待使用反馈。归档使用北京时间；页面由正式组件与隔离PGlite虚构排期渲染，390／320px为Chromium模拟触屏。

- 显示方式统一为“月历／台账”，月历在前；无显式视角参数时默认月历。显式台账链接与业务筛选仍沿用原有视角语义。
- 已实际查看三档默认月历、点击台账及返回月历的9张截图，核对顺序、选中状态与切换。默认图为整页截图；返回图为实际视口，手机固定导航以视口图为准。
- 原发布登记浏览器回归通过，新增顺序／默认断言并真实点击往返；Node及Vercel类型检查与构建、运行包中文PDF通过。[验证日志](logs/)。

| 视口 | 默认月历 | 切换台账 | 返回月历 |
| --- | --- | --- | --- |
| 1440 | [整页](calendar-default-1440.png) | [查看](calendar-ledger-1440.png) | [查看](calendar-return-1440.png) |
| 390 | [整页](calendar-default-390.png) | [查看](calendar-ledger-390.png) | [查看](calendar-return-390.png) |
| 320 | [整页](calendar-default-320.png) | [查看](calendar-ledger-320.png) | [查看](calendar-return-320.png) |

实现`e78a689eb0cf129257bce7e600c01ce0d876bae6`；部署`dpl_4TrNtG3uRZCNxF94eKu9bKxco7p6`。[6项候选检查](candidate-smoke.json)和[108项正式检查／66个资源哈希](public-smoke.json)通过，[正式站](https://qiuyun-frontend.vercel.app)已更新。业务写入仅隔离测试库，无结构迁移。工作分支`codex/statistics-count-alignment`，main仍独立确认。
