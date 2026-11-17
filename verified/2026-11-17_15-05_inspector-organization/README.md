# Inspector 五组整理验收

应用源码 `f095d80b`；以 `fb08b02d` 开始，合入 `00d2e5e3` 最新例会点击率功能及其交接。部署 `dpl_2BJVEq8jxCYDftJwq8oWA1R2Tr6M` 已归档、READY并切换正式域名。状态：已自检、待用户反馈。

全部交付图为实际运行截图，来自隔离 PostgreSQL、虚构账号和稳定样本；不使用 ImageGen 效果图代替验收。业务时钟固定2026-11-11，审计操作时间沿用数据库真实记录。正式只做已登录查看与空表单取消，截图留在私有工具目录。

[打开五组图集](index.html) · [检查明细](checks.json)

| 部分 | 实际调整 | 关键验收图 |
| --- | --- | --- |
| 推广历史详情 | ID取消独立色块，复制／更正就近；新ID与原日期／版本范围就地展开；保存后回到查看 | [查看](screenshots/admin-promotion-view-1440-panel.png)、[更正中](screenshots/admin-promotion-edit-1440-panel.png)、[保存后](screenshots/admin-promotion-saved-1440-panel.png) |
| 非推广详情 | 原共享ID更正就近；已保存结果默认只读，显式编辑；待复盘仍直接录入 | [结果](screenshots/admin-nonpromotion-view-1440-panel.png)、[更正ID](screenshots/admin-nonpromotion-id-edit-1440-panel.png)、[待复盘](screenshots/admin-nonpromotion-pending-1440-panel.png) |
| 排期详情与历史 | 同层标题及紧凑版本关系；既有排期／发布与推广审计合为一条时间线，完整依据按需展开 | [详情与历史](screenshots/admin-schedule-history-1440-panel.png)、[推广筛选](screenshots/admin-schedule-promotion-filter-1440-panel.png) |
| 年度规划详情 | 时间块不重复标题和日期；空资料／备注合为一行；版本历史沿用原读取和内容入口 | [详情](screenshots/admin-annual-view-1440-panel.png)、[版本内容](screenshots/admin-annual-history-1440-panel.png) |
| 助手查帖 | 紧凑版本按钮、共享资料入口、累计结果合组；同源历史与完整依据 | [详情](screenshots/admin-lookup-view-1440-panel.png)、[历史](screenshots/admin-lookup-history-1440-panel.png) |

保留原338px／380px窄Inspector、680px排期／助手外壳、单正文滚动与背景不伸缩；没有改动状态流转、ID归属／生效规则、权限、统计、审批或封存规则。非推广从查看进入编辑属于本轮交互调整，保存仍走原接口。既有查帖历史字段继续兼容旧标签页，无新增API、迁移、轮询或运行时依赖。

实际覆盖管理员1920／1440／1024、员工1440：查看、更正、确认取消、503输入保留与重试、真实保存、保存后读取失败只重试读取、未保存关闭保护、部分表单取消还原、历史筛选／分页／依据、年度版本读取、查帖切版本与返回结果。36个最终状态各保留整页及面板图；390仅核对推广窄详情关闭及明显问题，不作为手机完整验收。

目标Vercel构建含类型0错误／0警告；新增测试类型复核0错误／0警告。21项相关纯规则、五组双角色浏览器、共享历史业务回归、双角色首次推广安排真实保存通过。推广原指标、排期结构及已有历史保持；非推广ID更正按原规则追加更正历史。历史慢读、失败重试及迟到响应不覆盖新对象已验证。公共220ms进出及减少动态效果沿用；就地查看／编辑不增加独立浮层。

实际录像已抽帧检查，原速：

- [推广ID就地更正、确认与失败重试](video/promotion-inline.mp4)
- [非推广编辑、未保存保护及保存](video/nonpromotion-edit.mp4)
- [助手查帖切版本及返回](video/lookup-versions.mp4)

候选与正式分别核对登录边界、受影响入口及三项变动CSS／JS字节；正式已登录查看日详情及原位ID更正，未提交业务修改。完整发布记录和原始调试材料保留在本机工具目录。
