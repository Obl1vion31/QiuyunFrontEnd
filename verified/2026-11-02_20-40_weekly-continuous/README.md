# 最终日期与每7天持续复盘

已自检，待实际使用反馈。隔离数据演示；未向正式业务库写入示例。

- [建帖填写最终日期](screenshots/create-1440.png) · [自动节点列表](screenshots/plan-1440.png) · [手机节点](screenshots/plan-320.png)
- [到期待办与后续日期](screenshots/pending-1440.png) · [手机录入入口](screenshots/pending-320.png)
- [操作录像](video/operations.webm) · [连续帧查看索引](inspection/manifest.json)

1920／1440／1024／390／320px分别检查新建条件字段、排期自动节点列表、待复盘及未来组，共15图；320px另查管理员说明。16张最终图与录像全部301帧已实际查看；本批未另行验证慢字体首屏。手机输入、底部操作和节点列表可读。

[完整周期验证](result.json)覆盖真实接口与表单保存、日期协调、冻结结果、审批、实发切换和口径更正；[真实PostgreSQL迁移](postgres.json)核对0046→0047全部56张表旧事实与冻结JSON保持。251项规则测试通过，必要类型检查／构建和发布核对记录随后补充。

原内容职能综合流程及共享UI回归通过；[实际MiSans字体](fonts.json)已核对。独立旧Inspector广泛回归进程被本机WSL中断，未计通过；本次真实节点指标保存与界面已由完整周期测试覆盖。
