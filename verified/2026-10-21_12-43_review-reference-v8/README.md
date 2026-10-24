# 复盘视觉参考 · 阶段命名、入场动效与累计效果

状态：已自检，待用户反馈。独立示例参考，本轮更新上方生命周期，保留每日单行录入和状态气泡。

## 本轮效果

- 节点使用“测试结束待定”“测试暂停”；放量后暂停仍明确为“放量暂停”。直接放量只有一个绿色起始节点。
- 可见后按已发生的节点和连线顺序呈现，三节点约 600ms 收尾，当前节点强调一次。填写、气泡、详情展开不重播；真正切回推广界面可播放一次，减少动态效果直接显示最终态。
- 当前状态之前增加总消耗、实际开口成本、实际留资成本，三项共列。宽屏轨迹限制约 400px，汇总值与标签统一左对齐，缩短轨迹与汇总之间的阅读距离。
- 汇总与展开明细共用示例底账；仅已保存记录计入。成本分别为累计消耗／累计实际开口人数、累计消耗／累计实际留资人数。暂停与待定跑量一并计入，无复盘或分母为零时相应值显示“—”。

## 截图与录像

- 生命周期：[1440px](overview-default-1440.png)、[1920px](overview-default-1920.png)、[390px](overview-default-390.png)、[320px](overview-default-320.png)
- 完整页面：[1440px](overview-page-1440.png)、[1920px](overview-page-1920.png)、[390px](overview-page-390.png)
- 场景：[五篇测试，暂无待填写](overview-empty-1440.png)、[多条待填写](promotion-ready-1440.png)、[测试／放量／暂停](overview-page-1440.png)
- [自然入场与切换录像](trajectory-entry.webm)
- 动效关键帧：[0ms](trajectory-000ms.png)、[120ms](trajectory-120ms.png)、[300ms](trajectory-300ms.png)、[480ms](trajectory-480ms.png)、[650ms](trajectory-650ms.png)
- [减少动态效果](overview-reduced-motion-1440.png)
- 长金额：[1440px](large-totals-1440.png)、[1920px](large-totals-1920.png)、[390px](large-totals-390.png)、[320px](large-totals-320.png)

## 实际验证

浏览器覆盖 1920、1440、1280、1024、736、390、320px。已查看桌面、手机、长金额、动效关键帧及自然录像帧。1440px、1920px 五条生命周期连标题仍为 396px；三节点完整、汇总与当前状态不重叠，窄屏按完整区域重排，页面无横向溢出。大金额单位可自然换行，三个金额主值保持同一基线；极窄屏将总消耗和两项成本分组排列。

示例累计 200＋360=560 元、实际开口 10＋18=28 人，实际开口成本 20.00 元；实际留资 5＋6=11 人，成本 50.91 元，验证没有平均每日成本。输入草稿不更新汇总，提交后同步；暂停跑量、零分母、测试暂停和放量暂停、直接放量、入场次数、局部操作、返回重播及减少动态效果已检查。详见[概览与动效检查](overview-check.json)、[长金额检查](large-totals-check.json)、[日度交互回归](check.json)。

源为 `reference-source.html`、包装为 `reference-preview.html`；HEAD `55b6ff6`，源 SHA-256 `e0cbaadd7d891d3c03bb4519deb8f96760ba0ddfae6f422f90f07db66dbb42b0`。数据为明确标记的示例，不连接业务 API 或数据库；本轮尚未实施到业务页面。
