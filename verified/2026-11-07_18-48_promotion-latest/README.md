# 每日已保存仅保留最新数据日

应用`fe19776`，分支`codex/promotion-latest-day`。状态：已自检，待发布核对。本轮仅收紧已保存行的日期范围，原行布局与控件保持。

旧范围把“今天更新过的更早日期”也放回主表，导致11月4、5、6日并列。现在仅保留上海昨日这一数据日：11月7日只保留6日；4、5日即使今天补录或修改，也只在历史总览查看。历史事实、累计结果及既有待补顺序保持。

## 直接查看

- [真实截图前后对照](screenshots/before-after-latest.png)、[修改前完整页](screenshots/before-older-days-1920.png)、[修改后完整页](screenshots/admin-latest-1920.png)。对照仅裁切实际截图，不改DOM或文字。
- [刷新后](screenshots/refresh-latest-1920.png)、[继续编辑](screenshots/editing-latest-1920.png)、[修改旧日后仍只显示6日](screenshots/old-edit-stays-history-1920.png)、[旧日仍在历史](screenshots/older-days-history-1920.png)、[跨午夜开放7日](screenshots/midnight-next-day-1920.png)。
- [真实操作录像](media/interaction.mp4)，同目录保留原始WebM。包括650ms慢字体直接进入、刷新、键盘继续编辑／保存、历史往返、视口切换及跨午夜；录制留边不代表页面溢出。

| 已保存状态 | 1920px | 1440px | 1024px |
|---|---|---|---|
| 管理员 | [查看](screenshots/admin-latest-1920.png) | [查看](screenshots/admin-latest-1440.png) | [查看](screenshots/admin-latest-1024.png) |
| 员工 | [查看](screenshots/employee-latest-1920.png) | [查看](screenshots/employee-latest-1440.png) | [查看](screenshots/employee-latest-1024.png) |

以上已自检，待用户反馈。13张最终图、原版完整图及前后对照已实际查看，录像按4fps审查70帧；窄桌面沿用原表格局部横滚。[390px检查](screenshots/mobile-obvious-390.png)仅核对明显溢出与遮挡。

## 数据与验证

同一组隔离PostgreSQL样本：11月4／5／6日记录的更新时间均为7日，另有5日已结束的旧活动。修改前准确复现4条已保存行，修改后仅6日一条，待填写为0仍显示；更正旧日不回流，未删除旧事实。保存、硬刷新、站内往返及上海午夜通过。

6日原行的高度、字段相对坐标、字号／字体、边框和底色与原版严格相等：[修改前几何](checks/before-row.json)、[修改后几何](checks/after-row.json)。[专项结果](checks/latest-day.json)、[原保存与失败重试回归](checks/saved-regression.json)、[汇总](checks/summary.json)。类型检查0错误、296规则、Vercel构建通过，实际运行包验证上述场景；[依赖、信任域与中文PDF生成烟测](checks/runtime.json)通过，PDF版式本轮未改。

所有账号、帖子和金额均为虚构隔离数据；正式库未写入测试数据，无物理迁移。原始调试图及抽样帧在私有`.tools/promotion-latest/`。本批替换上一批“今天更新的旧日留在主表”的范围结论，既有原行视觉结论继续适用。
