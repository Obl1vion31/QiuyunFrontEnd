# 暂停实时编辑共享，保存时检查冲突

状态：已自检，待发布。数据均为隔离样本。源码基线为`d0bae7a`，工作分支`codex/optimistic-editing`；实际源码摘要见[版本记录](validation/source.json)。本次沿用 Impeccable 的交互与视觉检查，未接入 Unslop 候选。

- 编辑姓名、字段占用、位置、接管及轮询／取锁／续期统一暂停，旧协作接口直接410；原表和实现保留。
- 多人可同时填写，保存事务内比较原版本，先保存者生效；整帖包含子版本、推广指标及非推广节点。批量任一冲突整批回滚，幂等、权限和审批保留。
- 冲突仅有“刷新页面”，Esc不关闭；点击直接刷新并退出过期详情，不再二次离开确认。普通业务409与断网仍保留输入。协作样式也停止加载，避免影响原业务浮层定位。

## 实际验证

261项规则、schema检查、类型检查（0错误／0警告，26项既有提示）、Node构建、公共UI、月计划完整流程、例会展示与打印、排期审批／延期／节点恢复、年度规划和账号回归通过。状态更正9项覆盖1440／1024／390／320；最终冲突专项12组含真实PostgreSQL同时提交、不同对象、父子记录、历史更正、批量回滚与重复请求。

五分钟观察使用真实Chrome前台、同窗口后台标签及另一角色页面，实际持续301512ms：协作请求均为0；协作两表扫描和写入无增长。前台两页业务提醒各6次，后台为0；该提醒独立保留。[观察数据](validation/five-minute-observation.json)与[最终交互复验](validation/conflict-checks.json)分别记录，调试短跑不计为五分钟。不能据此承诺月流量低于25GB。

## 图像与过程

| 状态 | 图像 |
| --- | --- |
| 必须刷新（1920／1440／1024） | [1920](screenshots/conflict-1920.png) · [1440](screenshots/conflict-1440.png) · [1024](screenshots/conflict-1024.png) |
| 手机关键入口，仅检查遮挡与可达性 | [390](screenshots/conflict-390.png) · [320](screenshots/conflict-320.png) |
| 刷新后的列表 | [1440](screenshots/confirmed-refresh-1440.png) |
| 普通校验保留输入 | [1440](screenshots/ordinary-validation-keeps-input-1440.png) |
| 原月历，无共享状态占位 | [1920](screenshots/schedule-no-status-1920.png) · [1440](screenshots/schedule-no-status-1440.png) · [1024](screenshots/schedule-no-status-1024.png) |
| 原状态更正入口 | [桌面](screenshots/status-testing-reopen-1440.png) · [320](screenshots/status-scaling-reopen-320.png) |

[操作录像1](video/operation-1.mp4) · [操作录像2](video/operation-2.mp4) · [操作录像3](video/operation-3.mp4)。三段均为真实浏览器操作，已审查17个连续取样帧；固定视口截图另行查看。实际运行包月会5页、周会3页PDF已逐页渲染检查：[月会](review/pdf-monthly.jpg) · [周会](review/pdf-weekly.jpg)。

发布核对归入`release/`；不包含生产虚构写入或数据库迁移。
