# 例会比较样张与月度切换动效

状态：**历史阶段样张，已被[完整页面整改批次](../2026-11-03_01-27_meeting-final-layout/README.md)替代；尚未发布。** 用户后续指出的辅助小字堆行、数字基线、成本方向色及缺少月计划全貌问题均由新批次接续；不再把本批当作最终效果。

[手机及桌面私有预览](https://chatgpt.com/space/page_9e3fab4b34288191994cb594035f8093)。图片上传为云端附件，手机无需访问本机路径。

## 本次效果

- 周会正常桌面两篇并排；帖子名称突出，7/15天主值、带符号pp及同类基准默认可见；往期、本次、未来节点分清。推广保留同阶段前次成本摘要。长名称自然换行，手机按完整节点排列。
- 月会人数、单位成本及较上月变化紧邻；总消耗变化中性，完整上月原值按需展开。草稿材料设置收起，真实文字录入与保存保留。
- 月度运营保留四卡、关注条和双图；私域放在双图后、明细前。成功显示不同月份才重播图形，同月刷新、筛选与局部保存不重播。
- 设计规范合并冲突的三列、全宽、强制等高与比较隐藏要求；共享身份、字体、业务口径、草稿与历史保护保持。

## 数据与实现

使用真实组件、认证和接口，业务测试仅写隔离PGlite；数据是虚构样本。浏览器与服务端时钟固定2026-11-03，用已完整的10月和9月构造可比较材料。没有生产业务写入或结构迁移。

分支`codex/meeting-visual-samples`，基线`0ec7d81`，尚未提交；本批源文件SHA256见[evidence/source-manifest.json](evidence/source-manifest.json)。保留了本轮开始前的未提交业务改动。

## 稳定截图

共39张，均为构建后真实页面。以下六组分别生成五档视口；已实际查看关键文字、主次层级、两卡／单列、比较信息、节点状态及全页构图。

| 视图／状态 | 1920 | 1440 | 1024 | 390 | 320 |
| --- | --- | --- | --- | --- | --- |
| 月会草稿首屏 | [图](screenshots/monthly-draft-1920.png) | [图](screenshots/monthly-draft-1440.png) | [图](screenshots/monthly-draft-1024.png) | [图](screenshots/monthly-draft-390.png) | [图](screenshots/monthly-draft-320.png) |
| 月会只读核心结果 | [图](screenshots/monthly-read-1920.png) | [图](screenshots/monthly-read-1440.png) | [图](screenshots/monthly-read-1024.png) | [图](screenshots/monthly-read-390.png) | [图](screenshots/monthly-read-320.png) |
| 周会推广 | [图](screenshots/weekly-promotion-1920.png) | [图](screenshots/weekly-promotion-1440.png) | [图](screenshots/weekly-promotion-1024.png) | [图](screenshots/weekly-promotion-390.png) | [图](screenshots/weekly-promotion-320.png) |
| 周会非推广7/15天 | [图](screenshots/weekly-non-promotion-1920.png) | [图](screenshots/weekly-non-promotion-1440.png) | [图](screenshots/weekly-non-promotion-1024.png) | [图](screenshots/weekly-non-promotion-390.png) | [图](screenshots/weekly-non-promotion-320.png) |
| 周会未来节点 | [图](screenshots/weekly-future-1920.png) | [图](screenshots/weekly-future-1440.png) | [图](screenshots/weekly-future-1024.png) | [图](screenshots/weekly-future-390.png) | [图](screenshots/weekly-future-320.png) |
| 月度运营原构图 | [图](screenshots/monthly-operations-1920.png) | [图](screenshots/monthly-operations-1440.png) | [图](screenshots/monthly-operations-1024.png) | [图](screenshots/monthly-operations-390.png) | [图](screenshots/monthly-operations-320.png) |

补充：[上月原值展开](screenshots/monthly-comparison-1440.png) · [材料设置](screenshots/monthly-settings-1440.png) · [真实修改与保存](screenshots/monthly-draft-edit-1440.png) · [推广历史](screenshots/weekly-promotion-detail-1440.png) · [非推广历史展开](screenshots/weekly-comparison-1440.png) · [触屏展开](screenshots/weekly-touch-expanded-390.png) · [整页](screenshots/weekly-draft-overview-1440.png) · [减少动态效果](screenshots/weekly-reduced-motion-320.png)。

手机在Linux Chromium触屏环境实际运行；不冒充真实iOS／Android硬件验收。原生日期外观随平台变化，最终中文字体仍使用MiSans。

## 操作录像与过程审查

- [桌面编辑、展开与多视口](video/meeting-desktop.webm)，53.32秒，按8fps连续抽帧实际查看；测试改变视口时录像画布外灰区不属于界面。
- [独立390px触屏](video/meeting-touch-390.webm)，3.96秒，按12fps连续抽帧实际查看。
- [1440px切月专项](video/monthly-switch-1440.webm)，20.64秒；[390px切月专项](video/monthly-switch-390.webm)，20.52秒，均按12fps连续抽帧实际查看。
- 专项覆盖11→10→11、视口外延后播放、同月刷新／筛选不重播、慢请求、快速切月、失败保留与重试、减少动态效果及播放中切换减少动态效果。原始播放时间记录见`evidence/monthly-motion-*.json`；手机首屏76帧正文起点146px保持不变。

连续帧审查用于看跳变和遮挡，稳定大图另行看文字；未以缩略图替代最终稳定截图。中间抽帧留在`.tools/test-artifacts/meeting-display/review/`。

## 已运行验证与后续检查点

- 相关30项规则通过；`pnpm build`含类型检查通过；`pnpm db:check`通过。
- 新`test:meeting-display`真实页面、保存、触屏和切月专项通过；公共UI回归与17场景首屏回归通过。对应日志位于`evidence/`。
- Impeccable布局扫描三组件无发现，实际视觉审查独立完成；`git diff --check`通过。
- 按用户确认流程，先反馈本批视觉方向。通过后再完成剩余模块与PDF、全链路／双角色及最终发布回归，随后按授权同步main和正式域名；当前不将这些未完成项目标为通过。
