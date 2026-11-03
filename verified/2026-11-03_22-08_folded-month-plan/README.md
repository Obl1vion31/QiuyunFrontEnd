# 月计划折叠内容池与遗留入口

Week默认铺满，长箭头打开内容池；桌面右池随Week高度内部滚动，窄屏在上方限高。勾选“未登记”候选才计数，名称前使用独立“新／遗留”标记。确认安排后收起，重新排期再打开；原ID、关联、审批、48小时和锁定保持。

学科／帖子分类投入维持原分类名称、真实占比与条形，包括单分类100%。本批截图均来自隔离测试数据，不代表实际业务金额。

## 查看效果

| 内容 | 桌面 | 手机 |
| --- | --- | --- |
| 默认收起 | [1440px](screenshots/plan-collapsed-1440.png) | [390px](screenshots/plan-collapsed-390.png) |
| 数量与遗留 | [1440px](screenshots/plan-quantity-1440.png) | [390px](screenshots/plan-quantity-390.png) |
| 部分分配 | [1440px](screenshots/plan-partial-1440.png) | [390px](screenshots/plan-partial-390.png) |
| 完整月会 | [1440px](screenshots/monthly-final-full-1440.png) | [390px](screenshots/monthly-final-full-390.png) |
| 完整周会 | [1440px](screenshots/weekly-final-full-1440.png) | [390px](screenshots/weekly-final-full-390.png) |
| 分类占比 | [1440px局部](screenshots/categories-1440.png) | [390px](screenshots/monthly-section-categories-390.png) |

另有1920／1024／320px、池内滚动、确认失败、归零、后台保存、追加、键盘及执行状态实图。已实际查看五档稳定截图和[桌面操作录像](video/plan-desktop.mp4)、[触屏操作录像](video/plan-phone.mp4)；录像包含测试视口切换。图像复查见[review](review/)。[周会PDF](pdf/weekly.pdf)／[月会PDF](pdf/monthly.pdf)与正式运行包PDF另行核对。

## 验证

- 259项规则、数据库结构检查、Node类型检查与构建通过。
- 隔离接口及浏览器走通：新做2＋选中遗留1、未选不计数、已有排期占名额、一次拖一篇、移回、归零、失败保留重试、确认收起、重排保留ID、追加、审批及周会锁定。
- 五档分别核对收起铺满、右池不撑高Week、窄屏高度上限、滚动保留与气泡清理；完整周／月会、公共UI及17个首屏场景通过。恢复分类占比后重新运行完整例会与月计划链路。
- [源码与检查清单](validation/source-and-checks.json)、[月计划结果](validation/workflow-browser.json)、[例会结果](validation/display.json)保存实际结果。原始故障排查留在.tools，未混入最终截图。

已发布并推送main。正式122项及87个资源哈希通过，部署READY并核对正式域名；[发布记录](release/README.md)。本批60张稳定截图、两段操作录像和16页PDF渲染已实际自检。
