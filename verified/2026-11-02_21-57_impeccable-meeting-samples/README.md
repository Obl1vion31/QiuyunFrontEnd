# Impeccable 例会视觉样张

状态更正：**此版视觉方向不合格，已进入后续整改；未发布。** 用户反馈指出全宽卡片留白失衡、名称层级不足，以及判断必需的pp与月度变化被折叠。下列构建、保存及截图检查记录仅说明当时实际执行过的检查，不能继续作为视觉通过依据；旧证据保留供对照。

## 先看这些

- [月会草稿首屏](screenshots/monthly-draft-1440.png)／[定稿阅读](screenshots/monthly-read-1440.png)／[手机](screenshots/monthly-read-390.png)
- [周会推广记录](screenshots/weekly-promotion-1440.png)／[手机](screenshots/weekly-promotion-390.png)
- [同帖7／15天对照](screenshots/weekly-non-promotion-1440.png)／[手机](screenshots/weekly-non-promotion-390.png)
- [月度环比展开](screenshots/monthly-comparison-1440.png)、[材料设置展开](screenshots/monthly-settings-1440.png)、[手机对照展开](screenshots/weekly-touch-expanded-390.png)
- [桌面操作录像](video/desktop.webm)／[独立手机触屏录像](video/mobile.webm)

## 来源与变化

使用 Impeccable 4.8.0，固定源码 e89e3ada3e875a89ac2c5d33d11e65ebef6fe285，读取 context、distill、layout、craft-floor 与 polish。继承工作台 MiSans、配色、壳层和控件。只调整当前已实现模块的展示与草稿初始展开状态，保留原保存、校验、统计、冻结和审批协议。

图片来自正式组件与构建产物，在隔离 PGlite 中通过真实认证、会议API、私域录入和草稿保存生成。画面数字、帖子和账号均为虚构测试数据，未写生产库。业务时钟固定2026-11-03便于观察完整10月及跨节点状态；文件夹时间为实际北京时间。

源代码基线与七个展示文件的SHA256见[evidence/source.json](evidence/source.json)。原始复现脚本为仓库`.tools/meeting-visual-samples.ts`，原始材料位于`.tools/test-artifacts/impeccable-meeting-samples/`。

月会将主私域结果、辅助投入和结论分层，环比集中展开；草稿材料设置默认收起。周会推广主指标集中，观察和行动完整显示，历史、同类与事实统一收纳；非推广以节点行为桌面对照，手机按完整节点纵排。

## 实际验证

- 类型检查与Node构建通过；21项相关规则通过，见[evidence](evidence/meeting-visual-rules.log)。Impeccable针对四个展示组件的机械扫描返回空问题数组；它不代表整站或视觉自动通过。
- 实际打开桌面、平板与手机主要样张，修正手机版本栏多余留白、宽屏数字锚点及协作姓名加载造成的下移。正文从首帧到姓名出现的76帧均为146px，见[first-paint.json](evidence/first-paint.json)；这仅验证390px本次首屏，不替代完整冷暖缓存及慢字体矩阵。
- 真实操作覆盖材料设置、环比展开、核心结论输入与后台保存、点击率修改确认回显、触屏展开和减少动态效果；浏览器运行无页面错误，逐场景核对无整页横向溢出。
- 桌面及独立手机录像按8fps连续帧实际审查；稳定截图另看，不以录像中间帧充当样张。

| 视图 | 截图 |
| --- | --- |
| 月会草稿首屏 | [1920px](screenshots/monthly-draft-1920.png) ／ [1440px](screenshots/monthly-draft-1440.png) ／ [1024px](screenshots/monthly-draft-1024.png) ／ [390px](screenshots/monthly-draft-390.png) ／ [320px](screenshots/monthly-draft-320.png) |
| 月会定稿阅读 | [1920px](screenshots/monthly-read-1920.png) ／ [1440px](screenshots/monthly-read-1440.png) ／ [1024px](screenshots/monthly-read-1024.png) ／ [390px](screenshots/monthly-read-390.png) ／ [320px](screenshots/monthly-read-320.png) |
| 周会推广记录 | [1920px](screenshots/weekly-promotion-1920.png) ／ [1440px](screenshots/weekly-promotion-1440.png) ／ [1024px](screenshots/weekly-promotion-1024.png) ／ [390px](screenshots/weekly-promotion-390.png) ／ [320px](screenshots/weekly-promotion-320.png) |
| 周会7／15天对照 | [1920px](screenshots/weekly-non-promotion-1920.png) ／ [1440px](screenshots/weekly-non-promotion-1440.png) ／ [1024px](screenshots/weekly-non-promotion-1024.png) ／ [390px](screenshots/weekly-non-promotion-390.png) ／ [320px](screenshots/weekly-non-promotion-320.png) |
| 周会未来节点 | [1920px](screenshots/weekly-future-1920.png) ／ [1440px](screenshots/weekly-future-1440.png) ／ [1024px](screenshots/weekly-future-1024.png) ／ [390px](screenshots/weekly-future-390.png) ／ [320px](screenshots/weekly-future-320.png) |

默认主要视图五档已实看；未来节点五档已渲染并通过宽度检查，桌面、手机额外抽查。展开、设置与编辑截图按文件所示视口验收，不借用默认态代表全部条件态。

## 后续接续

用户确认视觉方向后再扩展月会其余模块、月计划、PDF及全部公共消费者；替换设计规范中与新布局冲突的旧条款，运行完整公共UI、首屏与发布回归。当前不把这些范围计为通过，也不推送或发布本批样张。
