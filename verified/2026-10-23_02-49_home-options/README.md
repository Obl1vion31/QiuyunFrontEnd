# 首页：三套桌面视觉与动效方案

**状态：方案预览已自检，待选择。推荐 A「封面归位」；优先减少滑动时选 C。**

[打开对比页](preview/index.html) · [本机动态预览](http://localhost:4330/preview/index.html) · [对比总览截图](comparison-1440.png)

| 方向 | 完整预览 | 滚动录像 | 后两区布局 |
| --- | --- | --- | --- |
| A 封面归位，推荐 | [体验 A](preview/a.html) | [播放录像](motion/a-scroll.mp4) | [分栏与六阶段 3×2](screenshots/a/lower-1440.png) |
| B 流程主导 | [体验 B](preview/b.html) | [播放录像](motion/b-scroll.mp4) | [六阶段横排与紧凑入口](screenshots/b/lower-1440.png) |
| C 清爽直达 | [体验 C](preview/c.html) | [播放录像](motion/c-scroll.mp4) | [工作流与入口并列](screenshots/c/lower-1440.png) |

## 如何选择

- **A**：八张真实封面从轻微错位收成有序封面带，文字保持稳定，取消循环穿越；在内容特色、新鲜感与秩序之间最平衡。
- **B**：封面保持静止，只有流程线与当前环节随滚动推进；延续现有六阶段横排，适合偏安静、理性的工具气质。
- **C**：一次 700ms 轻入场后直接阅读，两块后续内容并列，抵达工作台最快；首屏展示感更克制。

三套共用原有全部文字、六阶段顺序、八张真实封面及三个入口状态。预览中的业务和登录链接打开正式站；组织与人员、绩效与报酬继续为原状态。正式首页和业务页面保持现状，选择后再接入产品。

## 实测与自检

1440×900，相同内容、浏览器和字体加载条件。高度为真实 DOM 几何；入口位置指按钮上缘相对文档顶部的位置。

| 页面 | 总高 | 后两区累计高 | 后两区缩短 | 工作台入口位置 |
| --- | ---: | ---: | ---: | ---: |
| 原版 | 4506px | 2010px | — | 3899px |
| A | 2608px | 924px | 54% | 2201px |
| B | 2473px | 1059px | 47% | 2083px |
| C | 1652px | 559px | 72% | 1164px |

已实际检查 1440×900、1280×800、1024×768 的首屏与后两区、入场／中段／落定／交界、往返滚动、静止不持续运动、减少动态效果、键盘跳到正文、真实 MiSans 加载及缺图回退。录像统一以 240px/s 向下滚动，再回到开头；已查看实际录像关键帧。按用户最新要求仅验收桌面。

项目 `pnpm build`（包含 Astro 类型检查）通过；归档源文件加入后再次运行 `pnpm check`，0 errors、0 warnings，保留 4 项既有 unused 提示。独立预览浏览器检查通过，内容／入口／键盘／本地资源及离线 HTML 核对见 [checks.json](checks.json)，三档实测见 [metrics.json](metrics.json)，录像信息见 [motion/report.json](motion/report.json)。预览不连接业务数据库。

## 截图与动效

| 方向 | 首屏 | 阅读拼接图 | 动效关键状态 |
| --- | --- | --- | --- |
| A | [1440](screenshots/a/hero-1440.png) / [1280](screenshots/a/hero-1280.png) / [1024](screenshots/a/hero-1024.png) | [1440](screenshots/a/reading-1440.png) / [1280](screenshots/a/reading-1280.png) / [1024](screenshots/a/reading-1024.png) | [中段](screenshots/a/mid-1440.png) / [落定](screenshots/a/settled-1440.png) / [交界](screenshots/a/handoff-1440.png) |
| B | [1440](screenshots/b/hero-1440.png) / [1280](screenshots/b/hero-1280.png) / [1024](screenshots/b/hero-1024.png) | [1440](screenshots/b/reading-1440.png) / [1280](screenshots/b/reading-1280.png) / [1024](screenshots/b/reading-1024.png) | [中段](screenshots/b/mid-1440.png) / [落定](screenshots/b/settled-1440.png) / [交界](screenshots/b/handoff-1440.png) |
| C | [1440](screenshots/c/hero-1440.png) / [1280](screenshots/c/hero-1280.png) / [1024](screenshots/c/hero-1024.png) | [1440](screenshots/c/reading-1440.png) / [1280](screenshots/c/reading-1280.png) / [1024](screenshots/c/reading-1024.png) | [交界](screenshots/c/handoff-1440.png) / [录像帧](motion/c-middle.png) |

阅读图由真实首屏与后两区截图按阅读顺序拼接，便于比较布局，省略 Hero 的停驻占位；它不是整页长截图，实际滚动距离以表格与录像为准。原始长截图保存在 `.tools/test-artifacts/home-options/`。

[减少动态效果录像](motion/reduced-scroll.mp4) · [静态构图](screenshots/a/reduced-1440.png) · [缺图回退（模拟第一张素材读取失败）](screenshots/a/image-failed-1440.png) · [原版首屏](screenshots/baseline/hero-1440.png)

## 视觉参考与来源

- [Cover Card to Fixed Header](https://scroll-driven-animations.style/demos/cover-to-fixed-header/css/)：同一对象随滚动收拢后交接给正文，作为 A 的连续性参考。
- [Linear](https://linear.app/)：参考明确主角、低对比背景与稳定网格，作为 B 的秩序基准。
- [Raycast](https://www.raycast.com/)：参考集中光场与稳定文字的关系，作为 C 入场氛围参考；留白另按本项目压缩。

制作批次使用北京时间。原版代码基线 `52e0492`，分支 `agent/content-console-redesign`；内容来自 `src/data/home.ts`，[内容快照](content-snapshot.json)，图片来自现有 `public/images/home/`，字体为已有 MiSans 5.0.0。实现和复现入口见 [source/README.md](source/README.md)。

预览是普通 HTML，可保留整个目录离线打开 `preview/index.html`；需要本机服务时，在仓库根目录运行：

```bash
.tools/runtime/node-v22.23.3-linux-x64/bin/node verified/2026-10-23_02-49_home-options/source/serve.mjs
```
