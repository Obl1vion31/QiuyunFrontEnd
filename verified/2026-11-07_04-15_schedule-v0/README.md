# 排期定稿与V0执行复盘验收

状态：已自检／待用户反馈；已发布并核对正式版本。

正式部署 `dpl_6XMXYXXY4kDjvZxs1aCCdsrvxbM3` 为READY，正式域名与候选指向同一部署；20项门禁／接口检查、73个公开资源哈希一致，见[正式核对](checks/production.json)。业务交互验证使用隔离运行包。

实现 `6c9d6c9`，基于最新正式规范 `79fe541`；分支 `codex/schedule-v0-execution`。继承公共磨砂材质、指标锚点、资料层级及控件反馈。

A：隔离25篇V0、4篇新增、1篇取消，当前应发28篇，含长名称、精确时间及实发补登记；不同截止日的到期未登记数可不同。B：隔离21篇预排期，Week分布3／6／6／5／1，由1篇实际安排增加至3篇并定稿。均使用正式组件及本机临时PostgreSQL库，不向正式库写入测试数据。

定稿前待核对仍可增改；同原Week免理由、跨原Week必填。管理员一步定稿，之后普通调整带理由直接生效，取消仅管理员；正常实发及资料链接沿原入口。已封存快照与已归档PDF不补造历史。

## 验证

| 检查 | 结果 |
|---|---|
| 类型与最终Vercel构建 | 0错误、0警告；构建提示见日志 |
| 规则、schema、公共UI及Node构建 | 282规则通过；schema与公共UI通过；功能阶段Node构建通过 |
| 最终运行包V0专项 | 4组通过，含真实原因表单、未保存保护与取消只读证据 |
| 工作区兼容 | 13组通过；捕获于2f887a3，之后仅修必填标签和删除无用变量 |
| 最终接口／原入口 | 6组接口、5组浏览器通过；后续仅必填标签结构修正 |
| 实际审图 | 70稳定图、4段录像抽样461帧、4份21页PDF；桌面1920／1440／1024 |
| 手机390 | 仅明显遮挡、页面级溢出和Inspector关闭入口；不宣称完整手机布局验收 |

源码检测新增组件无发现；整页扫描的9条既有日期／状态侧线建议沿用已确认设计，不扩大修改。日志及部署核对见 [checks](checks/release.json)。

## 关键页面

- [定稿后日历](execution/screenshots/sealed-calendar-1440.png) · [月度折叠条](execution/screenshots/monthly-collapsed-1440.png) · [周会展开](execution/screenshots/weekly-expanded-1440.png) · [定稿后原因](execution/screenshots/v0-reason-edit-1440.png)

## 逐图索引

