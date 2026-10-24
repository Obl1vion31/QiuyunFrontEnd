# 样片复现

`build.mjs` 读取上一轮已归档的 A，沿用其全部文案与后两区，再替换本轮首屏 CSS、`motion.js` 和暂停控件。素材复制自上一批公开素材，保持离线可用；不读取数据库或环境凭据。

仓库根目录使用现有 Node 22：

```bash
node verified/2026-10-23_13-16_home-cinematic/source/build.mjs
node verified/2026-10-23_13-16_home-cinematic/source/serve.mjs
```

服务为 `http://localhost:4331/preview/index.html`。保持服务运行，另一个终端执行：

```bash
node verified/2026-10-23_13-16_home-cinematic/source/capture.mjs
node verified/2026-10-23_13-16_home-cinematic/source/audit.mjs
node verified/2026-10-23_13-16_home-cinematic/source/postprocess.mjs
```

本机 Chromium、共享库及字体配置沿用 [测试入口](../../../tests/README.md)。原始录像／逐帧数据留在 `.tools/test-artifacts/home-cinematic/`；最终 MP4、截图与检查结果位于上层。视频转换使用本机现有 ffmpeg。
