# 刷新首屏：提醒与字体稳定

更正：本批将系统回退稳定显示判为通过，丢失了已确认的MiSans效果；字体视觉结论撤回，整页锁定系统字体的策略已移除。提醒布局修正保留。[恢复MiSans与原版对照](../2026-10-30_20-54_restore-misans/README.md)。

已实际查看首屏和稳定画面、连续帧；归档时间为北京时间。正式SSR／React、隔离PGlite虚构样本，金额不是实际经营数据。手机为Linux Chromium触屏模拟。

## 原因和修复

- 原提醒卡额外显示读取行，成功后删除；字体回退的默认行高还叠加一次变化。复现中导航从约220.4px变为201.6px，再到198.6px。[原始早期帧](baseline/fonts-initial.png)／[逐帧数据](baseline/fonts.json)。
- 原字体CSS位于Frame正文后，swap允许系统回退在字体到达后替换；延迟字体时文字宽度从36.75px改为37.75px。原图库只等待稳定后截图，未验证首屏，旧索引已补正。
- 提醒加载状态改为不占布局的辅助技术状态，失败说明融入首条标签；明确标签及计数行高，加载、失败与恢复不增删卡片行。
- 仅改optional的试验仍出现短暂缺字，未通过本轮首屏图审查，因此未采用；改为在可用系统字体上完成一次首帧选择。
- 七个工作台页面head共用字体样式和常用切片预加载；每个文档只在首帧前所需字形就绪时启用MiSans，否则本次阅读保持系统回退。迟到字体留作缓存，Astro切页保留选择；没有整页隐藏、等待遮罩或更换字体资产。PDF继续内联MiSans、等待就绪后打印。

## 实际验收

17个启动场景：五档冷缓存直接进入、暖缓存刷新、字体1200ms／提醒800ms延迟，以及1440／390px慢请求刷新。提醒失败恢复、年度页与看板站内往返、七页head接入均通过。[实际字体、逐帧文字宽度、提醒高度与导航位置](result.json)。

本机Linux的这些启动样本均选用稳定的Noto系统回退，不将此结果声称为真实Windows／Safari或MiSans首帧命中验证。字体可用时的PDF独立检查。字体与浏览器原生月份文字受运行平台影响。

36张首屏／稳定图与14张共享UI参考图已实际查看；共享UI包含年度编辑、例会创建、设置、推广每日／历史和非推广详情，14图不作为其全部业务状态的新增验收。首屏早期图中条形图处于正常进入动画，稳定图另列，不将中间帧充当最终稳定效果。

| 宽度 | 冷缓存早期／稳定 | 暖缓存早期／稳定 | 慢请求早期／稳定 |
| --- | --- | --- | --- |
| 1920 | [早期](screenshots/cold-1920-early.png)／[稳定](screenshots/cold-1920-stable.png) | [早期](screenshots/warm-1920-early.png)／[稳定](screenshots/warm-1920-stable.png) | [早期](screenshots/slow-1920-early.png)／[稳定](screenshots/slow-1920-stable.png) |
| 1440 | [早期](screenshots/cold-1440-early.png)／[稳定](screenshots/cold-1440-stable.png) | [早期](screenshots/warm-1440-early.png)／[稳定](screenshots/warm-1440-stable.png) | [早期](screenshots/slow-1440-early.png)／[稳定](screenshots/slow-1440-stable.png) |
| 1024 | [早期](screenshots/cold-1024-early.png)／[稳定](screenshots/cold-1024-stable.png) | [早期](screenshots/warm-1024-early.png)／[稳定](screenshots/warm-1024-stable.png) | [早期](screenshots/slow-1024-early.png)／[稳定](screenshots/slow-1024-stable.png) |
| 390 | [早期](screenshots/cold-390-early.png)／[稳定](screenshots/cold-390-stable.png) | [早期](screenshots/warm-390-early.png)／[稳定](screenshots/warm-390-stable.png) | [早期](screenshots/slow-390-early.png)／[稳定](screenshots/slow-390-stable.png) |
| 320 | [早期](screenshots/cold-320-early.png)／[稳定](screenshots/cold-320-stable.png) | [早期](screenshots/warm-320-early.png)／[稳定](screenshots/warm-320-stable.png) | [早期](screenshots/slow-320-early.png)／[稳定](screenshots/slow-320-stable.png) |

慢请求刷新：[桌面早期](screenshots/slow-reload-1440-early.png)／[稳定](screenshots/slow-reload-1440-stable.png) · [手机早期](screenshots/slow-reload-390-early.png)／[稳定](screenshots/slow-reload-390-stable.png)。[提醒失败](screenshots/notification-failure-1440.png)／[恢复](screenshots/notification-recovered-1440.png)。

[桌面启动与刷新录像](video/slow-1440.webm)6.04秒，[手机录像](video/slow-390.webm)5.44秒，12fps连续帧已逐张审查：桌面[1](video/frames-1440-01.jpg)／[2](video/frames-1440-02.jpg)／[3](video/frames-1440-03.jpg)，手机[1](video/frames-390-01.jpg)／[2](video/frames-390-02.jpg)／[3](video/frames-390-03.jpg)。未见字形替换、缺字或侧栏推移；原图表进入动画保留。

[五档对照与共享UI联系图](review-sheets/)／[共享UI原图](shared-ui/)。公共UI、月度专项、233项规则、数据库结构检查、Node类型检查／构建通过，[日志](logs/)。未写共享业务数据，无数据库迁移。

本会话未提供frontend-design技能，依仓库的实际运行、首帧录制、桌面／手机及稳定图要求执行。长期规范与接入示例已补充直接进入、硬刷新、冷／暖缓存及慢字体／数据覆盖，保留最终视觉验收要求。

## 发布

实现源码`47044ed2063baea44b06aecb67f68d2fc5088095`，工作分支`codex/first-paint-stability`；Vercel类型检查／构建及运行包中文PDF通过，PDF为200738字节、沿用MiSans。部署`dpl_3ZMwn2j9q2meEhnxBJhhLrfi5S25`，已发布至[正式站](https://qiuyun-frontend.vercel.app/business/monthly-operations)；[8项候选检查](candidate-smoke.json)与[114项正式检查、70个资源哈希](public-smoke.json)全部通过。工作分支提交推送，main保持独立确认。
