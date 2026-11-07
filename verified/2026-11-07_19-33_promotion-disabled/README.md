# 每日已保存字段统一禁用样式

应用`f523e88`，分支`codex/promotion-disabled-fields`。状态：已自检，待发布；待用户反馈。

保存后的五项指标与次日安排使用公共浅灰底、灰字及虚线边框，真实禁用且无法聚焦，次日下拉隐藏箭头。“继续编辑”恢复白底实线及原生箭头；保存或明确取消后恢复锁定。原行高、控件尺寸、列锚点及MiSans字体保持，右侧主操作保持蓝色。首次推广、筛选及表单Sheet共用颜色变量。

## 直接查看

- [原样张与修改后对照](screenshots/before-after-disabled.png)、[锁定局部](screenshots/daily-locked-detail-1920.png)、[完整页](screenshots/refresh-locked-1920.png)。仅裁切真实浏览器截图，数据使用同一组隔离样本。
- [键盘继续编辑](screenshots/keyboard-editing-1920.png)、[取消后锁定](screenshots/cancel-restored-1920.png)、[保存后回显](screenshots/saved-again-1920.png)。
- [现有公共分类禁用样式](screenshots/shared-disabled-category-1920.png)、[Inspector只读字段](screenshots/shared-readonly-inspector-1920.png)、[首次推广与真实零对照](screenshots/shared-daily-left-1920.png)。
- [实际操作录像](video/disabled-editing.mp4)：从进入页面开始，含慢字体、刷新、继续编辑、取消保护、保存、站内导航及横滚；全片按4fps抽取151帧实际审查。视口切换时的画幅留边来自录制器。

## 实际覆盖

| 视图／状态 | 视口 | 证据及状态 |
| --- | --- | --- |
| 管理员锁定／编辑 | 1920／1440／1024 | `admin-locked-*`／`admin-editing-*`；已自检，待用户反馈 |
| 员工锁定／编辑，同一对象 | 1920／1440／1024 | `employee-locked-*`／`employee-editing-*`；已自检，待用户反馈 |
| 局部横滚右端，锁定／编辑 | 两角色1440／1024 | `*-locked-right-*`／`*-editing-right-*`；已自检 |
| 刷新、取消、保存、站内往返 | 1920 | 对应`refresh`／`cancel`／`saved-again`／`navigation`；已自检 |
| 公共只读Inspector | 1920／1440／1024 | `shared-readonly-inspector-*`；已自检 |
| 首次推广、已选截止、保存中及失败 | 1920／1440／1024相关状态 | `shared-*`；保留原几何及可用入口，已自检 |
| 手机有限核查，减少动态效果 | 390 | `mobile-obvious-left/right-390`；只核查明显遮挡、页面溢出及入口，不作为手机填写排版通过 |

三档桌面分别与原构建比较行高、控件相对坐标、宽高及字体族／字号／字重；Chrome隐藏原生箭头后font简写的行高表示不同，几何及实际图像单独核对。公共颜色同时通过真实组件计算样式与渲染图像验证。

## 验证

类型检查0错误、0警告；296项规则通过。真实Vercel包的禁用专项、每日保存回归、公共UI及首次安排回归通过，覆盖真实零、当日与次日更正、503重试、保存成功后只读重试、409保留草稿、键盘、公共未保存确认及跨午夜。部署运行包依赖、字体与实际中文PDF生成烟测通过；结果见[验证汇总](checks/verification.json)、[禁用专项](checks/disabled.json)、[保存回归](checks/saved-regression.json)和[运行包](checks/runtime.json)。

所有业务测试使用本机隔离数据库及虚构账号／数据，固定11月7日（保存原回归固定10月7日）。根工作区既有修改保留。此前两批白底锁定截图作为当时要求的证据保留，本批按最新禁用要求替换其视觉结论，昨日保留范围与业务权限延续。