| 图片 | 视图／状态 | 视口 | 数据／角色 | 状态 |
|---|---|---:|---|---|
| [first-paint-direct-1440](execution/screenshots/first-paint-direct-1440.png) | 排期／直接进入稳定帧 | 1440px | A／管理员 | 已自检／待反馈 |
| [first-paint-navigation-1440](execution/screenshots/first-paint-navigation-1440.png) | 排期／站内导航稳定帧 | 1440px | A／管理员 | 已自检／待反馈 |
| [first-paint-reload-1440](execution/screenshots/first-paint-reload-1440.png) | 排期／硬刷新稳定帧 | 1440px | A／管理员 | 已自检／待反馈 |
| [inspector-mobile-390](execution/screenshots/inspector-mobile-390.png) | 排期／Inspector关闭入口 | 390px | A／管理员 | 已自检／待反馈 |
| [monthly-collapsed-1024](execution/screenshots/monthly-collapsed-1024.png) | 月度运营／全月对照收起 | 1024px | A／管理员 | 已自检／待反馈 |
| [monthly-collapsed-1440](execution/screenshots/monthly-collapsed-1440.png) | 月度运营／全月对照收起 | 1440px | A／管理员 | 已自检／待反馈 |
| [monthly-collapsed-1920](execution/screenshots/monthly-collapsed-1920.png) | 月度运营／全月对照收起 | 1920px | A／管理员 | 已自检／待反馈 |
| [monthly-expanded-1024](execution/screenshots/monthly-expanded-1024.png) | 月度运营／全月对照展开 | 1024px | A／管理员 | 已自检／待反馈 |
| [monthly-expanded-1440](execution/screenshots/monthly-expanded-1440.png) | 月度运营／全月对照展开 | 1440px | A／管理员 | 已自检／待反馈 |
| [monthly-expanded-1920](execution/screenshots/monthly-expanded-1920.png) | 月度运营／全月对照展开 | 1920px | A／管理员 | 已自检／待反馈 |
| [monthly-meeting-collapsed-1024](execution/screenshots/monthly-meeting-collapsed-1024.png) | 月会／月会上月对照收起 | 1024px | A／管理员 | 已自检／待反馈 |
| [monthly-meeting-collapsed-1440](execution/screenshots/monthly-meeting-collapsed-1440.png) | 月会／月会上月对照收起 | 1440px | A／管理员 | 已自检／待反馈 |
| [monthly-meeting-collapsed-1920](execution/screenshots/monthly-meeting-collapsed-1920.png) | 月会／月会上月对照收起 | 1920px | A／管理员 | 已自检／待反馈 |
| [monthly-meeting-expanded-1024](execution/screenshots/monthly-meeting-expanded-1024.png) | 月会／月会上月对照展开 | 1024px | A／管理员 | 已自检／待反馈 |
| [monthly-meeting-expanded-1440](execution/screenshots/monthly-meeting-expanded-1440.png) | 月会／月会上月对照展开 | 1440px | A／管理员 | 已自检／待反馈 |
| [monthly-meeting-expanded-1920](execution/screenshots/monthly-meeting-expanded-1920.png) | 月会／月会上月对照展开 | 1920px | A／管理员 | 已自检／待反馈 |
| [monthly-mobile-expanded-390](execution/screenshots/monthly-mobile-expanded-390.png) | 月度运营／月度明细有限手机检查 | 390px | A／管理员 | 已自检／待反馈 |
| [seal-conflict-1440](execution/screenshots/seal-conflict-1440.png) | 排期／定稿冲突与就地重新核对 | 1440px | A／管理员 | 已自检／待反馈 |
| [sealed-calendar-1024](execution/screenshots/sealed-calendar-1024.png) | 排期／V0定稿后的月历 | 1024px | A／管理员 | 已自检／待反馈 |
| [sealed-calendar-1440](execution/screenshots/sealed-calendar-1440.png) | 排期／V0定稿后的月历 | 1440px | A／管理员 | 已自检／待反馈 |
| [sealed-calendar-1920](execution/screenshots/sealed-calendar-1920.png) | 排期／V0定稿后的月历 | 1920px | A／管理员 | 已自检／待反馈 |
| [sealed-checklist-1024](execution/screenshots/sealed-checklist-1024.png) | 排期／V0清单展开 | 1024px | A／管理员 | 已自检／待反馈 |
| [sealed-checklist-1440](execution/screenshots/sealed-checklist-1440.png) | 排期／V0清单展开 | 1440px | A／管理员 | 已自检／待反馈 |
| [sealed-checklist-1920](execution/screenshots/sealed-checklist-1920.png) | 排期／V0清单展开 | 1920px | A／管理员 | 已自检／待反馈 |
| [sealed-mobile-390](execution/screenshots/sealed-mobile-390.png) | 排期／定稿月历有限手机检查 | 390px | A／管理员 | 已自检／待反馈 |
| [v0-reason-edit-1440](execution/screenshots/v0-reason-edit-1440.png) | 排期／V0后原因填写与未保存保护 | 1440px | A／员工 | 已自检／待反馈 |
| [weekly-collapsed-1024](execution/screenshots/weekly-collapsed-1024.png) | 周会／周会区间对照收起 | 1024px | A／管理员 | 已自检／待反馈 |
| [weekly-collapsed-1440](execution/screenshots/weekly-collapsed-1440.png) | 周会／周会区间对照收起 | 1440px | A／管理员 | 已自检／待反馈 |
| [weekly-collapsed-1920](execution/screenshots/weekly-collapsed-1920.png) | 周会／周会区间对照收起 | 1920px | A／管理员 | 已自检／待反馈 |
| [weekly-expanded-1024](execution/screenshots/weekly-expanded-1024.png) | 周会／周会区间对照展开 | 1024px | A／管理员 | 已自检／待反馈 |
| [weekly-expanded-1440](execution/screenshots/weekly-expanded-1440.png) | 周会／周会区间对照展开 | 1440px | A／管理员 | 已自检／待反馈 |
| [weekly-expanded-1920](execution/screenshots/weekly-expanded-1920.png) | 周会／周会区间对照展开 | 1920px | A／管理员 | 已自检／待反馈 |
| [carry-original-form-1440](workspace/screenshots/carry-original-form-1440.png) | 排期／遗留原帖表单 | 1440px | B／员工 | 已自检／待反馈 |
| [checklist-updated-1440](workspace/screenshots/checklist-updated-1440.png) | 排期／冲突后清单同步 | 1440px | B／员工 | 已自检／待反馈 |
| [closed-1440](workspace/screenshots/closed-1440.png) | 排期／未确认预排期月份 | 1440px | B／员工 | 已自检／待反馈 |
| [compact-weeks-1024](workspace/screenshots/compact-weeks-1024.png) | 排期／五条紧凑Week局部 | 1024px | B／员工 | 已自检／待反馈 |
| [compact-weeks-1440](workspace/screenshots/compact-weeks-1440.png) | 排期／五条紧凑Week局部 | 1440px | B／员工 | 已自检／待反馈 |
| [compact-weeks-1920](workspace/screenshots/compact-weeks-1920.png) | 排期／五条紧凑Week局部 | 1920px | B／员工 | 已自检／待反馈 |
| [default-course-1440](workspace/screenshots/default-course-1440.png) | 排期／课程默认与人工覆盖 | 1440px | B／员工 | 已自检／待反馈 |
| [default-handout-1440](workspace/screenshots/default-handout-1440.png) | 排期／推广讲义默认 | 1440px | B／员工 | 已自检／待反馈 |
| [default-mock-1440](workspace/screenshots/default-mock-1440.png) | 排期／模考默认 | 1440px | B／员工 | 已自检／待反馈 |
| [draft-admin-saved-1440](workspace/screenshots/draft-admin-saved-1440.png) | 排期／管理员草稿保存 | 1440px | B／管理员 | 已自检／待反馈 |
| [draft-employee-saved-1440](workspace/screenshots/draft-employee-saved-1440.png) | 排期／员工草稿保存 | 1440px | B／员工 | 已自检／待反馈 |
| [draft-failure-1440](workspace/screenshots/draft-failure-1440.png) | 排期／草稿失败保留 | 1440px | B／员工 | 已自检／待反馈 |
| [first-paint-direct-1440](workspace/screenshots/first-paint-direct-1440.png) | 排期／直接进入稳定帧 | 1440px | B／员工 | 已自检／待反馈 |
| [first-paint-navigation-1440](workspace/screenshots/first-paint-navigation-1440.png) | 排期／站内导航稳定帧 | 1440px | B／员工 | 已自检／待反馈 |
| [first-paint-reload-1440](workspace/screenshots/first-paint-reload-1440.png) | 排期／硬刷新稳定帧 | 1440px | B／员工 | 已自检／待反馈 |
| [inspector-mobile-390](workspace/screenshots/inspector-mobile-390.png) | 排期／Inspector关闭入口 | 390px | B／员工 | 已自检／待反馈 |
| [ledger-sealed-1440](workspace/screenshots/ledger-sealed-1440.png) | 排期／定稿台账 | 1440px | B／员工 | 已自检／待反馈 |
| [meeting-original-preplan-1024](workspace/screenshots/meeting-original-preplan-1024.png) | 月会／原预排期历史版 | 1024px | B／员工 | 已自检／待反馈 |
| [meeting-preplan-1024](workspace/screenshots/meeting-preplan-1024.png) | 月会／未封存完整21篇 | 1024px | B／员工 | 已自检／待反馈 |
| [meeting-preplan-1440](workspace/screenshots/meeting-preplan-1440.png) | 月会／未封存完整21篇 | 1440px | B／员工 | 已自检／待反馈 |
| [meeting-preplan-1920](workspace/screenshots/meeting-preplan-1920.png) | 月会／未封存完整21篇 | 1920px | B／员工 | 已自检／待反馈 |
| [meeting-sealed-1024](workspace/screenshots/meeting-sealed-1024.png) | 月会／最终安排封存版 | 1024px | B／员工 | 已自检／待反馈 |
| [review-admin-1024](workspace/screenshots/review-admin-1024.png) | 排期／管理员核对 | 1024px | B／管理员 | 已自检／待反馈 |
| [review-admin-1440](workspace/screenshots/review-admin-1440.png) | 排期／管理员核对 | 1440px | B／管理员 | 已自检／待反馈 |
| [review-admin-1920](workspace/screenshots/review-admin-1920.png) | 排期／管理员核对 | 1920px | B／管理员 | 已自检／待反馈 |
| [review-employee-1440](workspace/screenshots/review-employee-1440.png) | 排期／待核对仍可编辑 | 1440px | B／员工 | 已自检／待反馈 |
| [schedule-calendar-1024](workspace/screenshots/schedule-calendar-1024.png) | 排期／首轮排期月历 | 1024px | B／员工 | 已自检／待反馈 |
| [schedule-calendar-1440](workspace/screenshots/schedule-calendar-1440.png) | 排期／首轮排期月历 | 1440px | B／员工 | 已自检／待反馈 |
| [schedule-calendar-1920](workspace/screenshots/schedule-calendar-1920.png) | 排期／首轮排期月历 | 1920px | B／员工 | 已自检／待反馈 |
| [schedule-full-1024](workspace/screenshots/schedule-full-1024.png) | 排期／首轮完整工作区 | 1024px | B／员工 | 已自检／待反馈 |
| [schedule-full-1440](workspace/screenshots/schedule-full-1440.png) | 排期／首轮完整工作区 | 1440px | B／员工 | 已自检／待反馈 |
| [schedule-full-1920](workspace/screenshots/schedule-full-1920.png) | 排期／首轮完整工作区 | 1920px | B／员工 | 已自检／待反馈 |
| [schedule-mobile-390](workspace/screenshots/schedule-mobile-390.png) | 排期／排期有限手机检查 | 390px | B／员工 | 已自检／待反馈 |
| [sealed-calendar-1024](workspace/screenshots/sealed-calendar-1024.png) | 排期／V0定稿后的月历 | 1024px | B／管理员 | 已自检／待反馈 |
| [selection-compact-1440](workspace/screenshots/selection-compact-1440.png) | 排期／来源选择与取消 | 1440px | B／员工 | 已自检／待反馈 |
| [source-form-1440](workspace/screenshots/source-form-1440.png) | 排期／计划来源新建 | 1440px | B／员工 | 已自检／待反馈 |
| [source-read-failure-1440](workspace/screenshots/source-read-failure-1440.png) | 排期／来源失败就地重试 | 1440px | B／员工 | 已自检／待反馈 |
| [submit-failure-1440](workspace/screenshots/submit-failure-1440.png) | 排期／提交失败保留 | 1440px | B／员工 | 已自检／待反馈 |

