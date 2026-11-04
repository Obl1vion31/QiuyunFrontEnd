# 月计划快捷操作与后台返回编辑

已自检并发布，[正式域名核对通过](release/README.md)。沿用常驻内容池、108px空Week及原字体。无迁移；合成业务仅在隔离数据库测试。

- Week卡片右上角×打开公共菜单，逐篇移回待分配或删除计划名额；删除不删除原帖。已提交／已定稿的数量保护沿用原规则。
- 同周同来源未关联名额合并为×N，ID仍独立；已有独立执行记录不混在一起。编辑、只读与PDF使用相同合并规则。
- 右池未分完可“暂时确认安排”，保存草稿后刷新仍可继续分配；会后定稿仍须完成全部Week安排。
- 后台挂起的协作读取／续期会被清理，前台恢复去重后重新核实；旧业务保存回执只处理当次token，不会释放返回后新取得的编辑权。真实他人接管仍需确认。

## 实际覆盖

| 场景 | 证据 |
| --- | --- |
| 五档同来源合并 | [1920](screenshots/plan-merged-1920.png) · [1440](screenshots/plan-merged-1440.png) · [1024](screenshots/plan-merged-1024.png) · [390](screenshots/plan-merged-390.png) · [320](screenshots/plan-merged-320.png) |
| ×菜单与手机点击范围 | [桌面](screenshots/plan-shortcut-menu-1440.png) · [手机](screenshots/plan-shortcut-menu-320.png) |
| 未分完暂时确认 | [保存后](screenshots/plan-partial-confirmed-1440.png) · [失败保留](screenshots/plan-confirm-failure-1440.png) |
| 月历后台返回首次保存 | [保存后仍保留表单](screenshots/background-calendar-return-saved-1440.png) |
| 双角色与真实接管 | [管理员](screenshots/background-admin-resumed-1440.png) · [员工](screenshots/background-employee-resumed-390.png) · [真实接管](screenshots/background-real-takeover-confirm-1440.png) |
| 操作录像 | [月计划](video/plan-desktop.mp4) · [触屏](video/plan-phone.mp4) · [管理员后台返回](video/background-1.mp4) · [员工](video/background-2.mp4) |
| 实际PDF渲染 | [月会PDF](release/runtime-monthly.pdf) · [计划页](review/monthly-pdf-5.png) |

35张稳定截图、4段录像0.5秒连续取样103帧及月会5页PDF渲染均已打开审查。PDF合并样本为隔离快照，不改写生产历史。周会PDF仅核对最终运行包依赖，不声称重新完成整份视觉验收。

[完整月计划流程](validation/workflow.json)覆盖拖放逐篇、移回／删除、数量更正、暂存与刷新、失败重试、重排、追加、审核、48小时及原计划锁定。[后台专项](validation/background.json)及[完整协作回归](validation/regression.json)通过。旧版迟到业务回执实际释放新权限的失败保留在[复现日志](validation/background-before.log)。261项规则、db:check、类型检查、Node／Vercel构建与最终运行包检查通过。

后台专项使用headed Chromium窗口失焦／恢复，并验证真实document.hasFocus变化；客户端与隔离真实PostgreSQL统一推进61秒。Playwright环境未产生真实document.hidden，visibility／pagehide／pageshow属于处理器测试，不声称覆盖所有操作系统后台调度或真实BFCache。月历表单返回后首次请求及落库均验证。

复现：设置本机TEST_POSTGRES_URL后，COLLABORATION_HEADED=1 xvfb-run -a pnpm test:collaboration-continuity；pnpm test:monthly-workflow:browser、pnpm test:monthly-workflow、pnpm test:collaboration-lookup。源文件哈希在[覆盖记录](validation/source.json)，中间失败图只在.tools保留。
