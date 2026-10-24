# 非推广实验日期起止展示

已自检并发布公网，待用户反馈。发布源 `68e77fe313de721b8654069d13831e2b95a73acc`；正式域名 [非推广复盘](https://qiuyun-frontend.vercel.app/business/non-promotion-review?view=pending)，部署 `dpl_ByniXBY9Bbvm2DkmmWoM9krSLrTv`。

“实验日期”原列上下显示实际发布日期与“至 应复盘日期”，首轮为上海实际发布日加7天，二轮加15天。保留完整日期、原来的六列、发布日期排序与录入流程；应复盘日和用户实际填写的数据截止日分开。

## 最终截图

- [公网真实记录，1728×927](production-pending.jpg)：9条待复盘均显示起止日期，字体13px MiSans，日期及页面无横向溢出；例如10月17日至10月24日。
- 待复盘：[1920px](pending-1920.png)、[1440px](pending-1440.png)、[1280px](pending-1280.png)、[1024px](pending-1024.png)。
- [历史数据总览，1440px](history-flat-1440.png)：同帖首轮至10月8日、二轮至10月16日。
- [分类明细，1440px](history-category-1440.png)、[不复盘与资料，1440px](skipped-1440.png)。

除公网截图外，图片来自正式构建与隔离PGlite的虚构测试资料，统一10月1日实发；已逐张查看。原始截图与既有交互录像保留在 `.tools/test-artifacts/non-promotion-date-range/`。

## 验收结果

| 检查 | 结果 |
| --- | --- |
| 始末日期 | 使用实际上海发布日与共享7／15天规则；待填、历史、分类、跳过和保存后回显一致 |
| 排版 | 四档桌面默认列表完整；1440／1024px资料面板及录入操作正常；不新增列 |
| 保存与视图 | 保存后重开、原位分类切换、未保存保护、键盘及焦点返回通过 |
| 既有适配 | 390／320px既有布局、共享220ms进出与减少动态效果回归通过 |
| 构建与规则 | 类型检查、Node／Vercel构建、182项规则、db:check通过 |
| 浏览器回归 | `test:non-promotion`、`test:ui`通过 |
| 公网 | 85项HTTP检查、57个资源SHA-256核对通过；登录态真实页面只读检查通过 |

写入测试仅使用隔离库，无生产业务写入和数据库迁移；工作分支保留。

[交互检查](checks.json) · [公网日期读取](production-read.json) · [公网HTTP与资源核对](public-smoke.json)
