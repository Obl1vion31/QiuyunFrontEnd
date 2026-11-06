# 全站桌面材质与交互对比

后续状态：2026-11-07用户已确认发布并推送main，[发布核对](../2026-11-07_01-41_workspace-glass-release/README.md)。本批原图及“未发布”标识保留采集时状态。

已自检，待用户反馈。样张及可运行候选均在本地，未发布、未推送、未合入main。

## 查看入口

- [全站对比器](http://127.0.0.1:34916/?page=monthly&state=monthly-execution&mode=pair)：14组模块，切换原版／候选、并排、原始尺寸及整页；左侧逐页列出视觉、动效与业务逻辑说明。
- [排期资料与发布信息](http://127.0.0.1:34916/?page=schedule&state=schedule-resources&mode=pair)、[排期四阶段](http://127.0.0.1:34916/?page=schedule&state=schedule-pending&mode=pair)、[真实操作录像](http://127.0.0.1:34916/?page=schedule&mode=video)。点击“操作原版／候选”进入隔离样本，默认管理员；可以真实交互。浏览器入口依赖本机预览进程，以下原文件长期保留。

## 源码、数据与范围

- 正式功能基线3e8d037；继承已认可08ff443，最终应用364f297e874071804482e6ed0b82484fc3af1291，分支codex/workspace-glass-all。工作树.tools/releases/workspace-glass-all-20261106；原工作树和原版证据未覆盖。
- 两边均为虚构账号、固定业务ID和本机隔离PostgreSQL，浏览器与服务器固定2026-11-06 12:00上海时区。全站与排期各一套样本，分别保证原版／候选摘要一致；[来源和摘要](checks/provenance.json)。没有接共享Neon。
- 改动属于材质、分组、阅读层级及交互反馈。业务权限、统计、保存、审批、预排期和封存规则沿用；无新增API、迁移、轮询或运行时依赖。认可规则写入DESIGN、共享接入和测试说明。
- 另修复React18 Node流式中文编码缺陷：仅回移[官方PR26228](https://github.com/react/react/pull/26228)两处已写字节边界，pnpm补丁固定，版本不变。修复前真实测试失败，修复后开发／生产共512组通过；候选9页原始响应NUL和替代字形均为0。[记录](checks/edge-paint.json)。

## 实际验收

- Node和Vercel构建通过；类型0错误／0警告，44项既有提示；274规则通过。登录、公共UI、年度、非推广、推广当日、月会工作流、发布登记、公共面板和首页动效回归均通过，[日志目录](checks/)。旧夹具改为真实预排期、有效来源、同日确认及现行当日状态表单，未绕过业务校验。
- 最终排期运行包13组通过：真实拖放／键盘、整月草稿双方续写、503与慢保存保留新输入、待审占用、提交退回重交、核对封存、封存后执行留痕及原历史快照不变。另有管理员／员工真实保存、待核对实发后继续封存及发布并发检查。
- 1920／1440／1024桌面分别采集并检查；稳定视口图高度1000，主要整页图为1440。保存失败、未保存和特殊确认状态主要为1440，具体文件宽度见下表；没有以另一尺寸冒充覆盖。
- 实际查看录屏及抽帧：全站原版／候选、排期原版／候选、左右落点及键盘触压、冷缓存慢字体／暖刷新／站内导航和慢请求。首屏从绘制开始记录，慢读仅目标容器一处反馈；减少动态效果、快速开关及切帖也已实操。记录在[交互](checks/interactions.json)、[首屏及边界](checks/edge-paint.json)、[覆盖](checks/coverage.json)和[排期](checks/schedule-after.json)。
- 月会打印降级背景／阴影，并查看三份服务端真实生成文件的全部12页：预排期、核对封存、补录后封存；正文及计划完整。[打印证据](checks/pdf/)及[渲染图](review/pdf-preplanned.jpg)。手机390／320仅查明显遮挡、溢出和关闭入口，未作为日常填写或完整移动排版验收。

## 逐页变化及覆盖

### 月例会

- 延续最新六项结果和金额旁走势，外壳改为透光磨砂材质、亮边与柔和投影。
- 四个执行指标合成一个连续面板；空跑与Week区保留原有内容。

- 动效：新增：历史月份、执行明细、全部来源的定向触压、按压亮斑和阻尼回正。；新增：来源220ms可反向展开；图点悬停／键盘强调。Sheet进出沿用公共实现。

- 逻辑：统计、冻结资料、预排期和封存规则不变。消耗增减用中性色，单位成本下降红、上升绿；箭头表示增减。

| 状态 | 已采集原版／候选视口 | 整页 |
| --- | --- | --- |
| 完整月会 | 1920 [原](before/screenshots/monthly-1920.png)／[候选](after/screenshots/monthly-1920.png) · 1440 [原](before/screenshots/monthly-1440.png)／[候选](after/screenshots/monthly-1440.png) · 1024 [原](before/screenshots/monthly-1024.png)／[候选](after/screenshots/monthly-1024.png) | 1440 [原](before/screenshots/monthly-1440-full.png)／[候选](after/screenshots/monthly-1440-full.png) |
| 执行指标面板 | 1920 [原](before/screenshots/monthly-execution-1920.png)／[候选](after/screenshots/monthly-execution-1920.png) · 1440 [原](before/screenshots/monthly-execution-1440.png)／[候选](after/screenshots/monthly-execution-1440.png) · 1024 [原](before/screenshots/monthly-execution-1024.png)／[候选](after/screenshots/monthly-execution-1024.png) | 视口／局部 |
| 历史月份 | 1920 [原](before/screenshots/monthly-history-1920.png)／[候选](after/screenshots/monthly-history-1920.png) · 1440 [原](before/screenshots/monthly-history-1440.png)／[候选](after/screenshots/monthly-history-1440.png) · 1024 [原](before/screenshots/monthly-history-1024.png)／[候选](after/screenshots/monthly-history-1024.png) | 视口／局部 |
| 来源展开 | 1440 [原](before/screenshots/monthly-sources-1440.png)／[候选](after/screenshots/monthly-sources-1440.png) | 视口／局部 |
| 空跑来源 | 1440 [原](before/screenshots/monthly-waste-1440.png)／[候选](after/screenshots/monthly-waste-1440.png) | 视口／局部 |
| 全部空跑来源 | 1440 [原](before/screenshots/monthly-waste-sheet-1440.png)／[候选](after/screenshots/monthly-waste-sheet-1440.png) | 视口／局部 |

### 排期管理

- 七项汇总合为连续筛选面板；阶段、Week、月历／台账及核对保留同一工作区，统一透光外壳与清晰数据面。
- 帖子标题优先，版本、时间和计划归属就近；详情突出真实资料链接，应发、实发及待处理默认可见。

- 动效：新做帖、项目资料和帖子链接显式接入定向触压、亮斑与阻尼回正；日期格、来源拖放和密集帖子保持稳定。；新增选中、悬停、键盘与缺失态强调；Inspector／Sheet进出、未保存保护沿用公共控制器。

- 逻辑：预排期门禁、默认运营类型、草稿、核对、审批、实发及永久封存规则均不变。资料分层属于查看方式调整，没有新增读取或轮询。

| 状态 | 已采集原版／候选视口 | 整页 |
| --- | --- | --- |
| 首轮排期／密集同日 | 1920 [原](before/screenshots/schedule-editing-1920.png)／[候选](after/screenshots/schedule-editing-1920.png) · 1440 [原](before/screenshots/schedule-editing-1440.png)／[候选](after/screenshots/schedule-editing-1440.png) · 1024 [原](before/screenshots/schedule-editing-1024.png)／[候选](after/screenshots/schedule-editing-1024.png) | 1440 [原](before/screenshots/schedule-editing-1440-full.png)／[候选](after/screenshots/schedule-editing-1440-full.png) |
| 选择计划 | 1920 [原](before/screenshots/schedule-selection-1920.png)／[候选](after/screenshots/schedule-selection-1920.png) · 1440 [原](before/screenshots/schedule-selection-1440.png)／[候选](after/screenshots/schedule-selection-1440.png) · 1024 [原](before/screenshots/schedule-selection-1024.png)／[候选](after/screenshots/schedule-selection-1024.png) | 视口／局部 |
| 台账 | 1920 [原](before/screenshots/schedule-ledger-1920.png)／[候选](after/screenshots/schedule-ledger-1920.png) · 1440 [原](before/screenshots/schedule-ledger-1440.png)／[候选](after/screenshots/schedule-ledger-1440.png) · 1024 [原](before/screenshots/schedule-ledger-1024.png)／[候选](after/screenshots/schedule-ledger-1024.png) | 1440 [原](before/screenshots/schedule-ledger-1440-full.png)／[候选](after/screenshots/schedule-ledger-1440-full.png) |
| 推广中视角 | 1920 [原](before/screenshots/schedule-promotion-1920.png)／[候选](after/screenshots/schedule-promotion-1920.png) · 1440 [原](before/screenshots/schedule-promotion-1440.png)／[候选](after/screenshots/schedule-promotion-1440.png) · 1024 [原](before/screenshots/schedule-promotion-1024.png)／[候选](after/screenshots/schedule-promotion-1024.png) | 1440 [原](before/screenshots/schedule-promotion-1440-full.png)／[候选](after/screenshots/schedule-promotion-1440-full.png) |
| 帖子详情 | 1920 [原](before/screenshots/schedule-inspector-1920.png)／[候选](after/screenshots/schedule-inspector-1920.png) · 1440 [原](before/screenshots/schedule-inspector-1440.png)／[候选](after/screenshots/schedule-inspector-1440.png) · 1024 [原](before/screenshots/schedule-inspector-1024.png)／[候选](after/screenshots/schedule-inspector-1024.png) | 视口／局部 |
| 资料与发布信息 | 1920 [原](before/screenshots/schedule-resources-1920.png)／[候选](after/screenshots/schedule-resources-1920.png) · 1440 [原](before/screenshots/schedule-resources-1440.png)／[候选](after/screenshots/schedule-resources-1440.png) · 1024 [原](before/screenshots/schedule-resources-1024.png)／[候选](after/screenshots/schedule-resources-1024.png) | 视口／局部 |
| 编辑排期 | 1920 [原](before/screenshots/schedule-editor-1920.png)／[候选](after/screenshots/schedule-editor-1920.png) · 1440 [原](before/screenshots/schedule-editor-1440.png)／[候选](after/screenshots/schedule-editor-1440.png) · 1024 [原](before/screenshots/schedule-editor-1024.png)／[候选](after/screenshots/schedule-editor-1024.png) | 视口／局部 |
| 发布登记 | 1920 [原](before/screenshots/schedule-publication-1920.png)／[候选](after/screenshots/schedule-publication-1920.png) · 1440 [原](before/screenshots/schedule-publication-1440.png)／[候选](after/screenshots/schedule-publication-1440.png) · 1024 [原](before/screenshots/schedule-publication-1024.png)／[候选](after/screenshots/schedule-publication-1024.png) | 视口／局部 |
| 资料缺失 | 1920 [原](before/screenshots/schedule-missing-1920.png)／[候选](after/screenshots/schedule-missing-1920.png) · 1440 [原](before/screenshots/schedule-missing-1440.png)／[候选](after/screenshots/schedule-missing-1440.png) · 1024 [原](before/screenshots/schedule-missing-1024.png)／[候选](after/screenshots/schedule-missing-1024.png) | 视口／局部 |
| 直接进入详情 | 1440 [原](before/screenshots/schedule-deep-link-1440.png)／[候选](after/screenshots/schedule-deep-link-1440.png) | 视口／局部 |
| 未保存保护 | 1440 [原](before/screenshots/schedule-unsaved-1440.png)／[候选](after/screenshots/schedule-unsaved-1440.png) | 视口／局部 |
| 同日确认 | 1440 [原](before/screenshots/schedule-occupancy-1440.png)／[候选](after/screenshots/schedule-occupancy-1440.png) | 视口／局部 |
| 失败保留输入 | 1440 [原](before/screenshots/schedule-failure-1440.png)／[候选](after/screenshots/schedule-failure-1440.png) | 视口／局部 |
| 员工待核对 | 1920 [原](before/screenshots/schedule-pending-1920.png)／[候选](after/screenshots/schedule-pending-1920.png) · 1440 [原](before/screenshots/schedule-pending-1440.png)／[候选](after/screenshots/schedule-pending-1440.png) · 1024 [原](before/screenshots/schedule-pending-1024.png)／[候选](after/screenshots/schedule-pending-1024.png) | 1440 [原](before/screenshots/schedule-pending-1440-full.png)／[候选](after/screenshots/schedule-pending-1440-full.png) |
| 管理员核对 | 1920 [原](before/screenshots/schedule-pending-admin-1920.png)／[候选](after/screenshots/schedule-pending-admin-1920.png) · 1440 [原](before/screenshots/schedule-pending-admin-1440.png)／[候选](after/screenshots/schedule-pending-admin-1440.png) · 1024 [原](before/screenshots/schedule-pending-admin-1024.png)／[候选](after/screenshots/schedule-pending-admin-1024.png) | 视口／局部 |
| 封存后执行 | 1920 [原](before/screenshots/schedule-confirmed-1920.png)／[候选](after/screenshots/schedule-confirmed-1920.png) · 1440 [原](before/screenshots/schedule-confirmed-1440.png)／[候选](after/screenshots/schedule-confirmed-1440.png) · 1024 [原](before/screenshots/schedule-confirmed-1024.png)／[候选](after/screenshots/schedule-confirmed-1024.png) | 1440 [原](before/screenshots/schedule-confirmed-1440-full.png)／[候选](after/screenshots/schedule-confirmed-1440-full.png) |
| 尚未确认预排期 | 1920 [原](before/screenshots/schedule-closed-1920.png)／[候选](after/screenshots/schedule-closed-1920.png) · 1440 [原](before/screenshots/schedule-closed-1440.png)／[候选](after/screenshots/schedule-closed-1440.png) · 1024 [原](before/screenshots/schedule-closed-1024.png)／[候选](after/screenshots/schedule-closed-1024.png) | 1440 [原](before/screenshots/schedule-closed-1440-full.png)／[候选](after/screenshots/schedule-closed-1440-full.png) |
| 原预排期月会 | 1920 [原](before/screenshots/schedule-meeting-1920.png)／[候选](after/screenshots/schedule-meeting-1920.png) · 1440 [原](before/screenshots/schedule-meeting-1440.png)／[候选](after/screenshots/schedule-meeting-1440.png) · 1024 [原](before/screenshots/schedule-meeting-1024.png)／[候选](after/screenshots/schedule-meeting-1024.png) | 1440 [原](before/screenshots/schedule-meeting-1440-full.png)／[候选](after/screenshots/schedule-meeting-1440-full.png) |

### 推广复盘

- 生命周期与录入表分为透光外层和清晰数据层，弱化边框并保留行列定位。
- 详情以项目资料、已发布帖子两个入口为重点；日期与ID按需展开。历史编辑窗减少过大的空白。

- 动效：新增：资料入口随点击位置轻倾、亮斑、阻尼回正；普通动作1px按下反馈。；新增：资料元信息展开过渡；选中行与详情保持对应。生命周期、Inspector进出沿用原控制器。

- 逻辑：当日状态、相邻衔接、三天确认、权限、保存和失败保留输入不变。没有改回编辑次日安排。

| 状态 | 已采集原版／候选视口 | 整页 |
| --- | --- | --- |
| 每日复盘 | 1920 [原](before/screenshots/promotion-1920.png)／[候选](after/screenshots/promotion-1920.png) · 1440 [原](before/screenshots/promotion-1440.png)／[候选](after/screenshots/promotion-1440.png) · 1024 [原](before/screenshots/promotion-1024.png)／[候选](after/screenshots/promotion-1024.png) | 1440 [原](before/screenshots/promotion-1440-full.png)／[候选](after/screenshots/promotion-1440-full.png) |
| 历史总览 | 1920 [原](before/screenshots/promotion-history-1920.png)／[候选](after/screenshots/promotion-history-1920.png) · 1440 [原](before/screenshots/promotion-history-1440.png)／[候选](after/screenshots/promotion-history-1440.png) · 1024 [原](before/screenshots/promotion-history-1024.png)／[候选](after/screenshots/promotion-history-1024.png) | 1440 [原](before/screenshots/promotion-history-1440-full.png)／[候选](after/screenshots/promotion-history-1440-full.png) |
| 当日详情 | 1920 [原](before/screenshots/promotion-inspector-1920.png)／[候选](after/screenshots/promotion-inspector-1920.png) · 1440 [原](before/screenshots/promotion-inspector-1440.png)／[候选](after/screenshots/promotion-inspector-1440.png) · 1024 [原](before/screenshots/promotion-inspector-1024.png)／[候选](after/screenshots/promotion-inspector-1024.png) | 视口／局部 |
| 切换记录 | 1440 [原](before/screenshots/promotion-selection-1440.png)／[候选](after/screenshots/promotion-selection-1440.png) | 视口／局部 |
| 编辑这一天 | 1920 [原](before/screenshots/promotion-edit-1920.png)／[候选](after/screenshots/promotion-edit-1920.png) · 1440 [原](before/screenshots/promotion-edit-1440.png)／[候选](after/screenshots/promotion-edit-1440.png) · 1024 [原](before/screenshots/promotion-edit-1024.png)／[候选](after/screenshots/promotion-edit-1024.png) | 视口／局部 |
| 断网保留输入 | 1440 [原](before/screenshots/promotion-failure-1440.png)／[候选](after/screenshots/promotion-failure-1440.png) | 视口／局部 |

### 非推广复盘

- 分类和真实记录共用一块清晰的数据面，保留7/15天、即时和持续复盘的不同布局。
- 资料入口优先，日期与笔记ID按需查看；输入继续使用实底。比率差值统一为改善红、下降绿。

- 动效：新增：资料入口触压、元信息展开、行悬停／焦点反馈。；已有：分类展开、图轨和Inspector进出；继续保留列表、筛选、焦点与滚动。

- 逻辑：节点、同类样本、指标计算、录入、跳过／恢复及权限不变。只重组支持信息。

| 状态 | 已采集原版／候选视口 | 整页 |
| --- | --- | --- |
| 待复盘 | 1920 [原](before/screenshots/nonpromotion-1920.png)／[候选](after/screenshots/nonpromotion-1920.png) · 1440 [原](before/screenshots/nonpromotion-1440.png)／[候选](after/screenshots/nonpromotion-1440.png) · 1024 [原](before/screenshots/nonpromotion-1024.png)／[候选](after/screenshots/nonpromotion-1024.png) | 1440 [原](before/screenshots/nonpromotion-1440-full.png)／[候选](after/screenshots/nonpromotion-1440-full.png) |
| 分类均值 | 1920 [原](before/screenshots/nonpromotion-history-1920.png)／[候选](after/screenshots/nonpromotion-history-1920.png) · 1440 [原](before/screenshots/nonpromotion-history-1440.png)／[候选](after/screenshots/nonpromotion-history-1440.png) · 1024 [原](before/screenshots/nonpromotion-history-1024.png)／[候选](after/screenshots/nonpromotion-history-1024.png) | 1440 [原](before/screenshots/nonpromotion-history-1440-full.png)／[候选](after/screenshots/nonpromotion-history-1440-full.png) |
| 展开真实记录 | 1920 [原](before/screenshots/nonpromotion-expanded-1920.png)／[候选](after/screenshots/nonpromotion-expanded-1920.png) · 1440 [原](before/screenshots/nonpromotion-expanded-1440.png)／[候选](after/screenshots/nonpromotion-expanded-1440.png) · 1024 [原](before/screenshots/nonpromotion-expanded-1024.png)／[候选](after/screenshots/nonpromotion-expanded-1024.png) | 视口／局部 |
| 即时复盘 | 1920 [原](before/screenshots/nonpromotion-instant-1920.png)／[候选](after/screenshots/nonpromotion-instant-1920.png) · 1440 [原](before/screenshots/nonpromotion-instant-1440.png)／[候选](after/screenshots/nonpromotion-instant-1440.png) · 1024 [原](before/screenshots/nonpromotion-instant-1024.png)／[候选](after/screenshots/nonpromotion-instant-1024.png) | 1440 [原](before/screenshots/nonpromotion-instant-1440-full.png)／[候选](after/screenshots/nonpromotion-instant-1440-full.png) |
| 持续复盘 | 1920 [原](before/screenshots/nonpromotion-continuous-1920.png)／[候选](after/screenshots/nonpromotion-continuous-1920.png) · 1440 [原](before/screenshots/nonpromotion-continuous-1440.png)／[候选](after/screenshots/nonpromotion-continuous-1440.png) · 1024 [原](before/screenshots/nonpromotion-continuous-1024.png)／[候选](after/screenshots/nonpromotion-continuous-1024.png) | 1440 [原](before/screenshots/nonpromotion-continuous-1440-full.png)／[候选](after/screenshots/nonpromotion-continuous-1440-full.png) |
| 资料与录入 | 1920 [原](before/screenshots/nonpromotion-inspector-1920.png)／[候选](after/screenshots/nonpromotion-inspector-1920.png) · 1440 [原](before/screenshots/nonpromotion-inspector-1440.png)／[候选](after/screenshots/nonpromotion-inspector-1440.png) · 1024 [原](before/screenshots/nonpromotion-inspector-1024.png)／[候选](after/screenshots/nonpromotion-inspector-1024.png) | 视口／局部 |
| 未保存保护 | 1440 [原](before/screenshots/nonpromotion-unsaved-1440.png)／[候选](after/screenshots/nonpromotion-unsaved-1440.png) | 视口／局部 |

### 周例会

- 四项本期结果合成连续面板，各自保留真实趋势与比较。
- 逐帖卡片使用统一材质，主值、观察和行动继续就近排列。

- 动效：新增：图点悬停与键盘强调、普通动作按下反馈。；原有：可见后图形播放、资料气泡、编辑切换及未保存确认。

- 逻辑：候选、逐帖决定、修订、保存、会前／会后定稿及快照规则不变。

| 状态 | 已采集原版／候选视口 | 整页 |
| --- | --- | --- |
| 只读总览 | 1920 [原](before/screenshots/weekly-1920.png)／[候选](after/screenshots/weekly-1920.png) · 1440 [原](before/screenshots/weekly-1440.png)／[候选](after/screenshots/weekly-1440.png) · 1024 [原](before/screenshots/weekly-1024.png)／[候选](after/screenshots/weekly-1024.png) | 1440 [原](before/screenshots/weekly-1440-full.png)／[候选](after/screenshots/weekly-1440-full.png) |
| 编辑模式 | 1440 [原](before/screenshots/weekly-edit-1440.png)／[候选](after/screenshots/weekly-edit-1440.png) | 视口／局部 |
| 未保存确认 | 1440 [原](before/screenshots/weekly-unsaved-1440.png)／[候选](after/screenshots/weekly-unsaved-1440.png) | 视口／局部 |

### 例会总览

- 记录列表共用透光外壳，保留紧凑的名称、版本、会议与复盘日期。
- 草稿、历史、PDF和新建入口保持原职责，弹窗材质与全站一致。

- 动效：新增：行悬停光影和动作轻按。；已有：更多菜单、弹窗成对进出、提交反馈。

- 逻辑：创建、删除草稿、查看历史与PDF生成规则不变。旧阶段入口仍按原逻辑跳转。

| 状态 | 已采集原版／候选视口 | 整页 |
| --- | --- | --- |
| 例会记录 | 1920 [原](before/screenshots/meetings-1920.png)／[候选](after/screenshots/meetings-1920.png) · 1440 [原](before/screenshots/meetings-1440.png)／[候选](after/screenshots/meetings-1440.png) · 1024 [原](before/screenshots/meetings-1024.png)／[候选](after/screenshots/meetings-1024.png) | 1440 [原](before/screenshots/meetings-1440-full.png)／[候选](after/screenshots/meetings-1440-full.png) |
| 新建例会 | 1920 [原](before/screenshots/meeting-create-1920.png)／[候选](after/screenshots/meeting-create-1920.png) · 1440 [原](before/screenshots/meeting-create-1440.png)／[候选](after/screenshots/meeting-create-1440.png) · 1024 [原](before/screenshots/meeting-create-1024.png)／[候选](after/screenshots/meeting-create-1024.png) | 视口／局部 |

### 月度运营

- 四项执行指标并为一个面板，加入当前所选指标的可见强调。
- 发布、投入、私域来源和明细采用同一材质；数字与图形保持清晰。

- 动效：新增：点击指标后持续强调当前对象；按钮悬停、焦点和轻按反馈。；已有：点击定位明细、图形可见后播放、历史与录入Sheet。

- 逻辑：直接根据原明细控件的状态强调对应指标；数据口径、接口、筛选和保存不变，没有新增业务状态、读取或轮询。

| 状态 | 已采集原版／候选视口 | 整页 |
| --- | --- | --- |
| 运营总览 | 1920 [原](before/screenshots/operations-1920.png)／[候选](after/screenshots/operations-1920.png) · 1440 [原](before/screenshots/operations-1440.png)／[候选](after/screenshots/operations-1440.png) · 1024 [原](before/screenshots/operations-1024.png)／[候选](after/screenshots/operations-1024.png) | 1440 [原](before/screenshots/operations-1440-full.png)／[候选](after/screenshots/operations-1440-full.png) |
| 指标对应明细 | 1440 [原](before/screenshots/operations-linked-detail-1440.png)／[候选](after/screenshots/operations-linked-detail-1440.png) | 视口／局部 |

### 年度规划

- 总览与明细矩阵采用统一玻璃外壳，减弱粗重分区框线。
- 保留真实半月定位、时间块颜色、行名与SOP，详情和编辑器沿用共享样式。

- 动效：新增：时间块悬停光影、筛选反馈与动作轻按。；已有：Inspector和表单进出、年份切换和未保存保护。

- 逻辑：半月区间、年度汇总、版本、复制、恢复及员工授权不变。

| 状态 | 已采集原版／候选视口 | 整页 |
| --- | --- | --- |
| 年度矩阵 | 1920 [原](before/screenshots/annual-1920.png)／[候选](after/screenshots/annual-1920.png) · 1440 [原](before/screenshots/annual-1440.png)／[候选](after/screenshots/annual-1440.png) · 1024 [原](before/screenshots/annual-1024.png)／[候选](after/screenshots/annual-1024.png) | 1440 [原](before/screenshots/annual-1440-full.png)／[候选](after/screenshots/annual-1440-full.png) |
| 规划详情 | 1920 [原](before/screenshots/annual-inspector-1920.png)／[候选](after/screenshots/annual-inspector-1920.png) · 1440 [原](before/screenshots/annual-inspector-1440.png)／[候选](after/screenshots/annual-inspector-1440.png) · 1024 [原](before/screenshots/annual-inspector-1024.png)／[候选](after/screenshots/annual-inspector-1024.png) | 视口／局部 |
| 规划编辑 | 1920 [原](before/screenshots/annual-editor-1920.png)／[候选](after/screenshots/annual-editor-1920.png) · 1440 [原](before/screenshots/annual-editor-1440.png)／[候选](after/screenshots/annual-editor-1440.png) · 1024 [原](before/screenshots/annual-editor-1024.png)／[候选](after/screenshots/annual-editor-1024.png) | 视口／局部 |

### 账号管理

- 账号列表与创建窗接入同一材质，角色、状态和完整操作组保持易读。

- 动效：新增：动作悬停、焦点和轻按反馈；弹窗进出使用原实现。

- 逻辑：账号身份、启停、密码和角色规则不变。

| 状态 | 已采集原版／候选视口 | 整页 |
| --- | --- | --- |
| 账号列表 | 1920 [原](before/screenshots/accounts-1920.png)／[候选](after/screenshots/accounts-1920.png) · 1440 [原](before/screenshots/accounts-1440.png)／[候选](after/screenshots/accounts-1440.png) · 1024 [原](before/screenshots/accounts-1024.png)／[候选](after/screenshots/accounts-1024.png) | 1440 [原](before/screenshots/accounts-1440-full.png)／[候选](after/screenshots/accounts-1440-full.png) |
| 新增账号 | 1920 [原](before/screenshots/account-create-1920.png)／[候选](after/screenshots/account-create-1920.png) · 1440 [原](before/screenshots/account-create-1440.png)／[候选](after/screenshots/account-create-1440.png) · 1024 [原](before/screenshots/account-create-1024.png)／[候选](after/screenshots/account-create-1024.png) | 视口／局部 |

### 操作授权

- 把分组授权组织在一块完整面板内，组标题、操作和选择框形成清楚的阅读关系。

- 动效：新增：行悬停与控件焦点／按下反馈。

- 逻辑：权限值、只读设置、未保存保护和保存方式不变。

| 状态 | 已采集原版／候选视口 | 整页 |
| --- | --- | --- |
| 授权表单 | 1920 [原](before/screenshots/permissions-1920.png)／[候选](after/screenshots/permissions-1920.png) · 1440 [原](before/screenshots/permissions-1440.png)／[候选](after/screenshots/permissions-1440.png) · 1024 [原](before/screenshots/permissions-1024.png)／[候选](after/screenshots/permissions-1024.png) | 1440 [原](before/screenshots/permissions-1440-full.png)／[候选](after/screenshots/permissions-1440-full.png) |

### 使用说明

- 说明正文使用统一阅读面板，继续保留目录定位、业务示例和全部规则。

- 动效：目录和锚点沿用原行为；新增统一悬停、焦点反馈。

- 逻辑：没有重写员工或管理员的业务规则。

| 状态 | 已采集原版／候选视口 | 整页 |
| --- | --- | --- |
| 完整说明 | 1920 [原](before/screenshots/guide-1920.png)／[候选](after/screenshots/guide-1920.png) · 1440 [原](before/screenshots/guide-1440.png)／[候选](after/screenshots/guide-1440.png) · 1024 [原](before/screenshots/guide-1024.png)／[候选](after/screenshots/guide-1024.png) | 1440 [原](before/screenshots/guide-1440-full.png)／[候选](after/screenshots/guide-1440-full.png) |

### 总枢纽首页

- 保留九图封面构图；登录、轮播控件和后两区接入相同光影语言。
- 工作流与系统入口分别成组，去掉重复的英文眉题。

- 动效：新增：系统入口、登录入口的轻微方向性触压。；九图展开、连续循环、四角下凹、暂停和减少动态效果均沿用原实现。

- 逻辑：首页内容、入口和登录跳转不变。

| 状态 | 已采集原版／候选视口 | 整页 |
| --- | --- | --- |
| 首屏 | 1920 [原](before/screenshots/home-1920.png)／[候选](after/screenshots/home-1920.png) · 1440 [原](before/screenshots/home-1440.png)／[候选](after/screenshots/home-1440.png) · 1024 [原](before/screenshots/home-1024.png)／[候选](after/screenshots/home-1024.png) | 1440 [原](before/screenshots/home-1440-full.png)／[候选](after/screenshots/home-1440-full.png) |
| 工作流 | 1440 [原](before/screenshots/home-workflow-1440.png)／[候选](after/screenshots/home-workflow-1440.png) | 视口／局部 |
| 系统入口 | 1440 [原](before/screenshots/home-systems-1440.png)／[候选](after/screenshots/home-systems-1440.png) | 视口／局部 |

### 登录页

- 改为与工作台一致的磨砂卡片、浅色顶栏和品牌蓝主动作，接入MiSans。
- 删除重复英文眉题，保留必要的登录与账号帮助。

- 动效：新增：主动作轻倾触压、光影和回正；保留键盘、禁用与错误反馈。

- 逻辑：认证、登录限制、返回目标、错误代码及账号权限不变。

| 状态 | 已采集原版／候选视口 | 整页 |
| --- | --- | --- |
| 账号登录 | 1920 [原](before/screenshots/login-1920.png)／[候选](after/screenshots/login-1920.png) · 1440 [原](before/screenshots/login-1440.png)／[候选](after/screenshots/login-1440.png) · 1024 [原](before/screenshots/login-1024.png)／[候选](after/screenshots/login-1024.png) | 视口／局部 |

### 工作台助手

- 沿用助手外壳，统一面板材质和入口光影。

- 动效：新增：侧栏助手入口方向性触压；Sheet进出沿用公共控制器。

- 逻辑：查询和原详情能力不变，未增加助手业务能力。

| 状态 | 已采集原版／候选视口 | 整页 |
| --- | --- | --- |
| 查帖助手 | 1920 [原](before/screenshots/assistant-1920.png)／[候选](after/screenshots/assistant-1920.png) · 1440 [原](before/screenshots/assistant-1440.png)／[候选](after/screenshots/assistant-1440.png) · 1024 [原](before/screenshots/assistant-1024.png)／[候选](after/screenshots/assistant-1024.png) | 视口／局部 |

## 动效定位

| 位置 | 触发和效果 | 来源 |
| --- | --- | --- |
| 新做帖、历史月份、查看执行明细、项目资料／帖子链接、助手及独立首页入口 | 悬停亮边和柔和阴影；按落点约±1.2°、1px、0.986；90ms压下、380ms阻尼回正 | 本轮统一显式接入 |
| 来源明细、元信息 | 点击／键盘220ms展开和收起，可中断反向 | 已认可候选继承 |
| Inspector、Sheet、公共确认框 | 同时长进入／退出，切帖连续、关闭焦点返回，未保存公共确认 | 原公共控制器，统一材质 |
| 月会／周会趋势、占比、生命周期 | 进入可见范围后展示；同范围保存不重播，明确切换展示范围后再播放 | 继承既有数据动效并统一表现 |
| 排期筛选、计划选择、关联 | 当前项底色／下划线、卡片边框与焦点强调 | 本轮适配；拖放坐标稳定 |
| 保存、审批、日期格、拖拽来源及密集数据卡 | 常规悬停／按下／禁用／失败反馈，保持稳定 | 沿用业务行为，无3D |

[触压局部实录](after/video/press-detail.webm)为原浏览器视频裁剪放大，保留[全屏原录像](after/video/directional-press.webm)，不生成假操作。

## 颜色与限制

- 箭头表达增减，比较色表达好坏：总消耗及普通数量中性；有效人数／点击率等改善红、变差绿；单位成本、延期率、确认空跑降低红、增加绿。发布状态、警告和错误的业务色独立保留。
- 本轮使用Chromium及实际MiSans字形验收，未声称完成所有浏览器或Windows原生日期控件外观验收。冻结网页／PDF仍遵从其原材料语义，运行样本中的实时月度运营与已冻结月会数量可以不同。
- 业务范围和宽度按表中实际记录；3D刻意保持轻微，只读指标和密集操作区不制造触压入口。保留用户进一步反馈。

对比器已实际检查全部14组状态、7段视频可解码和Range播放、三档切换及原版／候选的月会和排期可操作入口；Windows端HTTP和原PNG均返回200。[检查](checks/gallery.json)。

本批次原图407张，含真实页面局部裁剪；操作录像7段。脚本以.txt形式保存在[复验入口](checks/repro/)以免被Astro重复编译，调试原产物留在.tools/test-artifacts。


## 本地重新启动

当前对比器为http://127.0.0.1:34916，四个隔离应用运行地址由.tools中的workspace-preview-before／after及schedule-preview-before／after.json记录。预览若退出，使用对应工作树的.tools/run.sh，分别设置GLASS_PHASE=before或after、GLASS_KEEP=1，运行.tools/workspace-glass.browser.ts及.tools/workspace-schedule.browser.ts；只重建虚构隔离样本，不改正式库。最后设置GALLERY_EVIDENCE=verified/2026-11-07_00-15_workspace-glass-all运行.tools/workspace-gallery.mjs。原版使用workspace-glass-all-baseline-20261106工作树。
