# 统计卡片与控件计数统一

已自检，待用户反馈。归档时间为北京时间。正式组件、Node构建及隔离PGlite；1000条排期、12项日度复盘和例会摘要均为虚构夹具。390／320px为Chromium模拟触屏，未替代实机验收。

## 交付与验证

- 排期七项标签＋数字同行整体居中，8px间距、统一文字层级；移除重复细分说明，保留状态色、筛选与卡片横滚。
- 例会摘要在1024px改为两列，长金额不拆行；屏幕容器重排不覆盖打印四列。整篇不复盘取得覆盖整篇的租约，服务端保护保持。
- 一键保存及推广历史、查帖、例会等计数使用半角括号；真实管理员／员工批量保存覆盖503失败保留、重试、成功和计数归零，共保存24条隔离指标。
- 长期规则、接入说明与测试要求已同步；旧统计条的内部对齐通过结论已在原批次撤回。
- [统计与批量结果](result.json)、[例会补充结果](peers-result.json)；227项规则、db:check、Node构建、公共UI、发布、时间线及每日工作台回归通过。测试修正了固定时钟不同步及缩放另开窗口争抢同一租约的旧前提，气泡另覆盖键盘提交。

## 按视图、状态、宽度记录

统计卡每格包含横滚首尾；桌面不需要滚动时两张相同。各档均包含真实零值及一至四位数字。

| 统计视图 | 1920 | 1440 | 1024 | 390 | 320 |
| --- | --- | --- | --- | --- | --- |
| 月历 | [首](screenshots/schedule-calendar-1920-left.png)／[尾](screenshots/schedule-calendar-1920-right.png) | [首](screenshots/schedule-calendar-1440-left.png)／[尾](screenshots/schedule-calendar-1440-right.png) | [首](screenshots/schedule-calendar-1024-left.png)／[尾](screenshots/schedule-calendar-1024-right.png) | [首](screenshots/schedule-calendar-390-left.png)／[尾](screenshots/schedule-calendar-390-right.png) | [首](screenshots/schedule-calendar-320-left.png)／[尾](screenshots/schedule-calendar-320-right.png) |
| 台账 | [首](screenshots/schedule-ledger-1920-left.png)／[尾](screenshots/schedule-ledger-1920-right.png) | [首](screenshots/schedule-ledger-1440-left.png)／[尾](screenshots/schedule-ledger-1440-right.png) | [首](screenshots/schedule-ledger-1024-left.png)／[尾](screenshots/schedule-ledger-1024-right.png) | [首](screenshots/schedule-ledger-390-left.png)／[尾](screenshots/schedule-ledger-390-right.png) | [首](screenshots/schedule-ledger-320-left.png)／[尾](screenshots/schedule-ledger-320-right.png) |
| 测试中筛选 | [首](screenshots/schedule-testing-1920-left.png)／[尾](screenshots/schedule-testing-1920-right.png) | [首](screenshots/schedule-testing-1440-left.png)／[尾](screenshots/schedule-testing-1440-right.png) | [首](screenshots/schedule-testing-1024-left.png)／[尾](screenshots/schedule-testing-1024-right.png) | [首](screenshots/schedule-testing-390-left.png)／[尾](screenshots/schedule-testing-390-right.png) | [首](screenshots/schedule-testing-320-left.png)／[尾](screenshots/schedule-testing-320-right.png) |
| 空月份／零值 | [首](screenshots/schedule-zero-1920-left.png)／[尾](screenshots/schedule-zero-1920-right.png) | [首](screenshots/schedule-zero-1440-left.png)／[尾](screenshots/schedule-zero-1440-right.png) | [首](screenshots/schedule-zero-1024-left.png)／[尾](screenshots/schedule-zero-1024-right.png) | [首](screenshots/schedule-zero-390-left.png)／[尾](screenshots/schedule-zero-390-right.png) | [首](screenshots/schedule-zero-320-left.png)／[尾](screenshots/schedule-zero-320-right.png) |

