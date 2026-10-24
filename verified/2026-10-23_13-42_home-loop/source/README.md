# 独立样片源码

`build.mjs` 使用已归档 A 的文案、后两区和纵向几何，替换为 `covers.json` 中九张用户新图与本轮动效。封面原件随预览保存，无需再次读取临时附件；字体来自上一轮已公开资源。样片不连接数据库。

仓库根目录使用现有 Node 22：

```bash
node verified/2026-10-23_13-42_home-loop/source/build.mjs
node verified/2026-10-23_13-42_home-loop/source/serve.mjs
```

保持 `http://localhost:4332/preview/index.html` 运行，另一个终端执行：

```bash
node verified/2026-10-23_13-42_home-loop/source/capture.mjs
node verified/2026-10-23_13-42_home-loop/source/audit.mjs
node verified/2026-10-23_13-42_home-loop/source/postprocess.mjs
```

`capture.mjs` 先检查三档桌面与完整平带循环，再独立录制，避免多个验收页面竞争录制资源。仅需重新录制时使用 `capture.mjs --record-only`，保留已有检查结果并更新录像信息。视频由现有 ffmpeg 转为 MP4，并截取平带片段与关键帧。

浏览器与系统库配置沿用[测试说明](../../../tests/README.md)。原始 WebM、逐帧数据留在 `.tools/test-artifacts/home-loop/`；上层只保留最终证据与源文件。`audit.mjs` 在上传临时原件仍存在时额外比对原件哈希，之后仍可验证归档素材与清单。
