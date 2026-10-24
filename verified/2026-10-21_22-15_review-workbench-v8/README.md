# 第八版复盘工作台 · 正式组件验收

状态：已自检，待用户验收。页面实现提交 `861b565`，分支 `agent/content-console-redesign`。数据为隔离 PGlite 中的虚构记录，上海业务时钟固定为 2026-10-21，截图来自正式 Astro 页面、业务 API 和共享组件。

## 主要场景

| 场景 | 截图 |
| --- | --- |
| 五篇测试，当前无待填 | [1440px](promotion/empty-1440.png) · [1920px](promotion/empty-1920.png) |
| 多条直接单行填写 | [1440px](promotion/ready-1440.png) |
| 测试、放量、暂停及待定 | [1440px](promotion/mixed-1440.png) · [1920px](promotion/mixed-1920.png) |
| 修改当日状态与保存回执 | [气泡](promotion/state-popover-1440.png) · [已保存](promotion/state-saved-1440.png) |
| 首次补 ID、残留与终态当日 | [Inspector](promotion/missing-id-inspector-1440.png) · [残留补录](promotion/residual-1440.png) · [终态数据](promotion/terminal-day-1440.png) |
| 非推广分类均值与明细 | [分类均值](non-promotion/summary-1440.png) · [分类明细](non-promotion/details-1440.png) · [历史数据总览](non-promotion/history-1440.png) |
| 公共反馈 | [慢读目标反馈](feedback/slow-read-1440.png) · [导航进度](feedback/navigation-progress-1440.png) |

## 宽度与字体

推广：[1280](promotion/mixed-1280.png) · [1024](promotion/mixed-1024.png) · [736](promotion/mixed-736.png) · [390](promotion/mixed-390.png) · [320](promotion/mixed-320.png)。窄屏真实首屏：[736](promotion/mixed-736-viewport.png) · [390](promotion/mixed-390-viewport.png) · [320](promotion/mixed-320-viewport.png)。

非推广：[1920](non-promotion/summary-1920.png) · [1280](non-promotion/summary-1280.png) · [1024](non-promotion/summary-1024.png) · [736](non-promotion/summary-736.png) · [390](non-promotion/summary-390.png) · [320](non-promotion/summary-320.png)。手机首屏：[390](non-promotion/summary-390-viewport.png) · [320](non-promotion/summary-320-viewport.png)。长截图保留真实固定底栏，首屏图用于核对其实际位置。

桌面五条常规概览连标题实测 396px，各行名称、轨迹、累计指标、状态与详情锚点一致。宽屏面板最大 1440px；短名称列不吸收剩余宽度。窄屏按区域重排，录入表和分类表在所属容器内横向查看，页面无横向溢出。已实际查看桌面、窄屏、手机、长金额、气泡与关键帧图像并修正发现的问题。

[大金额与六位人数](promotion/large-values-1440.png)；[125% 桌面缩放等效布局](promotion/zoom125-equivalent-1440.png) 使用 1152 CSS px、DPR 1.25 输出 1440 物理像素，检查文字放大后的布局与局部滚动。该项采用等效视口，未操控浏览器原生缩放菜单。字体已通过计算样式和 Chromium 实际字形来源检查为自托管 MiSans，详见 [字体记录](fonts.json) 与 [几何记录](geometry.json)。

## 动效与行为

[自然切入、阶段演变与详情开合录像](motion/trajectory-entry.webm)；节点关键帧：[0ms](motion/trajectory-000ms.png) · [120ms](motion/trajectory-120ms.png) · [300ms](motion/trajectory-300ms.png) · [480ms](motion/trajectory-480ms.png) · [650ms](motion/trajectory-650ms.png)；[减少动态效果](promotion/reduced-motion-1440.png)。自然录像与关键帧已实际查看，三节点约 600ms 完成，详情及填写不重播入场。

已验证暂停／待定新草稿默认零、已有值保留、非零跑量计原阶段、状态气泡排除当前状态、终态无后续动作、保存后 Esc 关闭及焦点返回；缺 ID 与指标原子提交、同笔记多版本残留选择、重复日期拒绝、并发同请求仅生成一条事实、累计成本按总量计算。[跨午夜开放](promotion/midnight-opened-1440.png) 保留原节点、输入、焦点，数量同步且不能越序。100／450ms 读取安静，800ms 只显示目标反馈，关闭与切换清理旧请求。

## 验证与发布边界

- 157 项规则、事务、权限与迁移测试通过；类型检查、构建及 `db:check` 通过。
- 正式复盘、公共 UI、时间线、阶段／例会快照浏览器回归通过；公共改动后完成认证、年度、工作流、发布、登记时限、交互、退役暂停接口、面板逐帧及共享读取专测。
- 兼容迁移使用隔离数据库核对旧事实与冻结快照保留，不补造历史零值。`0036_precise_promotion_review.sql` 已准备，共享库迁移、合并主分支及正式发布需后续授权；公网仍为此前发布版本。

完整行为结果见 [results.json](results.json)，检查清单见 [checks.json](checks.json)，动效对象记录见 [motion.json](motion.json)，代码树与媒体 SHA-256 见 [manifest.json](manifest.json)。
