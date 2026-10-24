# 例会定稿展示与标题资料

已自检并发布公网，待用户反馈。发布源 `46cb5af2b9faf67c21ba43032921051dc1920b18`，部署 `dpl_3o4UZj4hzQVssLT7RbwscNUyZ6YB`；[正式例会入口](https://qiuyun-frontend.vercel.app/business/meeting-review)。

定稿按本期结果、核心结论与下一步、帖子卡片、补充分析与事项阅读；草稿保留填写布局。推广／非推广均用紧跟标题的轻量资料入口，气泡在所属卡片内横向定位。指标与安排取冻结版本，资料链接实时读取。

## 先看这些

- [会后V1首屏](post-overview-1440.png)／[会前V0完整页面](pre-full-1440.png)。
- [定稿卡片](post-cards-1440.png)／[推广标题资料气泡](post-references-1440.png)／[非推广卡片与事项](pre-non-1440.png)。
- [草稿内联填写](draft-1440.png)／[月例会空态](monthly-empty-1440.png)。
- [资料交互录像，2.1秒](references-flow.mp4)／[录像关键帧](references-keyframes.png)。
- [公网真实草稿，1728px](production-draft.jpg)：5张推广、7张非推广，共12个标题资料入口；只有1个保存草稿按钮，无页面横向溢出。线上只有草稿，未替用户定稿；会前／会后写入验收全部在隔离库完成。

## 四档桌面

| 宽度 | 会前首屏 | 卡片 |
| --- | --- | --- |
| 1920px | [查看](pre-overview-1920.png) | [查看](pre-cards-1920.png) |
| 1440px | [查看](pre-overview-1440.png) | [查看](pre-cards-1440.png) |
| 1280px | [查看](pre-overview-1280.png) | [查看](pre-cards-1280.png) |
| 1024px | [查看](pre-overview-1024.png) | [查看](pre-cards-1024.png) |

除公网草稿外，截图来自正式组件、隔离PGlite及明确虚构的资料与指标；已查看最终截图和录像关键帧。原始完整录像与调试产物位于 `.tools/test-artifacts/meeting-presentation/`。

## 验收结果

- 类型检查、Node／Vercel构建、182项业务规则和db:check通过。
- 创建、例会候选及定稿、内联编辑、非推广专项、定稿展示专项、公共UI、旧版例会与区间兼容浏览器检查通过；资料定位调整后重跑了定稿与非推广专项。
- 三列／1024px两列、同行等高与底部明细对齐通过；长标题自然换行、长观察和行动完整且顶部对齐。
- 草稿输入保留，资料悬停／点击／键盘／外点开关不改变卡片或滚动；缺资料显示未登记。
- 汇总包含未纳入卡片的本期真实跑量；资料更正后材料指纹与旧快照不变；会前不执行事项，会后追加V1执行，跨日查看保持原生效日。
- 本轮定稿专项为桌面；公共壳层及旧版兼容回归包含390／320px。
- 公网85项HTTP检查和57个资源SHA-256核对通过；真实草稿资料入口与所属卡片内的气泡只读核对通过。

无生产业务写入或数据库迁移；工作分支保留。证据：[专项检查](checks.json) · [公网读取](production-read.json) · [公网HTTP与资源检查](public-smoke.json)。
