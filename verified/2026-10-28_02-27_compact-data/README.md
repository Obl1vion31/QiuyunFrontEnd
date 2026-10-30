# 待定行收紧与工作台数据界面巡检

已自检，待用户反馈。日期为北京时间。截图使用正式组件、构建产物与隔离 PGlite 虚构数据；107份非推广样本、真实零值／长数字、长名称、非空规划／审批及附件元数据均来自测试夹具。390／320px为 Chromium 模拟视口，未替代实机验收。业务写入只发生在隔离库。

## 统计条验收更正（2026-10-30）

该批统计条仅验证字号、标签不裁切及卡片最小宽度，未比较卡片内部标签／数字的共同中线与组内距离。数字跨两行且只有聚合项带说明，旧图已经存在对齐不一致；统计条内部对齐不再记为通过，保留原图供对照，本轮最终修正另行归档。其他实际验证结果按原记录保留。

## 本轮结果

| 入口 | 处理与实际检查 |
| --- | --- |
| 每日主表首次待定 | 下拉128px＋截止日56px、间距8px；保存／取消同排40px高。空日期直接保存，日期气泡共用行草稿，关闭保留；72px常规行高不因日期出现而增加。五档视口覆盖空／已选日期、开关、Esc、取消、保存中、503失败；失败提示随可见横滚区域避让。 |
| 推广历史 | 阶段列116px，最长状态完整；长金额、人数、真实零值保留。 |
| 非推广 | 同级表头13/20，排序继承；分类样本／动作按内容留宽。107样本、0、99.99%、100%及分类左右横滚已看。 |
| 排期台账／统计条／月历 | 桌面名称与时间左锚点、短状态及资料按列居中；统计卡按标签＋数字的内容最小宽度，不拆四字标题。移动卡片时间72px、版本48px，显式覆盖桌面内距，三字工作类型完整、版本不重叠，名称／状态共用左锚点。月历保留结构，补齐可读字号。 |
| 权限／审批 | 权限列与行标题独立定义，选择框最大224px。审批标题去叠加外边距；长字段及前后值保留可读列宽、窄屏内部横滚；已有说明与决定操作保留。 |
| 例会PDF | 操作在本列内换行、间距单处管理，错误独立一行；附件共用顶层气泡，长名称与下载可见。已有PDF＋2附件、生成中、503长错误实际检查。 |
| 年度规划 | 非空矩阵、长备注及付费子区间按既有布局保留；年度接口与编辑／只读回归通过。 |

规则整合在 [DESIGN](../../docs/DESIGN.md)、[共享接入](../../docs/code-study.md) 和 [验收说明](../../tests/README.md)：必须验证条件态、公共样式层叠后的实际字体和尺寸、真实文字边界，不能只看默认空态或隐藏节点。

## 重点截图

- [桌面待定行](arrangement/wait-empty-1920.png) · [手机截止日气泡](arrangement/wait-date-popup-320.png) · [手机保存失败保留输入](arrangement/wait-save-failure-320.png)
- [排期台账与统计条1024](pages/schedule-ledger-1024.png) · [手机排期卡片](pages/schedule-ledger-390.png) · [月历1440](pages/schedule-calendar-1440.png)
- [非推广分类1920](pages/non-promotion-grouped-1920.png) · [权限1440](pages/permissions-editable-1440.png) · [手机审批长字段](pages/annual-approval-320.png) · [手机审批修改后](pages/annual-approval-right-320.png)
- [例会PDF多操作](pages/meeting-pdf-actions-1920.png) · [长错误](pages/meeting-pdf-error-1440.png) · [手机附件气泡](pages/meeting-attachments-320.png) · [非空年度矩阵](pages/annual-matrix-1024.png)

### 待定行五档条件态

| 视口 | 空日期 | 日期气泡 | 已选日期 | 保存中 | 保存失败 | 取消 |
| --- | --- | --- | --- | --- | --- | --- |
| 1920 | [查看](arrangement/wait-empty-1920.png) | [查看](arrangement/wait-date-popup-1920.png) | [查看](arrangement/wait-date-selected-1920.png) | [查看](arrangement/wait-save-busy-1920.png) | [查看](arrangement/wait-save-failure-1920.png) | [查看](arrangement/wait-cancelled-1920.png) |
| 1440 | [查看](arrangement/wait-empty-1440.png) | [查看](arrangement/wait-date-popup-1440.png) | [查看](arrangement/wait-date-selected-1440.png) | [查看](arrangement/wait-save-busy-1440.png) | [查看](arrangement/wait-save-failure-1440.png) | [查看](arrangement/wait-cancelled-1440.png) |
| 1024 | [查看](arrangement/wait-empty-1024.png) | [查看](arrangement/wait-date-popup-1024.png) | [查看](arrangement/wait-date-selected-1024.png) | [查看](arrangement/wait-save-busy-1024.png) | [查看](arrangement/wait-save-failure-1024.png) | [查看](arrangement/wait-cancelled-1024.png) |
| 390 | [查看](arrangement/wait-empty-390.png) | [查看](arrangement/wait-date-popup-390.png) | [查看](arrangement/wait-date-selected-390.png) | [查看](arrangement/wait-save-busy-390.png) | [查看](arrangement/wait-save-failure-390.png) | [查看](arrangement/wait-cancelled-390.png) |
| 320 | [查看](arrangement/wait-empty-320.png) | [查看](arrangement/wait-date-popup-320.png) | [查看](arrangement/wait-date-selected-320.png) | [查看](arrangement/wait-save-busy-320.png) | [查看](arrangement/wait-save-failure-320.png) | [查看](arrangement/wait-cancelled-320.png) |

[日期保存回显](arrangement/wait-date-saved-1440.png)、[草稿确认取消](arrangement/draft-confirm-cancel-1440.png)、[跨午夜T+1](arrangement/midnight-start-opened-1440.png)亦已检查。其余五档页面截图保存在 `pages/`，测量见 [待定行](arrangement/geometry.json) 与 [各数据入口](pages/geometry.json)。

## 录像与验证

[待定行操作录像](video/waiting-row.webm)／[已查看关键帧](video/waiting-row-frames.jpg)；[数据入口巡检录像](video/data-interfaces.webm)／[已查看关键帧](video/data-interfaces-frames.jpg)。包含真实操作、保存失败与草稿保留；减少动态效果开启，移动视口保留内部横滚。

213项规则、db:check、类型检查与Node构建通过；首次安排、数据条件态、公共UI、每日工作台、年度规划、非推广和时间线回归通过。详细输出位于 `logs/`。无数据库迁移；T+1、空截止日语义及原有审计接口保留。

## 发布核对

实现提交 [96d5c40](https://github.com/Obl1vion31/QiuyunFrontEnd/commit/96d5c400a75a2b654430a95b3656fc5878c71b72)；正式部署 `dpl_3bNqG5u8BQXJoiBTUJFjaEneB4FP`，状态 Ready，正式入口 [每日复盘](https://qiuyun-frontend.vercel.app/business/daily-promotion-review)。

[Vercel构建](logs/vercel-build.log)、[中文PDF运行包](logs/pdf-runtime.log)通过；[候选5项](candidate-smoke.json)、[正式域名98项与64个资源哈希](public-smoke.json)通过。正式核对覆盖登录保护、同源／外站表单、静态版本和私有路径保护；业务保存与视觉验收使用上述隔离夹具，未写生产业务数据。

