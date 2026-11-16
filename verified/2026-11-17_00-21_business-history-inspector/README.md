# 推广日详情与共享业务历史

已自检，待正式站点核对与用户反馈。所有归档截图来自正式组件、Vercel运行包和本机隔离PostgreSQL；为隔离验收样本，不代替真实业务数据。

推广单日详情沿用338／380px窄Inspector，资料并排、日期状态编辑同排、六项投放事实两行、实际人数与对应成本成对；解释放在字段旁信息图标。11/15仍是API试样日，未保存官方来源及其他日期保留手填语义。移除重复当日状态／首次开始日期更正，笔记ID维护收进元信息并保留保存后展开。

排期和查帖共用一条业务时间线，可筛选排期、发布、内容与复盘；一次跨周改期合并显示日期和内容前后值，来源依据折叠。已完成延期说明、发布登记、旧预约和复盘配置进入历史，待办仍在前面；推广阶段及指标业务历史沿用原结构。

| 视图与状态 | 已检查范围 | 关键截图 |
| --- | --- | --- |
| 推广日API详情 | 1920／1440／1024，338／380窄宽、对齐与来源 | [完整1920](day-inspector-1920.png) · [1440局部](day-panel-1440.png) · [1024](day-inspector-1024.png) |
| 字段解释与手填来源 | 公式悬停、未接来源、非试样日期 | [公式](day-ctr-help-1024.png) · [未接来源](day-pilot-unsourced-1440.png) · [手填日期](day-manual-1024.png) |
| 排期时间线 | 管理员1920／1440／1024，员工1440；默认折叠、筛选、分页、键盘 | [1920](admin-schedule-timeline-1920.png) · [1440](admin-schedule-timeline-1440.png) · [1024](admin-schedule-timeline-1024.png) · [员工](employee-schedule-timeline-1440.png) |
| 发布、复盘与延期说明 | 原表单真实保存、前后文、草稿取消保留、保存刷新筛选保持 | [发布](publication-timeline-1440.png) · [复盘日期](review-settings-timeline-1440.png) · [延期说明](delay-reason-timeline-1440.png) |
| 查帖 | 同对象、同源事件与公共筛选样式 | [查帖时间线](lookup-timeline-1440.png) |
| 读取反馈 | 慢读、失败重试、空历史；关闭切帖旧响应清理 | [慢读](history-loading-1440.png) · [失败](history-failure-1440.png) · [空历史](history-empty-1440.png) |
| 共享资料与ID更正 | 非推广资料、ID双角色保存及原编辑保护 | [非推广](nonpromotion-resources-1440.png) · [ID保存回显](note-id-saved-1440.png) |
| 手机有限检查 | 390px仅遮挡、关闭入口及页面级溢出 | [390](schedule-obvious-mobile-390.png) |

[约2秒真实键盘展开与筛选过程](timeline-operation.mp4)已抽帧查看；背景、面板头尾和已存在事件节点保持。

验证：14项历史纯规则通过；共享时间线、聚光日度、笔记ID和18项Inspector覆盖层专项通过。目标构建0错误／0警告、61项既有hint；Impeccable布局检测无发现。完整原始日志留在工作树.tools/test-artifacts。

主要入口：BusinessPromotionDetails／BusinessPromotionMetric／BusinessFieldHelp、schedule-business-history读取与呈现、operations-workflow／post-lookup。无schema迁移；原始审计、冻结材料与人工推广策略保留。
