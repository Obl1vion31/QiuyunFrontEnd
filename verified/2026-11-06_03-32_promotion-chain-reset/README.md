# 推广历史更正与空跑图精简

状态：已发布，实际发布包与公网均已自检，待用户反馈。截图均为本机隔离 PostgreSQL 的虚构样本，原尺寸保存；仅验收电脑端。

源码基线 `fdcc82f`，应用 `8d03435`。独立分支 `codex/promotion-chain-reset`；保留原工作区无关修改。没有数据库结构迁移。

## 先看这几张

| 案例 | 更正前 | 确认与结果 |
| --- | --- | --- |
| 暂停后已恢复旧轮测试，后来又复测 | [1920完整表格与详情](promotion/admin-1920-01-before-full.png) | [原尺寸确认框](promotion/admin-1920-02-impact-detail.png) · [整段归档后](promotion/admin-1920-04-after-full.png) |
| 后面只有继续等待，可以直接更正 | [员工更正前](promotion/staff-1440-01-waiting-before.png) | [全部3天指标保留，表格与详情同为待定](promotion/staff-1440-02-waiting-after.png) |
| 取消与断网 | [取消后原因及选择保留](promotion/admin-1440-03-cancel-preserved-detail.png) | [断网后金额66.50保留，随后重试成功](promotion/staff-1440-03-network-failure-detail.png) |
| 原轮恢复／新轮复测 | [恢复原轮](promotion/admin-1440-05-resume-old-round-detail.png) | [重新开始新轮](promotion/admin-1440-06-restart-new-round-detail.png) |
| 月会测试空跑 | [1440页面](monthly/monthly-waste-1440.png) | [原尺寸局部](monthly/monthly-waste-1440-detail.png) · [全部来源](monthly/monthly-all-sources-1440.png) |

第一组把2026-10-29的暂停改为结束待定，2026-10-31已保存的“继续测试”将不再合法。因此确认范围从**次日10-30**开始，含之前仍兼容的等待日及之后的新轮，全部5条退出执行并归档；10-29的20元等指标保留。第二组后面只有等待，不触发整段重置，75元等原指标保留。

暂停可以继续暂停、恢复原轮、直接转放量、测试淘汰或重新测试新轮。结束待定可以继续等待、转放量、淘汰或重新测试新轮；不能继续原轮。后续明确的人工安排也参与验证。

## 实查范围

| 范围 | 实际检查 |
| --- | --- |
| 管理员历史状态更正 | 1920／1440／1024 × 1000；更正前、影响确认、取消、确认后，各有页面与关键局部 |
| 员工兼容更正、历史指标保存 | 1440 × 1000；表格／Inspector一致，合法选项，断网保留输入与真实重试 |
| 月会测试空跑 | 1920／1440／1024；总额、上月比较、五个月趋势、5条来源及全部来源抽屉，原计划Week保留 |
| 首屏 | 1440；冷缓存慢字体、暖缓存硬刷新、站内导航，正文位置稳定，实际字体与过程录像 |
| 公共UI | 1920／1440／1024；原公共几何与相邻视图、Inspector回归 |
| 打印 | 实际发布包生成5页中文PDF；已查看所有页，空跑图无周柱形、来源与计划Week保留 |

261项规则通过；最终调整后38项相关规则复验通过，类型／Node与Vercel构建、schema检查通过。真实PG两入口验证非法选择拒绝、兼容保留、从次日整段归档、残留、后续人工／区间／hold／有效会后决定撤回、跨界裁至当日、旧冻结JSON不变、预览回滚、旧预览拒绝、实际同时提交和请求重试幂等。

发布包重跑两角色浏览器操作与中文PDF。55张业务／月会图和3张首屏图、5页PDF图均保存原尺寸；两段实际操作／首屏录像抽查38帧。原始调试图不作为本次最终截图。

## 证据入口

- [推广图片](promotion/) · [月会图片](monthly/) · [首屏图片及记录](first-paint/)
- [真实PG结果](promotion/integration.json) · [实际发布包浏览器结果](promotion/browser.json) · [发布包检查](release/runtime-bundle.json)
- [实际操作录像](video/promotion-history-1440.webm) · [首屏录像](video/first-paint-1440.webm)
- [PDF](pdf/monthly.pdf) · [空跑PDF页](pdf/page-03.png) · [月计划PDF页](pdf/page-05.png)


正式应用 `8d03435`，部署 `dpl_ECBShbMPYm5wRP5c428znCq2epgT` 为 Ready，已提升至 [正式域名](https://qiuyun-frontend.vercel.app/business/daily-promotion-review)。候选20项／5关键资源、正式20项／70资源哈希通过；正式同源未登录表单401，跨站403，协作410。公网仅匿名读及拒绝写入探测，没有写入业务样本。

[候选核对](release/candidate.json) · [正式核对](release/production.json) · [发布记录](release/deployment.json)
