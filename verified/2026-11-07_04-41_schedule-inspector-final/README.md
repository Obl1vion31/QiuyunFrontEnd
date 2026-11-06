# 排期 Inspector：最终验收修正

状态：已自检并发布，main同步中。图像均为隔离样张。

[清晰详情原图](detail-1440.png) · [桌面前后对比器](comparison.html) · [真实操作录像](media/interaction-1440.mp4) · [深滚动返回](media/deep-scroll-1440.mp4)

以最新正式功能a55ad52为基线，最终应用e541f99；合并保留V0、待核对可编辑、原因与权限规则。两版使用相同隔离PostgreSQL样本、稳定业务ID、账号和固定时钟，三档视口为1920／1440／1024×1000。[样本依据](checks/sample.json)。interaction及history来自独立真实业务回归样本。

## 具体修正

| 内容 | 最终行为 |
| --- | --- |
| 同级信息 | 运营类型与复盘计划、版本与改帖、历史记录统一14px／600及正文深色、同一分隔与间距；危险操作另收 |
| 版本关系 | V0紧邻区块标题；移除重复“版本关系”标题及嵌套留白，多版本仍可完整读取 |
| 单层呈现 | 680px原生模态Sheet，详情／编辑／发布／改帖同层；日历、顶栏和侧栏不参与挤压动画 |
| 交互与保存 | 外层220ms、内部120ms；取消回详情，×／Esc／遮罩关全层，脏输入仅确认一次；局部同步保留整月草稿、选中、滚动和焦点 |
| 异步反馈 | 慢执行读取只显示小型局部反馈，已知摘要可见；对象资格与权限合并，不重新显示不适用的复盘控件 |
| 门禁与历史 | 实发登记后才能改帖；建立排期直接列填写内容，后续只列真实前后值，助手共用摘要，历史数据不改写 |

先前截图暴露的同级样式混杂及版本区过高属于验收遗漏，本批已重做。截图等待字体、数据和有限动画完成；录像检查加载与切换过程。其他页面Inspector保留原呈现。

## 实际验证

- 合并阶段285项规则、schema、公共UI、月度流程、首轮工作区、动效及运营类型通过；最终构建0错误／0警告。
- 最终Vercel实际运行包五项全部通过：双角色三档单层操作、未发布门禁、13组首轮工作区、月度封存链路、V0专项。封存后真实保存保留核对表与行内历史展开，25＋4－1＝28，原V0不变。
- 覆盖真实发布与V1创建、断网、失败保留、写入成功后只重试读取、关闭后切帖和慢响应；2000ms慢读取保留已知摘要。
- 18组月历／台账深滚动、1600ms慢请求、×／取消／Esc检查页面及顶栏／侧栏坐标，误差≤1px；原上移故障未复现，不声称已经定位旧根因。
- 同尺寸前后截图、整页图、双角色真实表单与历史已查看；真实录像全程抽帧审查。390／320只检查明显遮挡、溢出及关闭入口。

[最终运行包](checks/runtime-checks.json) · [单层操作](checks/single-panel.json) · [门禁](checks/gate.json) · [V0](checks/v0.json) · [月度链路](checks/monthly.json) · [逐帧坐标](checks/deep-scroll.json)

## 性能

原生RAF／performance；固定业务Date，不模拟RAF，采样与录像分开。以下是三轮暖操作P95，完整首轮及原始数据保留。这是WSL headless Chromium同环境对照，不代表用户实机帧率。

| 宽度 | 打开发布登记，原版→候选 | 取消回详情，原版→候选 |
| --- | --- | --- |
| 1920 | 100.1 → 50.0 ms | 99.9 → 50.0 ms |
| 1440 | 100.1 → 33.4 ms | 99.9 → 33.4 ms |
| 1024 | 66.7 → 33.4 ms | 66.7 → 33.4 ms |

1920的部分操作仍约50–67ms，未达到约33ms目标，需用户实机复核。[完整采样](checks/performance.json)

## 关键状态

- [建立排期摘要](history/created-history-1440.png) ／ [后续更正](history/changed-history-1440.png)
- [保存成功但读取失败](interaction/saved-read-failure-1440.png)
- [慢请求：保留摘要](interaction/slow-detail-loading-1440.png)
- [实际操作MP4](media/interaction-1440.mp4) ／ [原始WebM](media/interaction-1440.webm)
- [深滚动MP4](media/deep-scroll-1440.mp4) ／ [原始WebM](media/deep-scroll-1440.webm)

正式部署dpl_5HHXizYxzYPDeEphwhAjKvf57d3Q READY，与候选一致；候选10项／4资源及正式99项／75资源核对通过。发布输入e541f99，无生产测试写入或迁移；main正在同步。

[发布记录](checks/release.json) · [正式核对](checks/production.json) · [候选核对](checks/candidate.json)
