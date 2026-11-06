# 推广历史：只修改当天，确认前后上下文

状态：已发布，实际发布包桌面及正式域名均已自检，待用户反馈。截图是隔离 PostgreSQL 的虚构样本，均为原尺寸；本轮仅电脑端。

源码基线 `e6bfeae`，应用 `c272394`，分支 `codex/promotion-day-context`。本批替代此前“历史单日更正后整段归档”的交互。无数据库结构迁移。

## 清晰对照

同一组样本2026-10-29至11-03共六天、消耗合计195元。只将10-31从测试中改为暂停，其他五天及六天指标保持原状。

| 状态 | 1440 × 1000 | 原像素局部 |
| --- | --- | --- |
| 修改前 | [完整视口](promotion/admin-1440-01-before.png) | [六日数据](promotion/admin-1440-01-before-detail.png) |
| 三天确认 | [完整视口](promotion/admin-1440-02-context.png) | [确认框](promotion/admin-1440-02-context-detail.png) |
| 取消后保留表单 | [完整视口](promotion/admin-1440-03-cancel-preserved.png) | [输入及选择](promotion/admin-1440-03-cancel-preserved-detail.png) |
| 修改后 | [完整视口](promotion/admin-1440-04-after.png) | [只改10-31](promotion/admin-1440-04-after-detail.png) |
| 相邻不合法 | [待定不能接原轮测试](promotion/admin-1440-05-invalid-adjacency.png) | [具体日期与状态错误](promotion/admin-1440-05-invalid-adjacency-detail.png) |

员工[断网保留输入](promotion/employee-1440-01-network-preserved.png)、[暂停/待定更正的三天确认](promotion/employee-1440-02-context.png)。

## 公开使用说明

[线上说明](https://qiuyun-frontend.vercel.app/business/settings?view=guide#guide-promotion)由员工和管理员共同阅读，列出允许和不能直接衔接的示例。历史只编辑当日安排；正常首次每日复盘的次日决策仍沿原流程。

| 角色 | 1920桌面 | 1440桌面 | 1024桌面 |
| --- | --- | --- | --- |
| 管理员 | [截图](guide/admin-1920-guide.png) | [截图](guide/admin-1440-guide.png) | [截图](guide/admin-1024-guide.png) |
| 员工 | [截图](guide/employee-1920-guide.png) | [截图](guide/employee-1440-guide.png) | [截图](guide/employee-1024-guide.png) |

## 实际验证

- 263项规则通过，类型、Node/Vercel构建、schema检查和桌面公共UI回归通过。
- 真实PostgreSQL覆盖：单日暂停/恢复、放量暂停、暂停与待定、非法相邻、旧表单兼容、既有测试轮次与冻结会议、并发一方成功、幂等、旧上下文拒绝；全部保留后续事实。
- 发布包实际操作：管理员1920/1440/1024（高1000），更正前/确认/取消/保存后；员工1440断网与兼容更正；双角色三档公开说明，实际MiSans平台字形、表单控件和页面溢出检查。
- 首屏1440冷缓存慢字体、暖缓存硬刷新、站内导航均实际录制；正文位置稳定。
- 54张业务/说明原尺寸图及3张首屏图。两段真实操作录像抽查17帧，有限动画过程与最终稳定图分别核对。1024长表在局部横滚，未造成整页溢出。
- 未变的月会输出另在`aa82faa`运行包验证中文PDF生成，五页均查看；最终包核对同源字体与运行依赖。数据全部来自隔离样本，不向正式库写入。

[接口结果](promotion/integration.json) · [发布包操作结果](promotion/browser.json) · [首屏结果](first-paint/results.json) · [正式包检查](release/runtime-bundle.json)

[实际操作录像](video/promotion-day-1440.webm) · [首屏录像](video/first-paint-1440.webm) · [中文PDF](pdf/monthly.pdf)

发布状态、正式域名、候选/正式匿名访问和资源哈希核对保存在[发布记录](release/deployment.json)、[候选核对](release/candidate.json)及[正式核对](release/production.json)。

正式部署 `dpl_8sw54Bbieib8L5LcQPdkDJ2Lc4VX` 为 Ready，已提升至正式域名。候选20项／4关键资源、正式20项／70资源哈希一致；同源未登录表单401、跨站403、协作接口410。公网仅匿名读取与拒绝写入探测，没有写入业务样本。
