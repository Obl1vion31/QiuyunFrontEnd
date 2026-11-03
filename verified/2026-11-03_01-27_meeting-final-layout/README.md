# 例会整页、比较排版与Week计划

**后续更正：本批为前序效果，已被[趋势、展示卡片与三步月计划](../2026-11-03_03-24_meeting-reports/README.md)替代。** 原检查只确认了当时的排版与流程，没有完成后来明确的全量趋势、空跑／分类图形及三步分配体验；不能继续以本批“已自检”代表当前设计已满足要求。保留原图、录像与以下当时记录，当前验收以新批次为准。

状态：**已完成本机功能及视觉自检，待用户查看完整页面；未发布。** 按本轮要求不上传私有预览页。截图使用隔离PGlite样本，不代表正式业务业绩。

## 直接查看

- [周会完整页1440px](screenshots/weekly-read-full-1440.png) · [月会完整页1440px](screenshots/monthly-full-1440.png)
- [周会7/15天局部](screenshots/weekly-non-promotion-1440.png) · [月计划局部](screenshots/monthly-plan-1440.png) · [月计划详情](screenshots/monthly-plan-detail-1440.png)
- [手机周会](screenshots/weekly-non-promotion-390.png) · [手机月会结果](screenshots/monthly-section-core-390.png) · [手机Week](screenshots/monthly-plan-390.png)
- [实际导出PDF](pdf/monthly-final.pdf)：四页已逐页渲染查看，[1](pdf/final-monthly-1.png)／[2](pdf/final-monthly-2.png)／[3](pdf/final-monthly-3.png)／[4](pdf/final-monthly-4.png)。PDF来自另一组完整流程夹具，数值与展示样张不同。

## 交付与口径

- 月会变化统一增加绿、减少红，成本也按方向；主值和箭头共用真实文字基线。
- 周会名称突出，桌面两卡；7/15天的阅读量、比率和同类pp同排。常规截止、精确基准和样本移入原详情，自定义日期保留。推广同类原值同行，前次真实区间与成本压为紧凑摘要。
- 月会完整组织为核心结果、学科私域、执行概览、测试空跑、分类投入、月计划和事项，不展示逐帖复盘，不保留空补充表。
- Week左侧，项目和计划／未登记数在右侧，遗留、具体日期、审批、跨周与48小时在详情。未登记不推断漏发；未来已登记也算已登记。原编辑来源池、拖放、审核、原名额及追加仍保留，未增加负责人。
- 新月度材料冻结既有执行读模型；旧快照缺失的登记信息显示未知，不实时回填旧会议。沿用接口、业务身份和保存流程，无数据库迁移。

## 覆盖与视觉检查

浏览器在1920／1440／1024／390／320px分别运行非空页面、长名称、正负pp、真实零、未来节点及原编辑流程。57张展示截图和5张流程截图经缩览检查，关键整页、主值及pp、月计划、手机、失败与详情另外打开原图审查。桌面主值文字底线误差不超过1px；DOM断言没有替代肉眼审查。

| 视图 | 1920 | 1440 | 1024 | 390 | 320 |
| --- | --- | --- | --- | --- | --- |
| 完整月会 | [图](screenshots/monthly-full-1920.png) | [图](screenshots/monthly-full-1440.png) | [图](screenshots/monthly-full-1024.png) | 按下列模块 | 按下列模块 |
| 完整周会 | [图](screenshots/weekly-read-full-1920.png) | [图](screenshots/weekly-read-full-1440.png) | [图](screenshots/weekly-read-full-1024.png) | [节点](screenshots/weekly-non-promotion-390.png) | [节点](screenshots/weekly-non-promotion-320.png) |
| 推广卡 | [图](screenshots/weekly-promotion-1920.png) | [图](screenshots/weekly-promotion-1440.png) | [图](screenshots/weekly-promotion-1024.png) | [图](screenshots/weekly-promotion-390.png) | [图](screenshots/weekly-promotion-320.png) |
| 7/15天 | [图](screenshots/weekly-non-promotion-1920.png) | [图](screenshots/weekly-non-promotion-1440.png) | [图](screenshots/weekly-non-promotion-1024.png) | [图](screenshots/weekly-non-promotion-390.png) | [图](screenshots/weekly-non-promotion-320.png) |
| Week项目汇总 | [图](screenshots/monthly-plan-1920.png) | [图](screenshots/monthly-plan-1440.png) | [图](screenshots/monthly-plan-1024.png) | [图](screenshots/monthly-plan-390.png) | [图](screenshots/monthly-plan-320.png) |

手机月会分段：[核心](screenshots/monthly-section-core-390.png)、[私域](screenshots/monthly-section-private-390.png)、[执行](screenshots/monthly-section-execution-390.png)、[空跑](screenshots/monthly-section-waste-390.png)、[分类](screenshots/monthly-section-categories-390.png)、[计划](screenshots/monthly-section-plan-390.png)、[事项](screenshots/monthly-section-issues-390.png)；320px同名图片均在本目录。表格保留内部横滚，手机使用Linux Chromium触屏模拟，不冒充真实iOS／Android设备。

## 操作与过程

- [页面编辑与多视口](video/meeting-desktop.webm)：58.76秒，1fps连续抽帧；[触屏展开](video/meeting-touch-390.webm)：3.76秒，12fps连续抽帧。
- [1440px切月](video/monthly-switch-1440.webm)：20.60秒；[390px切月](video/monthly-switch-390.webm)：19.84秒。全程1fps查看，另查看桌面3–6秒、手机0–8秒10fps连续帧，核对重新播放、加载保留、错误及减少动态效果。
- [月计划完整操作链](video/workflow-desktop.webm)：49秒，1fps连续抽帧；[手机草稿保护](video/workflow-touch-390.webm)：2.52秒，12fps连续抽帧。固定录像画布在测试缩窄视口时产生灰区，不是页面留白。抽帧产物保留在原始目录。
- 稳定截图单独审查；跨月、慢请求、失败重试、快速切月及减少动态效果由真实浏览器操作验证。手机从首帧到姓名加载后正文位置保持不变。

## 验证与代码

- `pnpm test`：254项通过；`pnpm build`含类型检查通过；`pnpm db:check`通过。
- `test:meeting-display`通过；月度贯通隔离接口9组、完整浏览器10组通过，包含真实拖放、受理／驳回、失败保留与重试、锁定、追加及48小时。公共UI通过，首屏冷／暖／慢加载17场景通过。
- Impeccable布局扫描无发现；`git diff --check`通过。测试日志及结果在[evidence](evidence/)，源码SHA256见[清单](evidence/source-manifest.json)。
- 分支`codex/meeting-visual-samples`，基线`0ec7d81`；保留原未提交业务改动。本轮不提交／推送／部署，先按用户要求提供完整图供视觉反馈。发布前需重新核对其他会话推进的远端main。