## 录像与PDF

录像自首次绘制开始；首屏按10fps抽样，操作按2fps抽样检查。测试切换视口产生的录像画布灰边不属于页面内容。

| 资料 | 内容 | 状态 |
|---|---|
| [V0操作](execution/video/workflow.webm) | 定稿冲突、一步定稿、展开／收起及跨页；97抽样帧 | 已自检 |
| [V0首屏](execution/video/first-paint.webm) | 直接进入、刷新、站内导航与650ms慢字体；104帧 | 已自检 |
| [工作区操作](workspace/video/workflow.webm) | 拖放、键盘、默认、草稿、失败重试与首轮；158帧 | 已自检 |
| [工作区首屏](workspace/video/first-paint.webm) | 未定稿完整预排期连续性；102帧 | 已自检 |
| [月会执行PDF](execution/pdf/monthly-execution.pdf) | 8页，净构成及完整变更理由 | 逐页已自检 |
| [周会执行PDF](execution/pdf/weekly-execution.pdf) | 5页，截止日冻结对照 | 逐页已自检 |
| [预排期PDF](workspace/pdf/preplanned-monthly.pdf) | 4页，完整21篇 | 逐页已自检 |
| [最终安排PDF](workspace/pdf/sealed-monthly.pdf) | 4页，实际3篇定稿 | 逐页已自检 |

逐页渲染图与44张联系图见 [review](review/README.md)。长标题及PDF分页的未通过中间稿留在 [corrections](review/corrections/README.md)，不作最终证据。旧批记录保留，不能用旧“待核对禁改／常驻刷新”结论评价本轮规则。

## 后续补正

此批未覆盖“未关联的早期排期抢用后续明确遗留名额”及旧重复名额的兼容读取，不能将其新快照计数通过结论扩用于该入口。原证据保留；[修复与补充验收](../2026-11-07_14-27_schedule-history/README.md)已补足。
