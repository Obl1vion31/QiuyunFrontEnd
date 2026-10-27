# 延期原因按运营岗位归属命名

- 状态：已自检，待用户反馈。实现 `fbec351`。
- 原“自身原因／非自身原因”统一显示“运营原因／非运营原因”，录入标题为“原因归属”。原因填写、补登记、更正、历史与审批差异共用显示字典；编辑人继续记录真实操作账号。
- 保留底层 self／external 分类值、原原因文字及操作留痕，旧需求端分类与未知记录保持原意；仅调整展示，无数据库迁移。
- 数据来源：正式组件和隔离PGlite虚构业务事实；本轮未写生产业务数据。

## 实际界面

| 场景 | 截图 |
| --- | --- |
| 桌面选择与草稿保留 | [1440px](desktop/reason-entry-1440.png) |
| 管理员填写后的历史回显 | [1440px](desktop/admin-history-1440.png) |
| 手机原因归属 | [390px](mobile/reason-entry-390.png) · [320px](mobile/reason-entry-320.png) |

截图和[录像关键帧](motion/contact.png)已实际查看；[管理员历史操作录像](motion/admin-history.webm)。

## 验证

33项相关规则、延期／补登记／改期工作流、公共UI、db:check、类型检查与Node／Vercel构建通过；核对桌面和手机完整文案、保存回显、编辑人、其他日期草稿保留及未保存关闭保护。全量单测曾被本机WSL重启中断，未计为通过；恢复后逐项执行上述相关检查。[日志](checks/) · [管理员场景结果](checks/admin-history.json)。

## 发布

已发布[正式域名](https://qiuyun-frontend.vercel.app/business/operations-schedule)，发布源 `fbec351`，部署 `dpl_AjMB5QYo7jHp2Tm9h8SH2NoEaG8o`；独立动态探针5项、95项公网检查及61个资源哈希核对通过。运行包React、Chromium和中文PDF生成通过。

[公网结果](public-smoke.json) · [候选检查](candidate-smoke.json) · [正式部署](checks/formal.txt)。
