# 例会总览紧凑会议列表

已自检、已发布，待使用反馈。批次采用北京时间；应用源码 `834f5ad3589c4fc79b8d9c9d9a8e32b9bad6c2d4`，分支 `codex/compact-meeting-list`。最后补充仅为截图等待与验收文档，应用实现未再改变。

## 实现与原结论更正

原六列把同一会议的信息拆散，PDF维护操作又主导行高；只核对居中、宽度与溢出不能证明阅读顺序合理。[旧表格批次](../2026-10-28_21-22_meeting-ledger/README.md)及[后续布局批次](../2026-10-29_02-06_table-tools-accounts/README.md)已补正例会视觉结论，保留旧证据。

总览及历史改用共享紧凑记录：白底区块与正文同边界，名称、版本及状态优先，会议时间／类型、完整复盘区间及周期集中在辅助行。桌面16px／20px内距，手机左右12px、操作下移、不横滚。保留原MiSans，标题15px／500，辅助信息12px／18px；标题末字与版本一起换行，避免V3单独占行。

查看／下载PDF直接可用，重新生成／上传放入公共“更多”气泡；附件长名称在自身区域换行，不挤压下载。菜单支持键盘、Esc、外点、焦点返回及视口避让。实际草稿V4与定稿PDF V3分别标明；继续草稿、进入讨论、管理员初始草稿删除及删除后原位更新保留。历史整体与逐会议默认折叠，记录展示阶段、时间、备注及原归档能力。接口、权限、确认、数据库和字体源不变。

DESIGN、DECISIONS、共享接入与测试说明同步，替换本页六列居中／PDF固定两行的旧规则，不扩改其他页面结构。

## 实际视觉审查

正式SSR／React组件、隔离PGlite虚构样本；不是实际经营或员工数据。Linux Chromium，手机为触屏模拟。会话无可用frontend-design Skill，按仓库要求实际打开图像及连续帧审查；未声称真实Windows或Safari验收。

48张最终截图已查看：五档单条、多条、长名称、草稿、会前／会后、修订与定稿并存、两层历史、附件；另含双角色、删除取消及1440／390px操作状态。[实际几何与平台字体](result.json)中，公共边界及标题起点误差为0px，五档无正文横向溢出，标题实际使用自定义 **MiSans VF**。几何检查之外，逐图核对整页层级、时间分组及操作可达性。

| 宽度px | 记录 | 展开与操作 |
| --- | --- | --- |
| 1920 | [单条](screenshots/single-1920.png)／[混排](screenshots/mixed-1920.png)／[长标题](screenshots/long-1920.png) | [更多](screenshots/more-1920.png)／[附件](screenshots/attachments-1920.png)／[草稿](screenshots/draft-1920.png)／[历史](screenshots/history-1920.png) |
| 1440 | [单条](screenshots/single-1440.png)／[混排](screenshots/mixed-1440.png)／[长标题](screenshots/long-1440.png) | [更多](screenshots/more-1440.png)／[附件](screenshots/attachments-1440.png)／[草稿](screenshots/draft-1440.png)／[历史](screenshots/history-1440.png) |
| 1024 | [单条](screenshots/single-1024.png)／[混排](screenshots/mixed-1024.png)／[长标题](screenshots/long-1024.png) | [更多](screenshots/more-1024.png)／[附件](screenshots/attachments-1024.png)／[草稿](screenshots/draft-1024.png)／[历史](screenshots/history-1024.png) |
| 390 | [单条](screenshots/single-390.png)／[混排](screenshots/mixed-390.png)／[长标题](screenshots/long-390.png) | [更多](screenshots/more-390.png)／[附件](screenshots/attachments-390.png)／[草稿](screenshots/draft-390.png)／[历史](screenshots/history-390.png) |
| 320 | [单条](screenshots/single-320.png)／[混排](screenshots/mixed-320.png)／[长标题](screenshots/long-320.png) | [更多](screenshots/more-320.png)／[附件](screenshots/attachments-320.png)／[草稿](screenshots/draft-320.png)／[历史](screenshots/history-320.png) |

- 员工：[1440px](screenshots/employee-1440.png)／[320px](screenshots/employee-320.png)；[管理员删除取消](screenshots/delete-cancel-1440.png)。员工初始草稿不留空动作区。
- 1440px：[菜单](screenshots/interaction-menu-1440.png)／[生成中](screenshots/busy-1440.png)／[失败](screenshots/error-1440.png)／[真实重试成功](screenshots/retry-success-1440.png)／[真实附件上传](screenshots/upload-success-1440.png)。
- 390px：[菜单](screenshots/interaction-menu-390.png)／[生成中](screenshots/busy-390.png)／[失败](screenshots/error-390.png)／[真实重试成功](screenshots/retry-success-390.png)／[真实附件上传](screenshots/upload-success-390.png)。

最终录像：[桌面5.80秒](video/interaction-1440.webm)／[手机5.72秒](video/interaction-390.webm)。12fps连续提取70／69帧并实际查看，覆盖延迟字体脚本下直接进入／刷新、菜单、键盘退出、故障注入、真实PDF重试及上传。桌面帧：[1](video/frames-1440-01.jpg)／[2](video/frames-1440-02.jpg)／[3](video/frames-1440-03.jpg)；手机帧：[1](video/frames-390-01.jpg)／[2](video/frames-390-02.jpg)／[3](video/frames-390-03.jpg)。未见字形替换、侧栏推移、菜单撑高记录或遮挡目标操作。成功截图额外等待操作反馈淡出，生成中图单独标识，不混作成功最终状态。

## 回归与发布

- 紧凑列表专项、公共UI、新建例会、现行版本讨论与PDF流程、数据界面条件态通过；真实重试与上传结果核对隔离数据库。菜单／附件使用真实控件，仅延迟与503为故障注入。
- 233项规则、db:check、类型检查与Node／Vercel构建、运行包中文PDF（200738字节）通过。首屏17场景回归通过：[结果](first-paint-result.json)。[原字体恢复图库](../2026-10-30_20-54_restore-misans/README.md)保留历史对照，本次不改变字体实现。
- `test:data-ui`前置旧首次安排脚本在编辑锁禁用状态超时，未计通过；受影响的`data-interface.browser.ts`单独运行通过。旧`meeting-inline.browser.ts`在确认纳入后等待旧卡片超时，未计通过，现行创建、讨论／定稿、总览专项已分别通过；测试说明纠正了把旧专项写入当前`test:weekly`的陈旧描述。详细输出在[日志](logs/)。这些失败不冒充通过，也未以修改业务逻辑迁就旧脚本。
- 最终候选10项检查通过，部署 `dpl_8xcsZ6e58En69fNr2RZ5eqF7RKB1` 已推广到[正式例会总览](https://qiuyun-frontend.vercel.app/business/meeting-review)。[正式核对](public-smoke.json)115项、71个资源哈希全部通过；[候选结果](candidate-smoke.json)。无数据库迁移或生产业务写入；用户本轮进一步授权直接同步main，提交后核对远端并正常推送。
