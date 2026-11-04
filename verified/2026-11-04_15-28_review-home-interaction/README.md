# 非推广复盘与首页图片交互

状态：已自检并发布，待用户反馈。应用实现 `d2f2c57`，整合最新已发布月计划／编辑权修复后的运行版本 `823ac7d`。

## 直接查看

- 待复盘：[宽屏任务列表](screenshots/inspector-pending-1920.png)、[常规待办](screenshots/review-pending-standard-1440.png)、[持续待办](screenshots/review-pending-continuous-1440.png)。
- 已复盘：[历史结果与缺值](screenshots/review-history-1920.png)、[分类展开与有效样本](screenshots/review-category-expanded-1920.png)、[保存失败保留输入](screenshots/review-save-failure-1440.png)。
- 首页：[浅弧右上角下凹](screenshots/home-tilt-arc-top-right-1440.png)、[平带右上角下凹](screenshots/home-tilt-flat-top-right-1440.png)、[3D交互录像](motion/home-tilt.mp4)、[原循环与滚动](motion/home-loop.mp4)。
- [桌面结果切换录像](motion/review-desktop.mp4)、[手机关键操作录像](motion/review-mobile.mp4)。

## 交付与范围

- 非推广移除独立限宽；待办只呈现任务信息，常规四列，即时／持续按帖保留节点和录入入口。原Inspector完整字段、租约、校验、草稿、保存和业务口径保持。
- 历史阅读缺值统一“—”，不重复有效零样本；有值且有效样本不足时保留依据。主值共基线，细轨及样本分层。早期320px差值被细轨穿过的问题已修正，旧调试过程保留于本工作树`.tools/test-artifacts/nonpromotion-results/video-desktop/`，本批正式图均为修正后。
- 首页外层继续循环，内层根据光标轻微下凹并阻尼回正；四角、中心、暂停、静止光标、回收与减少动态效果均验证。原九图、构图和循环节奏保留。
- 用户确认桌面优先、手机暂不作为日常填写入口，已更新AGENTS、设计和测试说明。手机仅处理明显问题；首页沿用已确认桌面构图，触屏检查只证明3D禁用，不标为手机排版通过。相关范围截图保留于`inspection/home-desktop-scope-touch-*.png`。
- 业务页面全部使用隔离PGlite事实与虚构账号；首页使用既有九张原图。源码、字体与规则来自本次工作树；[源文件哈希](checks/source-hashes.json)供追溯，无生产业务写入或迁移。

## 实际覆盖与验证

| 视图／状态 | 1920 | 1440 | 1024 | 390 | 320 |
| --- | --- | --- | --- | --- | --- |
| 常规／即时／持续待办 | 已查看 | 已查看 | 已查看 | 明显问题核查 | 明显问题核查 |
| 分类汇总／展开／历史总览 | 已查看 | 已查看 | 已查看 | 明显问题核查 | 明显问题核查 |
| 即时／持续结果及往期趋势 | 已查看 | 已查看 | 已查看 | 明显问题核查 | 明显问题核查 |
| 首页浅弧／展开／平带四角 | 已查看 | 已查看并录制 | 已查看 | 仅触屏禁用 | 仅触屏禁用 |

- 本批98张界面图及四段录像206个取样帧已实查，索引为`inspection/stills-*`、`video-home-*`和`video-review-*`；关键文字另开原图复核。
- 类型检查、Node构建、迁移结构、原Inspector、结果及动效、公共UI、首页专项通过；整合远端后再次通过261项规则、Node／Vercel构建、Inspector及公共UI。命令及输出在[checks](checks/)。
- 首屏专项17场景通过，以**月度运营**代表共享壳层，覆盖冷／暖、硬刷新、1200ms字体及800ms提醒延迟、失败恢复与七页head接入。34张早期／稳定图和两段录像87帧已审查，证据在`checks/first-paint/`及`inspection/first-paint-*`，过程录像在`motion/first-paint-*.mp4`。
- 实际Vercel运行包包含React、Puppeteer、压缩Chromium及中文字体；冻结隔离材料生成月5页／周3页PDF，已渲染并查看：[包检查](release/runtime-bundle.json)、[PDF检查](release/pdf-render-check.json)。
- Impeccable机械扫描保留两项既有提示：分类选中强调线、首页背景线。两者均为原已确认设计，本次保持；不以扫描提示替代实际渲染审查。

## 发布

正式域名122项、87个资源哈希及线上三档桌面的浅弧／平带交互通过；[正式站交互录屏](release/home-online-1440.mp4)。

独立部署、正式域名、版本和资源哈希核对结果见[发布检查](release/README.md)。
