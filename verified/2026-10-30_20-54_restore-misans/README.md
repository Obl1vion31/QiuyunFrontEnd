# 恢复 MiSans 与首屏字体验收

已自检、已发布，待使用反馈。批次时间为北京时间；正式实现 `2ac40d97a294e034ff535bdfa2e0ec69058c8acf`，分支 `codex/restore-misans-rendering`。

## 原因与修正

上次将“字体没有赶上首帧”处理成整页固定系统字体，虽然减少了切换，却改变已确认的 MiSans 字形与字重观感。该策略已删除，[旧批字体视觉结论撤回](../2026-10-30_20-36_first-paint/README.md)；提醒不新增加载行的修正保留。

恢复原字体栈、字号与字重，18 个常用切片使用原 WOFF2 字节，在 head 的共享静态脚本中同步构造 FontFace，再解析正文；其余字形继续按需加载。七页共用入口，无根节点字体选择状态、定时切换或页面隐藏。生成资源从原字体源与元数据构建，未改字体文件；[资产哈希](font-assets.json)全部一致。中文 PDF 继续原字体内联与就绪后打印。

[字体对照图](comparison/font-comparison.png)从上到下为原正确 MiSans、撤回的系统字体、最终恢复版本。与已确认截图采用同数据、同视口，四张指标卡与提醒条共 264264 像素，**差异为 0**：[比较结果](comparison/comparison.json)。不将此局部结果等同于整站逐像素相同。

长期规范补充：首屏稳定必须保留已确认的最终字体；检查实际平台字体及历史正确截图，不能以“没有切换”代替外观正确。共享接入、字体资源说明和测试入口同步更新。

## 实际查看与覆盖

正式 SSR／React、隔离 PGlite 样本，截图金额不是实际经营数据；Linux Chromium，手机为触屏模拟。未声称真实 Windows、Safari 全平台验收。当前会话无可用 frontend-design Skill，沿用仓库视觉要求完成实际看图与逐帧检查。

17 个启动场景覆盖五档冷缓存直接进入、暖缓存刷新、字体脚本延迟 1200ms／提醒延迟 800ms，以及 1440／390px 慢请求刷新。逐帧检查从第一帧起常用字体已就绪、文字宽度与侧栏位置稳定；CDP 验证标题、数量和金额实际使用自定义 **MiSans VF**。提醒失败／恢复与年度页往返、七页接入及不重复注册字体通过：[结果](first-paint-summary.json)。

| 宽度 | 冷启动早期／稳定 | 暖刷新早期／稳定 | 慢请求早期／稳定 |
| --- | --- | --- | --- |
| 1920 | [早期](screenshots/cold-1920-early.png)／[稳定](screenshots/cold-1920-stable.png) | [早期](screenshots/warm-1920-early.png)／[稳定](screenshots/warm-1920-stable.png) | [早期](screenshots/slow-1920-early.png)／[稳定](screenshots/slow-1920-stable.png) |
| 1440 | [早期](screenshots/cold-1440-early.png)／[稳定](screenshots/cold-1440-stable.png) | [早期](screenshots/warm-1440-early.png)／[稳定](screenshots/warm-1440-stable.png) | [早期](screenshots/slow-1440-early.png)／[稳定](screenshots/slow-1440-stable.png) |
| 1024 | [早期](screenshots/cold-1024-early.png)／[稳定](screenshots/cold-1024-stable.png) | [早期](screenshots/warm-1024-early.png)／[稳定](screenshots/warm-1024-stable.png) | [早期](screenshots/slow-1024-early.png)／[稳定](screenshots/slow-1024-stable.png) |
| 390 | [早期](screenshots/cold-390-early.png)／[稳定](screenshots/cold-390-stable.png) | [早期](screenshots/warm-390-early.png)／[稳定](screenshots/warm-390-stable.png) | [早期](screenshots/slow-390-early.png)／[稳定](screenshots/slow-390-stable.png) |
| 320 | [早期](screenshots/cold-320-early.png)／[稳定](screenshots/cold-320-stable.png) | [早期](screenshots/warm-320-early.png)／[稳定](screenshots/warm-320-stable.png) | [早期](screenshots/slow-320-early.png)／[稳定](screenshots/slow-320-stable.png) |

[五档早期／稳定联系图](review-sheets/)已实际查看；[管理员1440px](screenshots/admin-overview-1440.png)、[员工320px](screenshots/employee-overview-320.png)打开原图核对，双角色五档概览均作联系图对照。46 张启动／概览图与 14 张共享 UI 参考图归档；共享 UI 覆盖年度编辑、例会创建、设置、推广每日／历史、非推广详情及分类展开的 1440／390px，不代替这些功能的全部业务状态验收。

[桌面录像](video/slow-1440.webm) 7.32 秒，[手机录像](video/slow-390.webm) 7.24 秒；按 12fps 提取的 88／87 帧已连续查看。第一张可见界面即有完整 MiSans 文字，未见原缺字阶段、字体替换和侧栏推移；原图表进入动画保留。桌面帧：[1](video/frames-1440-01.jpg)／[2](video/frames-1440-02.jpg)／[3](video/frames-1440-03.jpg)／[4](video/frames-1440-04.jpg)，手机帧：[1](video/frames-390-01.jpg)／[2](video/frames-390-02.jpg)／[3](video/frames-390-03.jpg)／[4](video/frames-390-04.jpg)。早期截图用于过程核对，稳定截图另存，不混作最终效果。

## 检查与发布

- 17 个首屏场景、月度运营双角色五档回归、公共 UI 回归通过。
- 233 项规则、db:check、Node 类型检查及构建、最终 Vercel 类型检查及构建、运行包中文 PDF（200738 字节）通过。业务写入只在隔离夹具，无数据库迁移。
- 最终候选 10 项探测通过后推广到正式域名，部署 `dpl_APQ3D5Dhu7z3HNuL8fazpjmoJjXZ`；[正式核对](public-smoke.json) **116 项、72 个资源哈希通过**，包含新字体 CSS／JS。无生产业务写入；main 仍独立确认。
- [验证日志](logs/)保留本轮实际输出；[候选结果](candidate-smoke.json)。中间 CSS 内联方案因录像发现短暂缺字被拒绝，未推广为正式版本。
