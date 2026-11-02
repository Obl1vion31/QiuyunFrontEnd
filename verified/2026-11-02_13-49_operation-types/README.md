# 建帖运营类型与推广后持续复盘

状态：已自检，发布信息见下方。业务操作使用隔离 PGlite／本机 PostgreSQL，截图中的帖子、数据和账号均为测试样本，业务时钟固定在2026-11-24；正式站不写入测试记录。

## 查看效果

- [建帖选择运营类型](screenshots/create-promotion_then_continuous-1440.png)
- [即时类型的截止日与7／15天选项](screenshots/create-non_promotion_instant-390.png)
- [首次发布带入已保存的类型与日期](screenshots/publication-instant-390.png)
- [推广结束前](screenshots/before-end-1440.png)、[正常结束后](screenshots/after-end-1440.png)
- [非推广待安排入口](screenshots/awaiting-date-1440.png)、[手机日期浮层](screenshots/date-popover-320.png)
- [失败保留输入](screenshots/date-failure-390.png)、[重试后原位出现节点](screenshots/date-saved-390.png)
- [指标录入](screenshots/continuous-input-1440.png)、[手机追加成功及操作可达](screenshots/mobile-append-390.png)
- [桌面完整操作录像](videos/desktop.mp4)、[手机触控录像](videos/mobile.mp4)

## 逐视图覆盖

五档为1920／1440／1024／390／320px。稳定图58张已逐组实际查看，录制过程与稳定图分别审查。

| 视图与状态 | 覆盖 | 自检结果 |
| --- | --- | --- |
| 四类建帖 | 各五档，`create-*` | 类型位于分类后；即时就近显示日期与独立7／15天；其余不增加无关字段 |
| 发布登记即时摘要 | 五档，`publication-instant` | 已保存类型、15天选择与两天累计数正确；无重复选择方式；原固定保存区保持 |
| 推广结束前／后 | 各五档，`before-end`／`after-end` | 结束前不出现持续日期录入；生效后明确启用日和原帖累计起点 |
| 持续复盘待安排 | 五档，`awaiting-date` | 折叠组保留原表格宽度，不计欠填；长标题可读 |
| 共享日期浮层 | 五档，`date-popover` | 视口避让、日期及累计说明可读；手机无横向溢出 |
| 失败／重试与原位节点 | 390px，`date-failure`／`date-saved` | 503后保留日期，重试只生成一节点，节点原位进入待复盘列表 |
| 持续节点指标Inspector | 五档，`continuous-input` | 原帖起点、原始量及自动点击率对应；长表单可滚动 |
| 员工相同对象详情 | 五档，`employee-detail` | 同源类型、启用日及已录／待录节点可读，减少动态效果可用 |
| 手机追加 | 390px，`mobile-append` | 触控追加成功；滚动后按钮完整处于正文可视区域，底部导航不阻断操作 |

桌面17.12秒428帧、手机3.2秒80帧全部连续帧已实际查看；视频包含测试切换视口、表单动画与故障注入，中间帧不作最终效果。详见[视觉清单](visual-review.json)和[浏览器核对](browser-checks.json)。浏览器为Linux Chromium，手机为触控视口模拟，不代表真实iOS／Safari实机验收。

## 功能与兼容验证

- 245项规则、数据库结构检查、Node／Vercel类型检查与构建通过；实际运行包React、Chromium及中文PDF通过。
- 四类新建、实发、即时空日期及晚发校验、原帖未发布V0改版后首次发布、员工审核／批准通过。改帖继承策略；慢请求不覆盖先输入日期，关闭取消保留草稿。
- 直接放量正常结束、会后决定跨午夜生效使用同一回放资格；纯推广、测试／放量淘汰不衔接。撤销／恢复保留已录事实；周会引用同一节点。
- 原非推广计划接口／审批／跳过恢复、非推广Inspector、公共UI、发布登记、朋友圈双角色确认及例会讨论／PDF回归通过。0043→0044真实PostgreSQL迁移、旧指标保留、原唯一键写入、并发追加去重及策略版本冲突保护通过。
- 正式0044迁移仅增加两个可空字段，迁移前后私有备份核对48张非瞬态表一致；仅在线状态存在正常变化，原指标、计划、会议及业务历史未改写。[保留性摘要](migration-preservation.json)。正式三视图只读检查通过：[查询核对](production-read-model.json)。

## 发布

发布核对完成后在此记录正式版本与检查结果。
