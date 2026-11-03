# 月例会、月计划与排期月历贯通

> 后续复核：本批旧图保留为历史。用户反馈确认私域位置、无关学科、月会逐帖结构及月计划分步操作不符合业务阅读顺序；原视觉通过结论在这些方面覆盖不足，不再代表当前标准。新整改另批验收，旧图片不删除。

2026-11-02，北京时间。状态：已实际自检，待使用反馈。业务写入样本全部来自隔离PGlite或本机独立PostgreSQL；截图中的帖子、人数及账号均为测试样本。正式库只执行0045兼容迁移和只读核对，私有备份不进入图库。

## 查看入口

- [执行月计划与追加批次](screenshots/monthly-final-plan-1440.png)
- [月历计划池：超时、待审、驳回](screenshots/calendar-pool-1440.png)、[手机状态](screenshots/calendar-review-status-390.png)
- [私域录入](screenshots/private-editor-1440.png)、[320px录入](screenshots/private-editor-320.png)
- [周会确认更新的计划版本](screenshots/weekly-reference-updated-1024.png)
- [完整月会PDF](monthly-final.pdf)、[桌面链路录像](video/desktop.webm)、[员工手机录入录像](video/mobile.webm)

## 实际覆盖

| 视图及状态 | 视口 | 结果 |
| --- | --- | --- |
| 月会总览、数量3含遗留1、Week分配 | 1920／1440／1024／390／320 | 已查看稳定图，手机按完整组重排 |
| 私域摘要与录入 | 同上 | 未知、零值及交叉人数；抽屉单滚动、固定操作区 |
| 月历计划池 | 同上 | 原计划／追加、超48h、真实待审及驳回 |
| 计划执行对照 | 同上 | 左端及右端、末行；表内横滚不撑宽页面 |
| 周会计划更新引用 | 同上，另含窄屏右端 | 显式确认版本；会后锁定，旧会前快照保留 |
| 已锁定原计划、追加定稿 | 1440 | 旧数量及Week不变；追加单独生效 |
| 同日确认、取消、保存失败重试、遗留跨Week | 1440 | 原表单保留字段和原排期ID；未选择时不显示取消按钮 |
| 员工未保存确认与真实保存 | 390触屏 | 取消关闭保留输入，保存回显正确 |
| 冷／暖缓存、慢字体及提醒、刷新 | 五档17场景 | 字体MiSans，侧栏与正文稳定；两段首屏录像全部连续帧已查看 |
| 月会PDF | 6页 | 逐页查看：人数不拆散，分类明细展开，Week与名额一起分页 |

54张稳定截图、桌面1094帧和手机73帧均已通过联系图及关键原图实际检查；连续帧联系图见[inspection](inspection/manifest.json)。首屏截图与录像另见[first-paint](first-paint/result.json)。移动端为Chromium触屏模拟，未将其写作真实手机／Safari验收。

修正了验收发现的1024px周会外层撑宽、计划池隐藏按钮被公共样式覆盖，以及来源刷新按钮作用域失配。中间失败产物保留在私有工具目录，不作为最终通过证据。

## 验证

- [正式API集成](integration.json)、[真实界面链路](browser.json)：自然月边界、来源／数量／Week、审批预览回滚、实际申请占位、48h、首次周会锁定、追加、显式补材料及旧版本冻结。
- [真实PostgreSQL](postgres.json)：0044→0045保留旧快照，人数及名额并发、锁定幂等。
- 249项规则、db:check、Node及Vercel类型检查／构建通过；公共UI、原月度、发布／朋友圈、四种运营类型、排期与最新延期、例会讨论／PDF及17个首屏场景通过。正式运行包的React、Chromium、字体与离线中文PDF也已核对。
- 发布包私有目录排除及资源核对见[preflight](preflight.json)。生产迁移、部署、正式资源核对结果由本批对应JSON记录。

本批对应`codex/monthly-meeting-flow`实现；应用提交与正式部署记录见根目录handoff的本轮交接。

正式交付：应用`b5bf6cc`，部署`dpl_DANTeJtFNn9XDVmxUgLtsm4sAp7L`已READY并由正式域名解析。候选14项、正式120项及84个资源哈希通过，见[发布记录](release.json)、[正式核对](public-smoke.json)。[迁移保留核对](migration-preservation.json)确认48张非瞬态旧表不变、新增4表为空；[正式只读模型](production-read-model.json)确认没有追造历史计划或人数。
