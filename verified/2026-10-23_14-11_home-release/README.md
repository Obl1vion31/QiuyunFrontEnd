# 首页正式接入：九图浅弧与持续平带

用户已确认[九图持续循环样片](../2026-10-23_13-42_home-loop/README.md)作为验收标准。本轮已接入实际 Astro／React 首页，桌面自检通过，并发布至[正式首页](https://qiuyun-frontend.vercel.app)。状态：已自检、已发布并完成公网核对。

- [实际首页录屏](motion/home-scroll.mp4)、[平铺持续循环片段](motion/flat-loop.mp4)、[录屏关键帧](motion/keyframes.png)。
- [1440 首屏](screenshots/initial-1440.png)、[展开](screenshots/unfold-1440.png)、[平带](screenshots/flat-1440.png)、[跨屏](screenshots/handoff-1440.png)。
- [1280 首屏](screenshots/initial-1280.png)、[1024 首屏](screenshots/initial-1024.png)、[1024 后两区](screenshots/lower-1024.png)。
- [无脚本首帧](screenshots/ssr-1440.png)、[减少动态效果](screenshots/reduced-1440.png)、[缺图回退](screenshots/image-failed-1440.png)。

## 实际实现

`src/data/home.ts` 使用九张用户确认原图；文件原样复制到 `public/images/home/tmua-1.png` 至 `tmua-9.png`，与确认样片 SHA-256 一致。首页保留现有 React Island，`ContentTunnel` 输出结构和 SSR 初态，`src/scripts/home-motion.ts` 管理循环、展开、暂停和可见性；无新增运行依赖。

初态中央 2–3 张清晰，两侧浅弧渐隐，2.6 秒停留后用 1.15 秒推进一张。下滑沿 A 的距离展开，平铺后持续匀速横移；九图各保留一个实例，场景外回收。暂停在两种状态均可操作，01–06 仅随纵向滚动推进。后两区采用 A 的侧标题＋3×2 工作流与三行系统入口，文案、业务目的地与入口状态保留。

## 验收范围

实际构建在 1440×900、1280×800、1024×768 桌面运行并查看渲染图。逐档对照确认样片的 Hero 高度、后两区高度、标题字号、行高、宽度及换行，结果一致；修复接入时通用断点覆盖标题字号造成的偏差。1440 页面约 2608px，后两区 924px；1024 页面约 2360px。

浏览器检查包括初始停留、换组、展开、平带保持纵向位置后的持续横移、完整九图回收、暂停与键盘恢复、暂停后纵向展开、六阶段推进、往返、离场停止、缺图和减少动态效果。完整平带循环中，九图均完成回收，可见瞬移为 0。已查看截图与录屏关键帧，不以 DOM 断言代替视觉检查。

SSR 无脚本时九张封面已按浅弧排列，未激活的播放控件隐藏；跳过链接可聚焦正文标题。普通浏览器后退后的循环通过，BFCache 未命中。结果见 [checks.json](checks.json) 与 [extra-checks.json](extra-checks.json)。按用户范围仅验收桌面。

## 检查与复现

`pnpm build`（含类型检查）、166 项单元／业务规则、`pnpm db:check`、`pnpm test:home` 通过。首页浏览器验收只提供真实构建的静态资源，不连接业务库；本轮无数据库迁移或业务写入。公开资源发布清单已核对私有目录、环境文件和 verified 不进入部署。

```bash
pnpm build
HOME_EVIDENCE_DIR=verified/2026-10-23_14-11_home-release pnpm test:home
```

运行工具配置见 [tests/README.md](../../tests/README.md)。原始 WebM 与逐帧数据位于 `.tools/test-artifacts/home-release/`，本目录保留已实际审阅的最终截图与 MP4。正式组件定位见[首页代码学习](../../docs/home-code-study.md)。

## 公网核对

发布源 `db225eb`，Vercel 生产部署 `dpl_4y8GjbiwBoRYnr3TfwA1XNLSDXW5` 已就绪并绑定正式域名；详情与可回滚部署见 [release.json](release.json)。公网 73 项检查通过，54 个线上 CSS／JS、字体和图片资源与本地 Vercel 模式构建 SHA-256 一致，登录保护、业务未登录拒绝与私有路径均正常，见 [public-smoke.json](public-smoke.json)。

线上另实际核对 1440／1280／1024px：九张图、无横向溢出、平铺持续横移、暂停／键盘恢复与减少动态均通过；无脚本错误或写入请求。[线上首屏](production/hero-1440.png)、[线上 1024 平带](production/flat-1024.png)、[线上工作流](production/workflow-1280.png)、[线上操作录像](production/online-check.mp4)及[关键帧](production/keyframes.png)已实际查看，详见 [production/browser.json](production/browser.json)。
