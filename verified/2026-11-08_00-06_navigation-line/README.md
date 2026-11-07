# 切页 A：细线与柔和交接

已自检，准备发布；待用户反馈。应用代码 `bb2bd399fab1a5ff86540e77e1b1a5522d08eab7`，基于 main `791efd5`，根工作区并行修改保持。

用户撤销B，本次移除逐页布局占位、复制的Toolbar及相关专用样式，恢复真实Toolbar原接口。A只保留一套公共反馈：原页继续显示，超过120ms在顶栏下沿显示3px蓝色流动细线，超过1200ms补充短提示，就绪后原位交接、正文180ms轻淡入。快速就绪不补播，连续改选不中断细线；减少动态效果使用静态细线和直接交接。

## 录像和截图

同一“排期管理 → 非推广复盘”路径、同一8篇隔离样本，录像原速。

| 场景 | 录像 | 关键图 |
| --- | --- | --- |
| 1440，80ms控制延迟 | [播放](video/admin-1440-80.mp4) | [结果](screenshots/admin-1440-80-complete.png) |
| 1440，800ms | [播放](video/admin-1440-800.mp4) | [加载](screenshots/admin-1440-800-loading.png) |
| 1440，2500ms | [播放](video/admin-1440-2500.mp4) | [加载](screenshots/admin-1440-2500-loading.png)／[结果](screenshots/admin-1440-2500-complete.png) |
| 1920，2500ms | [播放](video/admin-1920-2500.mp4) | [加载](screenshots/admin-1920-2500-loading.png) |
| 1024，2500ms | [播放](video/admin-1024-2500.mp4) | [加载](screenshots/admin-1024-2500-loading.png) |
| 减少动态效果 | [播放](video/reduced-1440.mp4) | [静态细线](screenshots/reduced-1440-loading.png) |
| 取消、连续改选及前后退 | [播放](video/rapid-1440.mp4) | [取消返回](screenshots/cancel-return-1440.png)／[最后目标](screenshots/rapid-latest-1440.png) |
| 未保存输入取消离开 | [播放](video/draft-1440.mp4) | [输入保留](screenshots/draft-retained-1440.png) |

[简短动图](video/navigation-a.gif)。全部53张状态图、8段录像和911抽样帧已实际查看，索引见[manifest](inspection/manifest.json)。稳定截图等待有限动画完成，过程录像单独保留。

## 验证

- 实际Vercel运行包与本机隔离夹具，管理员／员工、1440／1920／1024px，80／800／2500ms。29组导航检查、真实MiSans字形、原页保留、3px细线位置及宽度、快速不补播、取消与失败回退、连续改选、前后退、七模块键盘及草稿保护通过，浏览器错误0。[结果](checks/navigation.json)。快慢按HTML与样式实际就绪时间判断。
- 390px仅查明显遮挡、页面级溢出及底部导航可达，覆盖常规／减少动态效果；不宣称完整手机排版验收。
- 296项规则、类型0错误／0警告、最终Vercel构建、公共UI、网络传输通过；悬停无预读，实际切页仅一次HTML读取。部署包外置依赖、Chromium及真实中文PDF生成烟测通过（611865字节），不以此宣称PDF版式已审查。
- B的旧证据标为撤销历史，源码快照改为只读.txt，不参与正式构建。未改业务规则、数据库或部署架构，生产业务测试写入0。

## 发布核对

完成候选与正式核对后追加结果。登录后的视觉验证使用上述隔离运行包，正式请求核对访问保护和资源哈希。
