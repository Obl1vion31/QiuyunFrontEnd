# 月计划常驻内容池与加高 Week

已完成实际页面自检并发布，正式核对通过。此批替换上一批的内容池折叠与编辑区 54px 初始高度；分类占比（含 100%）沿原实现保留。

- 编辑及确认安排后，内容池始终显示。桌面保持左 Week、右内容池；空 Week 初始最小高度 108px，内容增加时自然长高，右池内部滚动。手机沿用上下排列与半屏限高，Week 5 和保存入口可达。
- 首屏直接用 CSS 和实际周数确定手机池高度，移除折叠状态及运行后测高。390px 首次绘制采集 51 帧，池高度始终为 500px。只读展示与 PDF 延续紧凑结构。
- 数量、遗留勾选、一次拖一篇、跨周／移回、保存失败保留、追加、重新排期、审批、48 小时和原计划锁定回归通过。

## 实际截图与录像

数据来自隔离测试数据库的合成样本，不代表真实员工绩效或生产业务数据。原始调试产物位于 `.tools/test-artifacts/persistent-final-workflow/` 与 `.tools/test-artifacts/persistent-display/`。

| 场景 | 1920 | 1440 | 1024 | 390 | 320 |
| --- | --- | --- | --- | --- | --- |
| 初始常驻与空 Week | [图](screenshots/plan-initial-1920.png) | [图](screenshots/plan-initial-1440.png) | [图](screenshots/plan-initial-1024.png) | [图](screenshots/plan-initial-390.png) | [图](screenshots/plan-initial-320.png) |
| 左右部分分配 | [图](screenshots/plan-partial-1920.png) | [图](screenshots/plan-partial-1440.png) | [图](screenshots/plan-partial-1024.png) | [图](screenshots/plan-partial-390.png) | [图](screenshots/plan-partial-320.png) |
| 全部分周 | [图](screenshots/plan-weeks-1920.png) | [图](screenshots/plan-weeks-1440.png) | [图](screenshots/plan-weeks-1024.png) | [图](screenshots/plan-weeks-390.png) | [图](screenshots/plan-weeks-320.png) |
| 只读月计划 | [图](screenshots/monthly-plan-1920.png) | [图](screenshots/monthly-plan-1440.png) | [图](screenshots/monthly-plan-1024.png) | [图](screenshots/monthly-plan-390.png) | [图](screenshots/monthly-plan-320.png) |

- [确认后内容池](screenshots/plan-confirmed-1440.png)、[保存失败保留](screenshots/plan-confirm-failure-1440.png)、[手机底部](screenshots/plan-initial-bottom-390.png)
- [完整月会](screenshots/monthly-final-full-1440.png)、[完整手机月会](screenshots/monthly-final-full-390.png)、[完整周会](screenshots/weekly-final-full-1440.png)
- [桌面操作录像](video/plan-desktop.mp4)、[触屏操作录像](video/plan-phone.mp4)。按 0.5 秒连续取样，桌面 31 帧、手机 6 帧，已实际逐张检查；稳定图另行检查。
- [月会 PDF](pdf/monthly.pdf)、[周会 PDF](pdf/weekly.pdf) 及实际 Vercel 运行包 PDF，合计 16 页渲染图已审查，无缺字或分页裁切。

## 验证依据

- 259 项规则、数据库结构检查、类型检查与 Node／Vercel 构建通过。
- 完整隔离月计划流程、例会展示与 PDF 回归通过；本轮 54 张稳定图实际审查，五档分别记录初始、部分分配和完成状态。
- [源码哈希及基线](validation/source.json)、[流程](validation/workflow.json)、[展示回归](validation/display.json)、[首屏](validation/first-paint.json)、[PDF](validation/pdf.json)。构建、规则及流程日志位于同目录。
- 正式发布前，构建包检查与真实运行包中文 PDF 通过：[预检](release/preflight.json)、[运行包](release/runtime-bundle.json)。本轮无迁移或生产业务写入。

## 交付

应用 `25a31e8` 已推送工作分支与 main，正式域名对应 `dpl_BBznGg97JnKd17hJsMFfTaYdZ2CM` 且 READY；候选14项、正式122项及87个资源哈希核对通过。[发布依据](release/README.md)。
