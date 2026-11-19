# 发布链接与推广笔记身份

已自检，待用户反馈。截图全部来自隔离 PostgreSQL 的明确虚构样例，不含正式业务、令牌或真实分享签名。对应 `codex/publication-link-identities`；正式交付版本见根目录 `handoff.md` 的本项。

发布登记从完整链接提取笔记 ID，短链由服务端受限解析；同排期重发按日期保存链接来源。历史没有链接时保留手填，未知身份补链接须选择范围。推广详情按当天身份显示原链接，实际人数、策略及阶段继续人工维护。

## 实际查看的状态

| 状态 | 管理员 | 员工 |
| --- | --- | --- |
| 发布自动识别 | [1440](admin-automatic-publication-1440.png) | [1440](employee-automatic-publication-1440.png) |
| 新链接生效范围 | [1440](admin-link-date-range-1440.png)、[1024](admin-link-date-range-1024.png) | [1440](employee-link-date-range-1440.png) |
| 短链失败保留输入 | [1440](admin-short-link-failure-1440.png) | [1440](employee-short-link-failure-1440.png) |
| API 事实与手填人数 | [1440](admin-daily-api-link-source-1440.png) | [1440](employee-daily-api-link-source-1440.png) |
| 原日期对应旧链接 | [1440](admin-history-original-link-1440.png) | [1440](employee-history-original-link-1440.png) |
| 历史无链接仍能手填 | [1440](admin-history-manual-fallback-1440.png) | [1440](employee-history-manual-fallback-1440.png) |
| 未知身份补登记范围 | [1440](admin-history-unknown-link-1440.png) | 共用规则，由隔离接口验证 |

桌面视口为 1440×1000、范围面板补验 1024×1000；390×844 仅核查明显溢出和关闭入口，不代表手机填写体验通过。逐帧查看了[范围编辑短片](publication-link-range.webm)，裁去后续切换视口的过程。

## 验证依据

- 实际发布目标为 Vercel 运行包，构建和最终测试类型复核均为 0 错误、0 警告；兼容迁移检查通过。未改变 PDF 使用的路径，不触发 PDF 专项。
- 16 项解析／发布规则通过；[真实接口及兼容迁移](integration.json)覆盖并发首登、归属冲突、服务端拒绝手填覆盖、分段旧链接、短链失败回滚、审批、空报表与真实 10 秒超时。另跑历史手填和聚光区间回归。
- [双角色浏览器报告](browser.json)覆盖真实保存、日期分段、首次慢读反馈、失败输入保留及短链重试；[历史未知身份报告](unknown-browser.json)覆盖范围计数、前段未知值及已有事实保留。
- 已实际查看所有归档截图，检查字段组间距、原生 fieldset 边框、对齐和可用宽度；修正了范围区的默认边框及输入布局。Impeccable 机械扫描仅发现原有日历／逾期提示的边标样式，未新增于本轮字段。
