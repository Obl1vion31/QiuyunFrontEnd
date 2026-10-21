# 复盘视觉方案示意 · 2026-10-21 01:15

状态：方案已自检，待用户确认。此批为供讨论的独立视觉示意，不是业务页面实现或业务验收截图。应用工作区原有未提交改动未修改；读取时应用 HEAD 为 `55b6ff6`。

来源：[本轮方案源文件](review-direction.html)。名称、学科和数值均为排版示例，不连接业务数据库。字体对照中 MiSans 已验证真实加载；本机系统字体实际为 Noto Sans CJK SC，用户设备的系统字体可能不同。

## 查看入口

- [字体与层级对照](font-comparison-desktop.png)
- [五篇测试，暂无待填写](promotion-empty-desktop.png)
- [多条待填写，展开第一条](promotion-ready-desktop.png)
- [测试、放量、暂停混合阶段](promotion-mixed-desktop.png)
- [概览下展开每日数据表](promotion-history-desktop.png)
- [736px 内容宽度](promotion-ready-inline.png)
- [390px 推广排版](promotion-mobile.png)
- [非推广分类汇总](nonpromotion-summary-desktop.png)
- [非推广筛选等待反馈](nonpromotion-loading-desktop.png)
- [非推广原位明细](nonpromotion-details-desktop.png)
- [390px 非推广排版](nonpromotion-mobile.png)
- [阶段变化中间帧](phase-change-middle.png)
- [交互示意录像](review-proposal.webm)

## 已检查范围

检查独立示意在 1000／736／390／320px 下的溢出和字段宽度；实际查看 1000／736／390px 的渲染截图。五条桌面概览加标题与列名为 388px。操作检查覆盖展开／收起、零分母成本、保存成功与数量同步、筛选等待超过 300ms 后出现局部加载条、连续筛选只更新最新选择，以及减少动态效果下详情立即开关。MiSans 与系统字体的实际字体来源已抽样读取，无页面脚本错误，测量见 [check.json](check.json)。

此示意尚未验证真实 API 的失败、权限、草稿保护、跨午夜和业务页面导航；后续应用实现仍须按仓库测试要求验收。方案中的 300ms 等待阈值及字体选择待本轮确认后同步到规范。
