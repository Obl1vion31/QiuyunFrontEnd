# 工作台助手：左侧固定入口

- 状态：已自检并发布；代码 `6df4534df4397ded6d4a71aac67eee5e640488fc`，工作分支 `codex/table-tools-account-login`。
- 来源：正式组件与隔离PGlite，23篇虚构查帖样本；不连接共享业务库、不写入正式业务数据。
- 桌面助手固定在账号上方，手机从现有账号菜单进入；直接查帖，其他三项明确未开放。旧正文悬浮入口及菜单已移除。
- 已运行：222项规则（串行）、db:check、Node类型检查／构建、公共UI、助手专项、Vercel构建及实际运行包中文PDF。
- 已实际查看五档关键截图及桌面／手机录像的8fps连续帧。看图修正了关闭按钮对比；跨页测试修正展开状态更新滞后。

## 验证范围

| 入口／状态 | 实际覆盖 |
| --- | --- |
| 推广、排期入口和助手首屏 | 1920／1440／1024／390／320px；正文几何、选中导航、焦点返回 |
| 查帖 | 五档23条分页、详情与末尾、返回位置、空态、503重试、原指标草稿／节点及滚动保留 |
| 手机 | 390／320px账号入口点击、详情真实触控滑动及全宽面板 |
| 其他页面 | 公共UI在1440／1280／390／320px逐页检查六页；另六页1024×600短窗口、键盘、减少动态效果与跨页节点 |

## 关键画面

- [桌面入口](screenshots/daily-promotion-review-entry-1440.png) · [助手首屏](screenshots/daily-promotion-review-assistant-1440.png) · [手机账号入口](screenshots/operations-schedule-account-390.png) · [手机助手](screenshots/daily-promotion-review-assistant-320.png)
- [桌面操作录像](video/desktop-1440.webm) · [手机入口与关闭录像](video/mobile-390.webm) · [录像信息](video/clips.json)

## 分状态图库

| 场景 | 1920 | 1440 | 1024 | 390 | 320 |
| --- | --- | --- | --- | --- | --- |
| 推广入口 | [1920](screenshots/daily-promotion-review-entry-1920.png) | [1440](screenshots/daily-promotion-review-entry-1440.png) | [1024](screenshots/daily-promotion-review-entry-1024.png) | [390](screenshots/daily-promotion-review-entry-390.png) | [320](screenshots/daily-promotion-review-entry-320.png) |
| 排期入口 | [1920](screenshots/operations-schedule-entry-1920.png) | [1440](screenshots/operations-schedule-entry-1440.png) | [1024](screenshots/operations-schedule-entry-1024.png) | [390](screenshots/operations-schedule-entry-390.png) | [320](screenshots/operations-schedule-entry-320.png) |
| 助手首屏 | [1920](screenshots/daily-promotion-review-assistant-1920.png) | [1440](screenshots/daily-promotion-review-assistant-1440.png) | [1024](screenshots/daily-promotion-review-assistant-1024.png) | [390](screenshots/daily-promotion-review-assistant-390.png) | [320](screenshots/daily-promotion-review-assistant-320.png) |
| 分页后列表当前位置 | [1920](screenshots/search-results-1920.png) | [1440](screenshots/search-results-1440.png) | [1024](screenshots/search-results-1024.png) | [390](screenshots/search-results-390.png) | [320](screenshots/search-results-320.png) |
| 详情顶部 | [1920](screenshots/search-detail-1920.png) | [1440](screenshots/search-detail-1440.png) | [1024](screenshots/search-detail-1024.png) | [390](screenshots/search-detail-390.png) | [320](screenshots/search-detail-320.png) |
| 详情末尾 | [1920](screenshots/search-bottom-1920.png) | [1440](screenshots/search-bottom-1440.png) | [1024](screenshots/search-bottom-1024.png) | [390](screenshots/search-bottom-390.png) | [320](screenshots/search-bottom-320.png) |
| 查无结果 | [1920](screenshots/search-empty-1920.png) | [1440](screenshots/search-empty-1440.png) | [1024](screenshots/search-empty-1024.png) | [390](screenshots/search-empty-390.png) | [320](screenshots/search-empty-320.png) |
| 失败保留输入 | [1920](screenshots/search-failure-1920.png) | [1440](screenshots/search-failure-1440.png) | [1024](screenshots/search-failure-1024.png) | [390](screenshots/search-failure-390.png) | [320](screenshots/search-failure-320.png) |

[完整行为结果](browser-result.json)；规则、结构、构建及公共UI日志保留于本目录。后续发布核对记录在本目录的公开检查文件中。

发布源 `6df4534`，部署 `dpl_BdeHMzvYdai2XafTHE6u4REkBKEs`。6项候选动态检查、108项正式检查和66个静态资源哈希核对通过；[正式站](https://qiuyun-frontend.vercel.app)、[部署记录](deployment.json)、[公网核对](public-smoke.json)。
