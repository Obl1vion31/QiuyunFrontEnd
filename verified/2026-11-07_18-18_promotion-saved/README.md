# 每日复盘保存后保留原行

应用 `219dd80`，分支 `codex/promotion-saved-workspace`。状态：已自检，待发布核对。所有样张来自实际Vercel运行包及本机隔离PostgreSQL；固定10月7日查看10月6日复盘，账号、帖子与指标均为虚构样本。

## 直接对照

- [保存前后三行原像素对照](screenshots/before-after-original-rows.png)：上为保存前，下为保存后。裁切真实截图，不改DOM或文字；列位置、行高、原状态按钮、五项输入和次日下拉保持，仅原操作位变成“已保存／继续编辑”。金额保存后沿既有格式显示两位小数。
- [保存前完整1920px](screenshots/before-save-1920.png)、[单行保存后完整1920px](screenshots/after-single-save-1920.png)、[0项待填仍显示三行](screenshots/admin-saved-1920.png)。
- [原控件继续编辑](screenshots/editing-original-controls-1440.png)、[次日更正原因气泡](screenshots/next-reason-popover-1440.png)、[更正后原位回显](screenshots/corrected-day-and-next-1440.png)。原因不占表格一行，当日状态仍使用原有气泡。
- [写入失败保留输入](screenshots/save-failure-1440.png)、[真实旧版本冲突保留输入](screenshots/stale-input-kept-1440.png)。
- [真实操作录像](media/interaction.mp4)、[冷进入／刷新／站内导航录像](media/first-paint.mp4)。同目录保留原始WebM；录像含脚本停留和视口切换产生的录制留边，不用于性能计时。

## 实际视觉覆盖

| 状态 | 1920px | 1440px | 1024px |
|---|---|---|---|
| 管理员已保存 | [查看](screenshots/admin-saved-1920.png) | [查看](screenshots/admin-saved-1440.png) | [查看](screenshots/admin-saved-1024.png) |
| 管理员继续编辑 | [查看](screenshots/admin-editing-1920.png) | [查看](screenshots/admin-editing-1440.png) | [查看](screenshots/admin-editing-1024.png) |
| 员工已保存 | [查看](screenshots/employee-saved-1920.png) | [查看](screenshots/employee-saved-1440.png) | [查看](screenshots/employee-saved-1024.png) |
| 员工继续编辑 | [查看](screenshots/employee-editing-1920.png) | [查看](screenshots/employee-editing-1440.png) | [查看](screenshots/employee-editing-1024.png) |

以上逐项已自检，待用户反馈。窄桌面沿用原表格内部横滚，未压缩输入或改变原行结构；编辑截图已滚到实际操作处。[390px有限检查](screenshots/mobile-obvious-390.png)只检查明显溢出和遮挡，不表示完整手机填写验收。

1920px首屏从首次绘制开始录制，注入650ms导航／字体延迟：[冷进入](screenshots/first-paint-cold-1920.png)、[硬刷新](screenshots/first-paint-refresh-1920.png)、[站内往返](screenshots/first-paint-navigation-1920.png)。最终图另待字体与有限动画稳定。24张最终截图、上述原像素对照、操作151帧及首屏84帧已实际查看；原始逐帧材料在私有`.tools/promotion-saved/release-final/`。

## 功能与发布验证

- 单条／批量保存后保留昨日事实，已存行不进入一键保存；0待填不隐藏，刷新保留。今天更正或补录的较早事实也保留，跨午夜更早记录进入历史。
- 继续编辑更正当日状态、今日的次日安排；误选结束可恢复。保留历史权限、T+1和例会安排入口；确认前不写入，前后状态不兼容时明确拒绝，不删除后续事实或指标。已有次日五项指标、真实零值及重新测试边界验证通过。
- 503写入失败、取消未保存确认、其他帖草稿、真实旧指纹409均保留输入；成功写入但读取失败只GET重读。跨午夜排序保留正在填写的原节点及焦点。
- 原有工作台回归通过：状态气泡、首次ID、暂停／待定默认零、残留补录及重复拒绝、并发幂等、历史单日更正、公共界面与MiSans实际字形。补录入口恢复传递保存版本，不改布局。

[本次工作区检查](checks/saved-workspace.json)、[原有复盘工作台](checks/original-workbench.json)、[历史单日更正](checks/historical-day.json)、[字体](checks/fonts.json)、[汇总](checks/summary.json)。类型检查0错误、296规则测试、schema、构建及上述实际运行包回归通过；公共界面几何检查不替代本页视觉审查。

[运行包依赖与信任域检查](checks/runtime.json)、[实际生成的中文PDF](pdf/runtime-monthly.pdf)及其[第1页](pdf/page-1.png)／[第2页](pdf/page-2.png)／[第3页](pdf/page-3.png)／[第4页](pdf/page-4.png)已查看。PDF是部署烟测，会议模板本轮未改变。正式数据库未写入测试数据，无物理迁移。

本轮早期另做只读行、状态下拉和行内原因的样式已撤回；这些中间稿保留在私有调试目录，不作为最终验收。当前按用户确认的原行继承验收，并以同一行保存前后的实际几何和图像为依据。
