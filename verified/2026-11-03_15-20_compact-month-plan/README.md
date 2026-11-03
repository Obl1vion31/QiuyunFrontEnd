# 空跑来源精简与月计划轻量分周板

状态：**已完成功能与视觉自检，待本轮视觉反馈，尚未发布。** 图片为实际运行页面和隔离 PGlite 测试数据，不代表正式业绩；未上传私有预览页。

分支 `codex/meeting-visual-samples`，基线 `0ec7d81`；[源码指纹](checks/source-manifest.json)对应本批实现，仓库其他未提交工作保留。

## 直接查看

- **[空跑来源 · 1440px](screenshots/waste-preview-1440.png)** · [资料气泡](screenshots/waste-info-1440.png) · [全部来源抽屉](screenshots/waste-sources-1440.png)
- **[月计划左右部分分配 · 1440px](screenshots/flow-plan-partial-1440.png)** · [填写数量](screenshots/flow-plan-quantity-1440.png) · [拖入高亮](screenshots/flow-plan-drag-hover-1440.png) · [确认后](screenshots/flow-plan-confirmed-1440.png)
- [手机分周 · 390px](screenshots/flow-plan-partial-390.png) · [320px](screenshots/flow-plan-partial-320.png) · [手机触屏保存完成](screenshots/flow-plan-touch-confirmed-390.png) · [手机空跑来源](screenshots/waste-source-list-320.png)
- **[完整月会](screenshots/monthly-final-full-1440.png)** · **[完整周会](screenshots/weekly-final-full-1440.png)** · [月会手机整页](screenshots/monthly-final-full-390.png) · [周会手机整页](screenshots/weekly-final-full-390.png)

## 操作录像与 PDF

- [拖放、移回、数量递减与保存](videos/plan-flow.mp4)，8.88 秒。
- [手机点击新增、点选分周与保存](videos/plan-touch.mp4)，2.68 秒。
- [空跑 info、全部来源及关闭返回](videos/waste-info-sheet.mp4)，9.92 秒。

录像来自真实自动化操作，节奏较快；其中包含视口切换，灰色区域是录制画布超出当前视口的部分。三段均连续每秒抽取四帧实际审查，共 87 帧；[连续帧与联系图](review/)、[媒体元数据](checks/media.json)。稳定截图另行查看，不以动画中间帧作为最终效果。

[月会 PDF · 6 页](pdf/monthly.pdf) · [周会 PDF · 3 页](pdf/weekly.pdf) · [月计划流程定稿 PDF · 5 页](pdf/monthly-plan-flow.pdf)。14 页均实际打开渲染检查，完整来源及资料链接保留；[逐页图像](pdf/pages/)。

## 本批交付与覆盖

- 空跑来源只常显名称、版本、info、本月金额及一行阶段日期；整轮金额、残留依据和链接收入公共资料气泡。有历史最多五条，无历史三条；右下角查看全部使用同序、同行布局的公共只读抽屉。
- 数量填写、拖入分周及确认后保持同一 Week 板。未关联新做按来源合并为 `×N`，每次拖动一个真实名额；归零保留灰态。补帖和已有排期保留各自身份，跨周、移回、键盘及触屏共用按需气泡。
- 底部主操作依次为“保存数量安排”“确认安排”，确认后保留重新排期及池底加号。新增保留原分配；重新排期只清除可修改周次，锁定、追加、关联、审批及 48 小时口径保持。

| 视图／状态 | 1920 | 1440 | 1024 | 390 | 320 |
| --- | --- | --- | --- | --- | --- |
| 数量填写、含补帖的部分分配、全部分完 | 通过 | 通过 | 通过 | 通过 | 通过 |
| 空跑来源、info 避让、全部名单 | 通过 | 通过 | 通过 | 通过 | 通过 |
| 旧快照无历史：三条来源及无往期提示 | 通过 | 通过 | 通过 | 通过 | 通过 |
| 只读紧凑分周、完整周／月页面 | 通过 | 通过 | 通过 | 通过 | 通过 |

拖入一次一篇、跨周、移回、数量更正、重排确认／取消、失败保留、纯新增和原计划锁定均使用真实组件及接口验证。另实测 1440px 键盘分周与焦点返回、390px 独立触屏新增／分周／保存、390／320px 来源抽屉滚到底。实际查看五档关键状态联系图、桌面及手机完整页面、相关局部原图和三段录像；本批共归档 87 张截图，覆盖信息见[结果](checks/flow-result.json)与[来源文字测量](checks/source-list-measurements.json)。

## 检查

- `pnpm test`：259 项通过；`pnpm db:check` 通过。
- 月计划隔离接口与浏览器、例会展示浏览器、公共 UI 通过；原审批、月历落实、48 小时及周会首次锁定链路通过。
- 首屏 17 场景、失败重试及七类字体消费者通过，真实字体为 MiSans；[首屏结果](checks/first-paint-result.json)。
- 类型检查与构建：0 错误、0 警告，保留原有 25 条提示。本批没有接口或数据库结构变更。

日志保留在 [checks](checks/)。复现沿用仓库 Node 22、`.tools/browsers`，分别运行 `pnpm test:monthly-workflow`、`node --import tsx tests/meeting-display.browser.ts`、`pnpm test:ui`、`pnpm test:first-paint` 及 `pnpm build`；原始浏览器产物位于 `.tools/test-artifacts/compact-plan-{flow,display,first-paint}/`。
