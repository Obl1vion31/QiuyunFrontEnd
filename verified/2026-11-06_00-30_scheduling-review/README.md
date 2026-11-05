# 保存修复与首轮排期核对

状态：已发布、已自检，待用户反馈。应用源码 c39994b，基线 aba6f66，独立工作树 scheduling-review-20261105／分支 codex/scheduling-review。此目录画面全部为本机隔离 PostgreSQL 虚构样本，使用实际 Vercel 运行包；真实数据纠正的备份、逐条前后值及恢复依据仅保存在私有工具目录。

## 修复依据与行为

- 历史推广表单漏带 updatedAt，严格校验却被统一解释为协作者冲突；正式编辑占用为零。补齐表单字段，取消普通保存的租约／强制刷新阻断，普通内容与指标按最后成功值保存。
- 历史大幅状态更正现在先预览后续日期、安排及指标影响；人工安排、例会决定不再提前挡住预览。暂停与待定可双向更正，保留兼容非零指标，不另开测试轮次；不兼容事实归档，旧例会不改写。
- 月计划草稿核对真实引用和重复项，不再被遗留变月、执行日期或分类漂移反向拒绝。预排期后文字保存沿原计划，不借文字修改计划，也不再用执行差异阻断文字。
- 当前未封存月会读取最新材料，包含活动草稿；历史版本仍读快照。封存收纳最新文字及实际安排，旧活动草稿保留历史，默认入口指向最终封存版。

## 现在的流程

管理员确认预排期 → 原月历首轮暂存 → 员工整月提交核对 → 管理员确认并永久封存；管理员可填写原因退回。待核对员工仅可登记真实实发。封存后日常排期调整填写原因、保留执行历史，不修改月会及计划基准。取消排期保留原帖、版本和历史，撤下项不计活动月历／逾期提醒。

正式数据按已确认清单完成事务纠正，并经独立只读复核；已发布记录、既有内容／指标数量及9个旧会议快照保持，结果见 [只读复核](checks/production-cleanup.json)。正式11月仍未确认预排期，新增入口保持关闭。迁移前私有备份已保存，先演练回滚再正式提交。

## 实际验证

- 259项全量规则通过；补充活动草稿收口后29项相关规则复验通过。Node与Vercel构建／类型检查均通过，schema检查与0047→0048真实兼容迁移通过。
- [跨日运行包复验](checks/crossday.json)：会议日期11月5日，服务器推进到11月8日后仍可正常确认预排期，后续完整月度链路通过。
- [月度接口](checks/integration.json)：遗留漂移保存、管理员预排期、暂存／整月提交、真实并发、实发不失效、退回重交、旧预览拒绝、冻结、取消保留原帖、附件写入拒绝及旧审批重放。
- [推广接口](checks/promotion-integration.json)：两角色普通保存、暂停／待定双向、后续人工及过去／未来会议决定的影响预览、归档、幂等与快照保留。
- [真实运行包浏览器](checks/browser.json)：原新建表单、拖动改期、503保留、提交、员工实发、管理员取消／确认、历史指标原表单保存及历史影响确认。样本人数先20→25，活动草稿期间补到26，封存后再补到30，封存页仍保持26及最新文字。
- [首屏](checks/first-paint.json)：员工1440px，冷缓存慢字体、暖硬刷新、站内进入三种真实路径；从首次绘制录制。公共UI回归通过。
- [运行包](release/runtime-bundle.json)：React、Chromium与中文字体完整，月会5页及周会3页PDF逐页渲染查看；首轮最终计划与最新文字进入实际PDF。空样本沿既有分节分页，没有裁切。
- [公网](release/production.json)：18项入口／同源表单／跨站／认证／协作检查与70项资源哈希一致；候选18项／3项关键资源通过。正式版本与部署见 [发布信息](release/release.json)。

## 界面证据

| 状态 | 实查范围与入口 |
| --- | --- |
| 首轮排期 | [1920](screenshots/arranging-1920.png)、[1440](screenshots/arranging-1440.png)、[1024](screenshots/arranging-1024.png) |
| 管理员核对 | [1920](screenshots/review-admin-1920.png)、[1440](screenshots/review-admin-1440.png)、[1024](screenshots/review-admin-1024.png) |
| 封存月会 | [1920](screenshots/sealed-monthly-1920.png)、[1440](screenshots/sealed-monthly-1440.png)、[1024](screenshots/sealed-monthly-1024.png) |
| 员工待核对与实发 | [待核对](screenshots/review-employee-1440.png)、[登记成功](screenshots/review-publication-saved-1440.png) |
| 失败及历史更正 | [503保留](screenshots/submit-failure-1440.png)、[历史原表单](screenshots/history-edit-1440.png)、[影响确认](screenshots/history-impact-preview-1440.png) |
| 月度补录及未预排期 | [实时材料](screenshots/monthly-live-before-seal-1440.png)、[尚未确认](screenshots/closed-1440.png) |
| 手机有限回归 | 排期 [390](screenshots/arranging-390.png)／[320](screenshots/arranging-320.png)，封存月会 [390](screenshots/sealed-monthly-390.png)／[320](screenshots/sealed-monthly-320.png)；仅查遮挡、页面溢出与入口，不作为完整手机填写验收 |

实际查看最终图及连续过程录像，确认取消保留输入、审批阶段与封存状态明确、原月历／品牌外壳保留。影片：[员工操作](video/employee.webm)、[管理员核对与历史更正](video/admin.webm)、[真实首屏过程](video/first-paint.webm)。PDF：[封存月会](release/runtime-monthly.pdf)、[周会回归](release/runtime-weekly.pdf)。
