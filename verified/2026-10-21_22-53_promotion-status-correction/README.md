# 当日状态保存后再次更正

北京时间 2026-10-21 22:53，代码 `3111c28`。正式组件与隔离虚构业务数据，已自检，待用户反馈。

保存后始终保留“修改”入口；误选测试／放量淘汰可重新打开气泡，选择“恢复原状态”或原状态的合法后继。更正固定作用于本行日期，原因必填；数字草稿、其他记录节点与仍合法的次日安排保留。完整刷新后仍可更正，终态之后的新日期不因此获得重新推广权限。

| 场景 | 图像 |
| --- | --- |
| 测试淘汰后重新更正 | [1440px](promotion/testing-reopen-1440.png)、[1024px](promotion/testing-reopen-1024.png)、[390px](promotion/testing-reopen-390.png)、[320px](promotion/testing-reopen-320.png) |
| 恢复测试与原次日安排 | [1440px](promotion/testing-restored-1440.png)、[1024px](promotion/testing-restored-1024.png) |
| 刷新后仍可更正 | [390px](promotion/testing-after-reload-390.png) |
| 放量淘汰后更正及恢复 | [重新更正 1440px](promotion/scaling-reopen-1440.png)、[恢复 1440px](promotion/scaling-restored-1440.png)、[恢复 320px](promotion/scaling-restored-320.png) |
| Inspector 同步与焦点 | [1440px](promotion/inspector-restored-1440.png) |

[实际操作录像](motion/status-correction.webm)约 8 秒，包含误选、再次修改、恢复、刷新及详情入口；已实际查看截图和录像关键帧。手机窄屏保留局部横向查看，截图以状态和气泡为重点。

验证：159 项规则／事务测试、类型检查、构建、迁移检查通过；`test:status-correction` 通过 1440／1024／390／320px 的九组检查；完整 `test:review-workbench` 回归通过。数据源与结果见 [results.json](results.json)，媒体摘要见 [manifest.json](manifest.json)。
