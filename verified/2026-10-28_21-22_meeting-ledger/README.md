# 例会记录表列宽与PDF操作

状态：已实际看图自检并发布，待使用反馈。代码源 `7c052e921f5b3862140224ab508df1c042f409ec`。数据来自 `tests/meeting-ledger.browser.ts` 的隔离PGlite虚构会议与附件；不涉及生产业务数据写入。

列宽按字段和完整操作组分配，大屏表格限制合理宽度；普通记录PDF动作同行，生成／失败反馈使用本列宽度。主表使用“版本状态”和中文周期；总览与历史共用PDF组件。AGENTS、DESIGN与接入实例同步。

## 视觉证据

|场景|截图|
|---|---|
|常规桌面|[1920px](normal-1920.png)、[1440px](normal-1440.png)|
|窄桌面与横滚|[1280px](normal-1280.png)、[1280px归档](normal-right-1280.png)、[1024px](normal-1024.png)、[1024px归档](normal-right-1024.png)|
|小屏既有横滚|[390px](normal-390.png)、[320px](normal-320.png)、[320px归档](normal-right-320.png)|
|长标题／会前／草稿／归档状态|[1920px](mixed-1920.png)、[1440px](mixed-1440.png)|
|手动附件与历史|[附件](attachments-1440.png)、[历史版本](history-1440.png)|
|生成和失败反馈|[生成中](busy-1440.png)、[失败](error-1440.png)|

本轮未增加动效；原始操作录像留在私有调试目录。已查看实际图像；窄窗口保留表内横滚，未进行手机端改版。

## 验证

构建含Astro类型检查；例会专项覆盖六档视口，校验行高、实际动作中线、完整标题入口、表内横滚可达、附件避让／Esc和失败前后列宽。公共UI与非空数据界面回归通过。测量见 [result.json](result.json)。

222项规则、db:check、Node／Vercel构建与正式运行包中文PDF通过。正式部署 `dpl_CBUZ1PxMVSgFGKrLGjyvDV2U8Ba3`，5项候选动态检查、105项公网检查及66个资源哈希通过；线上仅检查公开资源与匿名保护，业务视觉使用上述隔离数据。见 [验证摘要](validation.json)、[公网核对](public-smoke.json)。
