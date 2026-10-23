# 首页首屏参考：浅弧电影带

状态：**独立桌面样片，已自检，待用户反馈。** 用户已确定 A 的滚动逻辑，本轮只细化首屏封面的初态与自动播放；正式接入等待本轮反馈。

- [打开完整交互样片](preview/index.html)（可离线打开）；[本机运行入口](http://localhost:4331/preview/index.html)。
- [播放约 25 秒实际录屏](motion/cinematic-preview.mp4)：先看三次自动换位，再下滑、进入后两区、返回首屏继续播放。
- [首帧 1440px](screenshots/initial-1440.png)、[推进中](screenshots/advance-1440.png)、[录屏关键帧](motion/keyframes.png)。

## 这版的视觉判断

中央三张清晰、两侧逐渐缩小并融入深蓝背景；推进中以中央两张为主角。八张真实封面沿同一条浅弧循环，避免各自漂浮产生杂乱。完全停留约 **2.6 秒**，再用 **1.15 秒** 柔和推进一张，让相邻封面延续阅读。

下滑时保留当前精确构图，再按 A 原有距离收拢成一排；01–06 仍只跟随滚动。返回顶部从原相位继续。右下提供暂停／继续，减少动态效果时保留静态构图，并取消额外滚动占位。

浅弧关系参考 [Clément Grellier 的 3D Gradient Carousel](https://tympanus.net/Tutorials/3DGradientCarousel/)。本样片的停留节奏、透明度、项目配色与 A 的滚动交接是针对当前首页的处理。

## 实际验收

来源：上一轮 A 预览 `c2ae43b`、现有 `src/data/home.ts`、八张已公开封面与自托管 MiSans。完整内容、入口状态及后两区 DOM 与 A 一致，公开资源 SHA-256 一致，见 [audit.json](audit.json)。只读静态预览。

| 桌面视口 | 初始 | 换位 | 归位 | 跨屏 | 后两区 | 减少动态 |
| --- | --- | --- | --- | --- | --- | --- |
| 1440×900 | [初态](screenshots/initial-1440.png) | [推进](screenshots/advance-1440.png) | [归位](screenshots/settled-1440.png) | [交接](screenshots/handoff-1440.png) | [布局](screenshots/lower-1440.png) | [静态](screenshots/reduced-1440.png) |
| 1280×800 | [初态](screenshots/initial-1280.png) | [推进](screenshots/advance-1280.png) | [归位](screenshots/settled-1280.png) | [交接](screenshots/handoff-1280.png) | [布局](screenshots/lower-1280.png) | [静态](screenshots/reduced-1280.png) |
| 1024×768 | [初态](screenshots/initial-1024.png) | [推进](screenshots/advance-1024.png) | [归位](screenshots/settled-1024.png) | [交接](screenshots/handoff-1024.png) | [布局](screenshots/lower-1024.png) | [静态](screenshots/reduced-1024.png) |

三档桌面无横向溢出，中央封面避开目标文案和流程轨道；MiSans 实际加载。已查看初态、推进、滚动中、归位、跨屏、静态、[缺图回退](screenshots/image-failed-1440.png)及录像关键帧。按用户要求仅验收桌面。

实际浏览器核对：八步完整循环回到原构图、停留时无漂移、暂停超过一周期仍静止、键盘恢复、自动播放不改变策划阶段、滚动期间冻结轮播、六阶段完整推进、返回顶部、离线资源。普通前进／后退后的轮播与滚动通过；本环境未触发 BFCache 命中，不将其记为缓存恢复验收通过。实现已保留 `pageshow` 恢复路径。

页面高度沿用 A：1440×900 为 2608px、后两区 924px；1280×800 为 2428px；1024×768 为 2360px。完整实测见 [checks.json](checks.json)；录像抽样见 [motion/keyframes.json](motion/keyframes.json)。

源码语法检查、内容／资源核对和本轮浏览器检查通过；本轮只增加独立参考，生产组件未变更。源文件与复现入口见 [source](source/README.md)。
