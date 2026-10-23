# 首页参考：九张新封面，平铺后持续流动

状态：**独立桌面样片，已自检，待用户反馈。** 本轮按用户要求使用新提供的 9 张图，并让封面展开、平铺后继续横向循环；纵向滚动和后两区沿用 A。

- [打开交互样片](preview/index.html)（可离线）；[本机运行入口](http://localhost:4332/preview/index.html)。
- [约 28 秒完整实际录屏](motion/continuous-loop.mp4)：首屏换组 → 下滑展开 → 停在平带约 8 秒 → 后两区 → 返回。
- [约 6 秒平铺持续流动特写](motion/flat-only.mp4)：纵向位置保持不动，封面继续横移。
- [首屏画面](screenshots/initial-1440.png)、[平铺画面](screenshots/flat-1440.png)、[平铺稍后](screenshots/flat-later-1440.png)、[录屏关键帧](motion/keyframes.png)。

## 本轮处理

初始仍以中央 2–3 张清晰封面为主，浅弧两侧渐隐；完全停留约 2.6 秒，再用 1.15 秒柔和推进一张。下滑时同一条封面带逐渐展开为平带，横向运动连续，平铺后采用低速匀速循环，约每 4.5 秒移动一张的位置。两端保留窄渐隐，九张素材只各保留一个实例，在场景外回收。

暂停入口在首屏与平铺状态均保留，暂停冻结横向播放，纵向滚动仍可展开构图；恢复从原相位继续。01–06 只跟随纵向滚动。离开首屏停止动画，减少动态效果时采用静态构图并取消额外滚动占位。

## 素材与来源

9 张封面全部来自本次用户上传，文件未修改；采用 `object-fit: contain` 展示完整原图。[素材清单](assets-manifest.json)保存文件映射、尺寸与 SHA-256，[核对结果](audit.json)记录与上传原件逐一一致。图中信息作为用户提供的图片使用，不写入业务数据库。

其余文案、流程、入口状态与后两区 DOM 沿用 A `c2ae43b`，字体沿用现有 MiSans；本轮只增加独立验收文件。正式首页接入等待本轮反馈。

## 桌面验收

| 视口 | 首屏 | 展开中 | 平铺 | 保持纵向位置后的横移 | 跨屏／键盘焦点 | 减少动态 |
| --- | --- | --- | --- | --- | --- | --- |
| 1440×900 | [初态](screenshots/initial-1440.png) | [展开](screenshots/unfold-1440.png) | [平带](screenshots/flat-1440.png) | [稍后](screenshots/flat-later-1440.png) | [交接](screenshots/handoff-1440.png) | [静态](screenshots/reduced-1440.png) |
| 1280×800 | [初态](screenshots/initial-1280.png) | [展开](screenshots/unfold-1280.png) | [平带](screenshots/flat-1280.png) | [稍后](screenshots/flat-later-1280.png) | [交接](screenshots/handoff-1280.png) | [静态](screenshots/reduced-1280.png) |
| 1024×768 | [初态](screenshots/initial-1024.png) | [展开](screenshots/unfold-1024.png) | [平带](screenshots/flat-1024.png) | [稍后](screenshots/flat-later-1024.png) | [交接](screenshots/handoff-1024.png) | [静态](screenshots/reduced-1024.png) |

三档均实际运行，检查无横向溢出、MiSans 加载、中央封面避让文案与轨道、九图不重叠，以及平铺后停止纵向滚动仍保持横移。已实际查看初态、推进、展开、平铺前后、跨屏、减少动态、[缺图回退](screenshots/image-failed-1440.png)和录像关键帧；另在 1280×720 本机浏览器查看平带，核对暂停控件避让。

平带完整播放超过 9 个位置：九张图均完成回收，逐帧检测可见瞬移为 0。实测横移约 0.217–0.220 张／秒；记录只说明本机样片，不作为生产性能结论。暂停超过一周期、键盘恢复、暂停后纵向展开、六阶段推进、往返、离场停止、普通浏览器后退与离线资源通过。BFCache 在本环境未命中，实现保留 `pageshow` 恢复路径。

源文件语法、正文与后两区一致性、字体与九张原图哈希、浏览器只读请求均通过；完整结果见 [checks.json](checks.json)、[audit.json](audit.json)。本轮按要求只验收桌面。复现入口见 [source/README.md](source/README.md)。