| 一键保存真实状态 | 1920 | 1440 | 1024 | 390 | 320 |
| --- | --- | --- | --- | --- | --- |
| 默认 (12) | [查看](screenshots/batch-default-1920.png) | [查看](screenshots/batch-default-1440.png) | [查看](screenshots/batch-default-1024.png) | [查看](screenshots/batch-default-390.png) | [查看](screenshots/batch-default-320.png) |
| 保存中 | [查看](screenshots/batch-saving-1920.png) | [查看](screenshots/batch-saving-1440.png) | [查看](screenshots/batch-saving-1024.png) | [查看](screenshots/batch-saving-390.png) | [查看](screenshots/batch-saving-320.png) |
| 失败／保留输入 | [查看](screenshots/batch-failure-1920.png) | [查看](screenshots/batch-failure-1440.png) | [查看](screenshots/batch-failure-1024.png) | [查看](screenshots/batch-failure-390.png) | [查看](screenshots/batch-failure-320.png) |
| 成功／刷新延迟 | [查看](screenshots/batch-success-1920.png) | [查看](screenshots/batch-success-1440.png) | [查看](screenshots/batch-success-1024.png) | [查看](screenshots/batch-success-390.png) | [查看](screenshots/batch-success-320.png) |
| 禁用 (0) | [查看](screenshots/batch-disabled-1920.png) | [查看](screenshots/batch-disabled-1440.png) | [查看](screenshots/batch-disabled-1024.png) | [查看](screenshots/batch-disabled-390.png) | [查看](screenshots/batch-disabled-320.png) |

| 同类入口 | 1920 | 1440 | 1024 | 390 | 320 |
| --- | --- | --- | --- | --- | --- |
| 例会摘要 | [查看](screenshots/meeting-summary-1920.png) | [查看](screenshots/meeting-summary-1440.png) | [查看](screenshots/meeting-summary-1024.png) | [查看](screenshots/meeting-summary-390.png) | [查看](screenshots/meeting-summary-320.png) |
| 例会历史版本计数 | [查看](screenshots/meeting-history-count-1920.png) | [查看](screenshots/meeting-history-count-1440.png) | [查看](screenshots/meeting-history-count-1024.png) | [查看](screenshots/meeting-history-count-390.png) | [查看](screenshots/meeting-history-count-320.png) |

非推广保持紧凑同级摘要：[非空1440](screenshots/non-promotion-populated-1440.png)；[推广历史分组](screenshots/promotion-history-counts-1440.png)、[查帖日度计数](screenshots/lookup-count-1440.png)另按实际入口检查。

## 图像与过程审查

79张稳定截图已结合整页与局部检查；[审查联系图](review-sheets/)按视图和状态归组，几何测量与肉眼审查共同验证。卡片标签／数字位置、8px间距及整组中心均通过，必要的表内横滚保留。

[桌面真实操作录像](video/desktop.webm)（10.36秒）／[手机真实操作录像](video/mobile.webm)（6.68秒）；按8fps连续帧完整查看。录像中的视口切换灰边来自固定录制画布，稳定截图使用各自实际视口。

桌面：[连续帧1](video/desktop-frames-01.jpg) · [连续帧2](video/desktop-frames-02.jpg) · [连续帧3](video/desktop-frames-03.jpg) · [连续帧4](video/desktop-frames-04.jpg) · [连续帧5](video/desktop-frames-05.jpg)
手机：[连续帧1](video/mobile-frames-01.jpg) · [连续帧2](video/mobile-frames-02.jpg) · [连续帧3](video/mobile-frames-03.jpg)

## 发布

实现源码：`f5d61fe237dcbc8ee485d7a5f9d120eccaa6d51c`。Vercel类型检查／构建及运行包中文PDF通过，无数据库迁移。候选部署 `dpl_8LvZfA9VyfYdTJHvp92wDiTjQ78q` 的6项只读检查通过；已切换[正式域名](https://qiuyun-frontend.vercel.app)，[108项公网检查与66个资源哈希](public-smoke.json)通过。工作分支`codex/statistics-count-alignment`；合入main仍独立确认。
