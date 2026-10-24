# 首页方案预览源文件

三套独立静态预览共用 `src/data/home.ts`，用于选择首页方向。正式页面、共享组件、业务接口与数据库保持原状。此目录保存最终生成源与桌面验收脚本，不进入网站部署。

| 文件 | 职责 |
| --- | --- |
| `build.ts` | 从现有首页配置生成三套 HTML 和对比页，只复制八张已公开封面和现有字体 |
| `home.css`、`motion.js` | 三套版式、单向归位、流程线、一次入场、键盘与减少动态效果 |
| `gallery.css` | 对比页布局 |
| `serve.mjs` | 在 4330 端口提供预览包和当前静态首页作为原版基线；不提供源码与业务 API |
| `capture.mjs` | 1440×900、1280×800、1024×768 截图、几何、往返、静止、缺图及减少动态效果检查 |
| `record.mjs`、`postprocess.mjs` | 统一 240px/s 滚动录制、MP4、实际录像关键帧及有说明的阅读拼接图 |
| `audit.mjs`、`offline.mjs` | 内容和顺序、封面唯一性、入口状态、键盘跳转、运动职责、全部本地链接及离线 HTML |

在仓库根目录使用已有 Node 22 与本机工具。仅查看时运行：

```bash
.tools/runtime/node-v22.23.3-linux-x64/bin/node verified/2026-10-23_02-49_home-options/source/serve.mjs
```

打开 `http://localhost:4330/preview/index.html`。整个 `preview/` 目录也可以离线打开，不依赖 CDN；正式工作台链接需要网络。

重新生成与检查：

```bash
export PATH="$PWD/.tools/runtime/node-v22.23.3-linux-x64/bin:$PATH"
node --import tsx verified/2026-10-23_02-49_home-options/source/build.ts
# 另一个终端启动上面的 serve.mjs
export LD_LIBRARY_PATH="$PWD/.tools/system/root/usr/lib/x86_64-linux-gnu"
export FONTCONFIG_FILE="$PWD/.tools/system/fonts.conf"
export PLAYWRIGHT_BROWSERS_PATH="$PWD/.tools/browsers"
node verified/2026-10-23_02-49_home-options/source/capture.mjs
node verified/2026-10-23_02-49_home-options/source/record.mjs
node verified/2026-10-23_02-49_home-options/source/postprocess.mjs
node --import tsx verified/2026-10-23_02-49_home-options/source/build.ts
node verified/2026-10-23_02-49_home-options/source/audit.mjs
node verified/2026-10-23_02-49_home-options/source/offline.mjs
```

原版对照需要当前仓库先完成 `pnpm build`，服务只读取 `dist/client` 中的静态首页及首页公开资源。重建会读取当时的 `homeContent`，本轮原始内容已另存于上一层 `content-snapshot.json`；对应原版代码基线为 `52e0492`。

原始长截图、完整逐帧记录和 WebM 留在 `.tools/test-artifacts/home-options/`，归档只保留最终截图、可播放 MP4、关键帧和必要检查结果。
