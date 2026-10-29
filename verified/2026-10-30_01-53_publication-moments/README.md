# 发布登记：朋友圈同步确认

- 状态：已自检并发布；代码 `96d65f0d637498b1c4b74ce2313e89c57ac16866`，工作分支 `codex/publication-moments-confirmation`。
- 数据：正式页面／接口与隔离PGlite、虚构管理员和员工；不写共享业务库。
- 仅首次登记且排期要求同步朋友圈时，默认未选的两项必须全选。旧已发记录与后续更正不追补；确认复用发布事件JSON和原操作者／时间，无SQL迁移。
- 已实际查看五档关键截图、三档审批差异，以及桌面／手机录像的8fps连续帧。截图最终定位到完整确认项，历史图定位到实际运营确认文字。

## 关键画面

- [桌面首屏](screenshots/employee-empty-1440.png) · [手机首屏](screenshots/employee-empty-320.png) · [仅选一项](screenshots/employee-partial-390.png) · [失败保留勾选](screenshots/employee-failure-390.png)
- [长表单](screenshots/long-form-320.png) · [审批差异](screenshots/approval-confirmation-320.png) · [排期发布历史](screenshots/employee-history-1440.png) · [查帖历史](screenshots/employee-lookup-history-1440.png)
- [桌面操作录像](video/employee-1440.webm) · [手机操作录像](video/employee-390.webm) · [录像信息](video/clips.json)

## 实际覆盖

| 场景 | 覆盖 |
| --- | --- |
| 管理员、员工首次登记 | 1920／1440／1024／390／320px；默认、缺项焦点与零请求、单项、键盘、失败／关闭取消保留、保存和重开 |
| 长表单 | 五档真实延期理由；滚动到确认组，头部／底部位置不变 |
| 审核 | 员工真实提交202，管理员1440／390／320px差异及批准；规则另验拒绝不落库、旧快照无新键 |
| 历史与不适用 | 1440px不同步／旧已发隐藏，双方排期及查帖历史；规则验证后续更正继承且不追认 |
| 既有流程 | 原发布与公共UI回归；未来时间、链接、旧预约、权限、并发、更正及跨页公共几何 |

## 分状态图库

| 状态 | 1920 | 1440 | 1024 | 390 | 320 |
| --- | --- | --- | --- | --- | --- |
| 默认未选 | [管理](screenshots/admin-empty-1920.png)／[员工](screenshots/employee-empty-1920.png) | [管理](screenshots/admin-empty-1440.png)／[员工](screenshots/employee-empty-1440.png) | [管理](screenshots/admin-empty-1024.png)／[员工](screenshots/employee-empty-1024.png) | [管理](screenshots/admin-empty-390.png)／[员工](screenshots/employee-empty-390.png) | [管理](screenshots/admin-empty-320.png)／[员工](screenshots/employee-empty-320.png) |
| 缺项提示 | [管理](screenshots/admin-validation-1920.png)／[员工](screenshots/employee-validation-1920.png) | [管理](screenshots/admin-validation-1440.png)／[员工](screenshots/employee-validation-1440.png) | [管理](screenshots/admin-validation-1024.png)／[员工](screenshots/employee-validation-1024.png) | [管理](screenshots/admin-validation-390.png)／[员工](screenshots/employee-validation-390.png) | [管理](screenshots/admin-validation-320.png)／[员工](screenshots/employee-validation-320.png) |
| 仅选一项 | [管理](screenshots/admin-partial-1920.png)／[员工](screenshots/employee-partial-1920.png) | [管理](screenshots/admin-partial-1440.png)／[员工](screenshots/employee-partial-1440.png) | [管理](screenshots/admin-partial-1024.png)／[员工](screenshots/employee-partial-1024.png) | [管理](screenshots/admin-partial-390.png)／[员工](screenshots/employee-partial-390.png) | [管理](screenshots/admin-partial-320.png)／[员工](screenshots/employee-partial-320.png) |
| 失败保留 | [管理](screenshots/admin-failure-1920.png)／[员工](screenshots/employee-failure-1920.png) | [管理](screenshots/admin-failure-1440.png)／[员工](screenshots/employee-failure-1440.png) | [管理](screenshots/admin-failure-1024.png)／[员工](screenshots/employee-failure-1024.png) | [管理](screenshots/admin-failure-390.png)／[员工](screenshots/employee-failure-390.png) | [管理](screenshots/admin-failure-320.png)／[员工](screenshots/employee-failure-320.png) |
| 既有登记隐藏 | [管理](screenshots/admin-existing-1920.png)／[员工](screenshots/employee-existing-1920.png) | [管理](screenshots/admin-existing-1440.png)／[员工](screenshots/employee-existing-1440.png) | [管理](screenshots/admin-existing-1024.png)／[员工](screenshots/employee-existing-1024.png) | [管理](screenshots/admin-existing-390.png)／[员工](screenshots/employee-existing-390.png) | [管理](screenshots/admin-existing-320.png)／[员工](screenshots/employee-existing-320.png) |

227项规则、db:check、Node与Vercel类型检查／构建、原发布、公共UI、新确认专项和运行包中文PDF通过。[行为结果](browser-result.json)，对应日志在本目录。

发布源 `96d65f0`，部署 `dpl_WU5YF2wiHX8j9N7171apkXQmpgeF`；6项候选检查、108项正式检查与66个资源哈希通过。[正式站](https://qiuyun-frontend.vercel.app) · [部署记录](deployment.json) · [公网核对](public-smoke.json)。
