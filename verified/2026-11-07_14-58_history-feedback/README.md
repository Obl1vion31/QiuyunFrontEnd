# 历史加载反馈与执行记录密度

应用 `4ed8e4a`，分支 `codex/schedule-history-density`。状态：已自检，待用户反馈。沿用磨砂材质、680px单层Inspector和三组非空历史；分组按实际事件出现，初始内容与设置也属于设置组。

执行主行就近排列事件、时间和操作人，真实原因另行保留；系统初建兜底“首轮排期填写”仅在展示层省略。相同1440px样本的建立记录由102.38px降为40.09px，正文仍14px MiSans。日期组收紧间距，内容明细保留。历史标题立即显示，500ms后才出现就地加载状态；确实无记录和读取失败分别反馈。

## 直接查看

- [原像素前后局部](screenshots/density-before-after.png)、[修改前完整1440px](screenshots/before-admin-create-content-1440.png)、[修改后完整1440px](screenshots/admin-create-content-1440.png)。对比图是实际截图裁切，不改DOM或文字。
- [加载反馈](screenshots/loading-history-1440.png)、[确实无历史](screenshots/empty-history-1440.png)、[失败与重试](screenshots/history-failure-1440.png)。
- [执行与日期及设置三组](screenshots/admin-week-date-content-1440.png)、[共享查帖入口](screenshots/lookup-execution-1440.png)。
- [真实操作录像](media/interaction-1440.mp4)、[首屏及刷新／导航录像](media/first-paint-1440.mp4)。同目录保留原始WebM；操作录像包含视口切换和脚本停留，不用于性能计时。

## 实际覆盖

数据来源：独立本机PostgreSQL，经真实月会确认预排期、首次建帖、跨Week及内容更新接口生成。包含初建非推广讲义、无业务历史的旧记录，以及有真实原因的跨Week修改。`test_admin`和`test_employee`为虚构账号。仅在正式库只读核对过非推广讲义的分组原因，所有验证写入均在隔离库。

| 视图／状态 | 1920px | 1440px | 1024px | 结果 |
|---|---|---|---|---|
| 管理员初建及设置 | [查看](screenshots/admin-create-content-1920.png) | [查看](screenshots/admin-create-content-1440.png) | [查看](screenshots/admin-create-content-1024.png) | 已自检 |
| 员工初建及设置 | [查看](screenshots/employee-create-content-1920.png) | [查看](screenshots/employee-create-content-1440.png) | [查看](screenshots/employee-create-content-1024.png) | 已自检 |
| 管理员Week、日期、内容变更 | [查看](screenshots/admin-week-date-content-1920.png) | [查看](screenshots/admin-week-date-content-1440.png) | [查看](screenshots/admin-week-date-content-1024.png) | 已自检 |
| 员工Week、日期、内容变更 | [查看](screenshots/employee-week-date-content-1920.png) | [查看](screenshots/employee-week-date-content-1440.png) | [查看](screenshots/employee-week-date-content-1024.png) | 已自检 |
| 慢历史／空／503重试 | — | 上方三张状态图 | — | 实际读取、失败只重读、旧响应取消已检查 |
| 查帖 | — | 上方查帖图 | — | 共用正式分组和紧凑渲染 |
| 首屏 | — | [冷缓存慢字体及数据](screenshots/first-paint-slow-1440.png)／[硬刷新](screenshots/first-paint-hard-refresh-1440.png)／[暖刷新](screenshots/first-paint-warm-refresh-1440.png)／[站内导航](screenshots/first-paint-internal-navigation-1440.png) | — | 从首次绘制录制，完成态另查 |

[390px有限触屏检查](screenshots/mobile-obvious-check-390.png)：只核对明显溢出和关闭入口；不作为手机填写布局的完整验收。既有加载专项另覆盖1280／390／320px，未借用为上述桌面视图的视觉结论。

21张最终截图及前后对照已逐张检查；两段录像分别按3fps／10fps审查150／124帧。键盘折叠、未保存取消保留、减少动态效果、关闭后切帖、失败后重试通过。[功能与密度记录](checks/history-feedback.json)、[加载回归](checks/loading.json)、[单层面板保存与失败回归](checks/panel.json)、[汇总](checks/summary.json)。

类型检查0错误，291规则测试、schema检查、Node及Vercel构建、共享读取、公共界面与以上专项通过。最终运行包依赖、信任域及中文PDF生成通过；PDF为部署烟测，未改变会议模板。[运行包记录](checks/runtime.json)。原始日志与逐帧材料在私有`.tools/history-density/`。

## 验收补正

上一批主要检查历史就绪后的语义分组，未充分验收“读取中被误认为无记录”和初建执行记录的三行占高。本批补正这两项，保留原批次截图及记录。

## 正式核对

发布与正式域名核对结果完成后补入本节。
