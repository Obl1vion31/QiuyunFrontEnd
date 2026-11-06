# 私域来源与成本：本地样张

状态：**已自检／待用户反馈**。本轮仅运行本机隔离数据库和正式组件，正式发布暂停；没有向共享 Neon 写入测试数据。

代码：本地分支 `codex/private-sources-preview`，应用提交 `7402750`，基线 `67d94da`。独立工作树保留原工作区修改。本页截图均为真实渲染；局部图由同一次整页截图按实际组件坐标裁切，完整页面也单独保留。

## 建议先看

- [月度运营完整页](screenshots/monthly-complete-1440.png) · [私域局部](screenshots/monthly-private-1440.png)
- [实际月会完整页](screenshots/meeting-current-1440.png) · [核心结果](screenshots/meeting-core-1440.png) · [来源明细](screenshots/meeting-sources-1440.png)
- [推广录入](screenshots/editor-promotion-1440.png) · [非推广录入](screenshots/editor-organic-1440.png) · [长金额录入](screenshots/editor-long-1440.png)
- [固定桌面操作录像](video/clean-flow.mp4) · [首屏、刷新、导航与慢数据](video/first-paint.mp4) · [慢字体资源到完整水合](video/slow-delivery.mp4)
- 实际月会PDF：[完整来源，6页](pdf/meeting-sealed.pdf) · [长金额，5页](pdf/meeting-long.pdf) · [旧口径，5页](pdf/meeting-legacy.pdf)

## 视觉验收标准与本轮结果

| 重点 | 通过条件 | 实际结果 |
| --- | --- | --- |
| 页面连续性 | 公共全宽、桌面24px边距；一级面板同边界；延续MiSans及既有控件 | 三档桌面实际查看；公共UI回归比较正文与实际一级内容，见[坐标](data/public-ui-geometry.json) |
| 月度组织 | 执行指标、关注条及双图保留；私域在双图后、追溯明细前；标题旁录入 | 已自检 |
| 月会组织 | 总消耗＋三项单位成本优先，来源人数作依据；原结论、执行、空跑、计划、事项保留 | 已自检；月会不复制人数表单 |
| 来源与层级 | 推广按学科小计，课程／讲义／模考默认可见；非推广独立五列 | 已自检；159人案例独立保留 |
| 数值与环比 | 主值同基线、差值就近；金额不拆行、不缩字；成本升红／降绿并附箭头及符号 | 月度、月会、历史共用组件；1024px与历史Sheet长金额实际查看，宽表内部横滚 |
| 零与未知 | 0和空框独立；零分母及未知成本为“—”；无消耗记录不补0，明确登记0元才计算零成本；无可比上月不显示伪环比 | 11月、6月及抽屉实际查看；按完整自然月比较 |
| 录入 | 公共右侧Sheet，固定头尾、正文单层滚动；只填明细人数 | 三档桌面两组表单；长名称／金额、增删改、503重试、慢保存新输入、键盘及焦点返回已查 |
| 连续操作 | 保存不改变位置、其他图表及输入；未保存取消保留 | 实录保存前后scrollY均为670；关闭／Escape取消、实际站内导航后退取消已查 |
| 新旧与冻结 | 旧数据只读参考、不自动当推广；未封存跟随新材料、封存后不变 | 正式读模型＋隔离快照对照；原有真实预排期→核对→封存接口流程也使用新口径通过 |
| 手机 | 仅检查明显遮挡、页面级溢出、关闭／保存入口可达 | 390px有限检查；不代表完整手机排版验收 |
| PDF | 正式服务端渲染、文字可读、金额完整、分页不截断行 | 3份共16页已渲染逐页查看；来源表跨页保持表头 |
| 首屏 | 从首次绘制核对字体与布局；与稳定图分开 | 直接进入、CDP忽略缓存硬刷新、站内导航、1.2s数据延迟；另实测字体脚本及React资源慢传输 |

## 数据与功能核对

全部数据由仓库 `tests/private-sources.fixture.ts` 在本机独立临时PostgreSQL中构造，不是实际经营结果。月会与运营页读取同一组数据；会议快照由正式读模型生成。旧版样本去除新来源字段，核对旧冻结展示；正式封存流程另由 `scheduling-review.integration.ts` 验证。

- 8月精确案例：TMUA 14,000元、3／3／2；面试课5,000元、1／1／0。合计19,000元，推广4／4／2，成本4,750／4,750／9,500元；独立159名自然来源不进入分母，更正为999也不改变推广成本。
- 10月完整展示组：课程、讲义、模考并存，消耗26,700元，推广人数36／17／6，单位成本741.67／1,570.59／4,450元；9月构造可比较的完整自然月。页面与月会相同；保存后截图单独标为3→4更正状态。
- 11月为月中部分录入，真实0与null并存；6月使用12,345,678.90元及长来源；7月为未拆来源旧口径。
- 人数仍按行为发生月人工汇总，学科和总计按明细人次自动相加，三阶段独立。非推广不计算推广成本；没有新增客户档案或预算字段。

已执行：267项规则／接口测试，最终7项成本相关复验；15组来源浏览器检查及2组未登记／真实0消耗对照；6组现有封存流程集成检查；公共UI浏览器回归；类型检查（0错误、0警告，44条提示）；Node与Vercel本地构建。Impeccable机械扫描无发现。未登记消耗与真实0的最终接口／页面对照见[缺费专项](data/missing-spend.json)。详见[专项结果](data/checks.json)、[补充检查](data/supplemental.json)、[保存位置](data/clean-flow.json)、[扫描](data/impeccable-detector.json)。

慢资源检查采用冷缓存、180ms延迟、约1Mbps，覆盖实际字体脚本／CSS及React组件到达。该压力条件下首次内容绘制约16.5秒，水合与有限动画完成约20秒；录屏核对字形与位置，不将它表述为加载速度通过。常用MiSans字形随脚本同步注册，非独立woff请求。记录见[慢资源测量](data/slow-delivery.json)。稳定图另行采集，首屏过程截图只作为过程证据。

## 截图覆盖

下表每项均已查看；所有条目继续待用户反馈。完整数据与两组录入覆盖1920／1440／1024px；缺值、旧口径与历史Sheet以1440px检查。长金额运营页额外覆盖三档及横滚右端。未将这些结果扩称为所有状态、所有尺寸均通过。

| 图片 | 视图与状态 | 视口 | 数据来源 | 状态 |
| --- | --- | --- | --- | --- |
| [editor-added-source-1440](screenshots/editor-added-source-1440.png) | 录入Sheet：新增来源及备注 | 1440px | 隔离PG／10月临时来源 | 已自检／待用户反馈 |
| [editor-legacy-1440](screenshots/editor-legacy-1440.png) | 录入Sheet：旧口径参考＋空白新录入 | 1440px | 隔离PG／7月旧口径 | 已自检／待用户反馈 |
| [editor-long-1440](screenshots/editor-long-1440.png) | 录入Sheet：长金额、长来源 | 1440px | 隔离PG／6月长值 | 已自检／待用户反馈 |
| [editor-mobile-390](screenshots/editor-mobile-390.png) | 录入Sheet：推广组 | 390px | 隔离PG／10月完整来源 | 已自检／待用户反馈 |
| [editor-organic-1024](screenshots/editor-organic-1024.png) | 录入Sheet：非推广组 | 1024px | 隔离PG／10月完整来源 | 已自检／待用户反馈 |
| [editor-organic-1440](screenshots/editor-organic-1440.png) | 录入Sheet：非推广组 | 1440px | 隔离PG／10月完整来源 | 已自检／待用户反馈 |
| [editor-organic-1920](screenshots/editor-organic-1920.png) | 录入Sheet：非推广组 | 1920px | 隔离PG／10月完整来源 | 已自检／待用户反馈 |
| [editor-partial-1440](screenshots/editor-partial-1440.png) | 录入Sheet：0与未知分别录入 | 1440px | 隔离PG／11月部分录入 | 已自检／待用户反馈 |
| [editor-promotion-1024](screenshots/editor-promotion-1024.png) | 录入Sheet：推广组 | 1024px | 隔离PG／10月完整来源 | 已自检／待用户反馈 |
| [editor-promotion-1440](screenshots/editor-promotion-1440.png) | 录入Sheet：推广组 | 1440px | 隔离PG／10月完整来源 | 已自检／待用户反馈 |
| [editor-promotion-1920](screenshots/editor-promotion-1920.png) | 录入Sheet：推广组 | 1920px | 隔离PG／10月完整来源 | 已自检／待用户反馈 |
| [editor-save-failed-1440](screenshots/editor-save-failed-1440.png) | 录入Sheet：保存503失败保留输入 | 1440px | 隔离PG／10月故障注入 | 已自检／待用户反馈 |
| [editor-unsaved-preserved-1440](screenshots/editor-unsaved-preserved-1440.png) | 录入Sheet：取消离开保留输入 | 1440px | 隔离PG／10月更正 | 已自检／待用户反馈 |
| [meeting-core-1024](screenshots/meeting-core-1024.png) | 月例会：核心结果 | 1024px | 隔离PG／10月完整来源 | 已自检／待用户反馈 |
| [meeting-core-1440](screenshots/meeting-core-1440.png) | 月例会：核心结果 | 1440px | 隔离PG／10月完整来源 | 已自检／待用户反馈 |
| [meeting-core-1920](screenshots/meeting-core-1920.png) | 月例会：核心结果 | 1920px | 隔离PG／10月完整来源 | 已自检／待用户反馈 |
| [meeting-current-1024](screenshots/meeting-current-1024.png) | 月例会：完整会议 | 1024px | 隔离PG／10月完整来源 | 已自检／待用户反馈 |
| [meeting-current-1440](screenshots/meeting-current-1440.png) | 月例会：完整会议 | 1440px | 隔离PG／10月完整来源 | 已自检／待用户反馈 |
| [meeting-current-1920](screenshots/meeting-current-1920.png) | 月例会：完整会议 | 1920px | 隔离PG／10月完整来源 | 已自检／待用户反馈 |
| [meeting-history-long-1440](screenshots/meeting-history-long-1440.png) | 历史月份Sheet：长金额 | 1440px | 隔离PG／6月长值 | 已自检／待用户反馈 |
| [meeting-legacy-1440](screenshots/meeting-legacy-1440.png) | 月例会：旧版封存记录 | 1440px | 隔离PG／7月旧快照 | 已自检／待用户反馈 |
| [meeting-long-1440](screenshots/meeting-long-1440.png) | 月例会：长金额完整会议 | 1440px | 隔离PG／6月新快照 | 已自检／待用户反馈 |
| [meeting-partial-1440](screenshots/meeting-partial-1440.png) | 月例会：意向缺数、部分零成交 | 1440px | 隔离PG／10月实时缺值 | 已自检／待用户反馈 |
| [meeting-partial-core-1440](screenshots/meeting-partial-core-1440.png) | 月例会：意向缺数、部分零成交 | 1440px | 隔离PG／10月实时缺值 | 已自检／待用户反馈 |
| [meeting-sealed-1440](screenshots/meeting-sealed-1440.png) | 月例会：补录后冻结原值 | 1440px | 隔离PG／10月冻结快照 | 已自检／待用户反馈 |
| [meeting-sources-1024](screenshots/meeting-sources-1024.png) | 月例会：来源明细 | 1024px | 隔离PG／10月完整来源 | 已自检／待用户反馈 |
| [meeting-sources-1440](screenshots/meeting-sources-1440.png) | 月例会：来源明细 | 1440px | 隔离PG／10月完整来源 | 已自检／待用户反馈 |
| [meeting-sources-1920](screenshots/meeting-sources-1920.png) | 月例会：来源明细 | 1920px | 隔离PG／10月完整来源 | 已自检／待用户反馈 |
| [monthly-after-save-1440](screenshots/monthly-after-save-1440.png) | 月度运营：保存后原位回显 | 1440px | 隔离PG／10月加微3→4 | 已自检／待用户反馈 |
| [monthly-complete-1024](screenshots/monthly-complete-1024.png) | 月度运营：完整页 | 1024px | 隔离PG／10月完整来源 | 已自检／待用户反馈 |
| [monthly-complete-1440](screenshots/monthly-complete-1440.png) | 月度运营：完整页 | 1440px | 隔离PG／10月完整来源 | 已自检／待用户反馈 |
| [monthly-complete-1920](screenshots/monthly-complete-1920.png) | 月度运营：完整页 | 1920px | 隔离PG／10月完整来源 | 已自检／待用户反馈 |
| [monthly-employee-1440](screenshots/monthly-employee-1440.png) | 月度运营：员工共享结果 | 1440px | 隔离PG／10月完整来源 | 已自检／待用户反馈 |
| [monthly-legacy-1440](screenshots/monthly-legacy-1440.png) | 月度运营：旧口径参考入口 | 1440px | 隔离PG／7月旧口径 | 已自检／待用户反馈 |
| [monthly-legacy-private-1440](screenshots/monthly-legacy-private-1440.png) | 月度运营：旧口径参考入口 | 1440px | 隔离PG／7月旧口径 | 已自检／待用户反馈 |
| [monthly-legacy-reference-1440](screenshots/monthly-legacy-reference-1440.png) | 月度运营：原口径只读展开 | 1440px | 隔离PG／7月旧口径 | 已自检／待用户反馈 |
| [monthly-long-1024](screenshots/monthly-long-1024.png) | 月度运营：长金额与长来源 | 1024px | 隔离PG／6月长值 | 已自检／待用户反馈 |
| [monthly-long-1440](screenshots/monthly-long-1440.png) | 月度运营：长金额与长来源 | 1440px | 隔离PG／6月长值 | 已自检／待用户反馈 |
| [monthly-long-1920](screenshots/monthly-long-1920.png) | 月度运营：长金额与长来源 | 1920px | 隔离PG／6月长值 | 已自检／待用户反馈 |
| [monthly-long-private-1440](screenshots/monthly-long-private-1440.png) | 月度运营：长金额与长来源 | 1440px | 隔离PG／6月长值 | 已自检／待用户反馈 |
| [monthly-long-right-1024](screenshots/monthly-long-right-1024.png) | 月度运营：长金额横滚右端 | 1024px | 隔离PG／6月长值 | 已自检／待用户反馈 |
| [monthly-long-right-1920](screenshots/monthly-long-right-1920.png) | 月度运营：长金额横滚右端 | 1920px | 隔离PG／6月长值 | 已自检／待用户反馈 |
| [monthly-mobile-390](screenshots/monthly-mobile-390.png) | 月度运营：有限手机检查 | 390px | 隔离PG／10月完整来源 | 已自检／待用户反馈 |
| [monthly-partial-1440](screenshots/monthly-partial-1440.png) | 月度运营：部分缺值／零成交／月中无环比 | 1440px | 隔离PG／11月部分录入 | 已自检／待用户反馈 |
| [monthly-partial-private-1440](screenshots/monthly-partial-private-1440.png) | 月度运营：部分缺值／零成交／月中无环比 | 1440px | 隔离PG／11月部分录入 | 已自检／待用户反馈 |
| [monthly-private-1024](screenshots/monthly-private-1024.png) | 月度运营：私域局部 | 1024px | 隔离PG／10月完整来源 | 已自检／待用户反馈 |
| [monthly-private-1440](screenshots/monthly-private-1440.png) | 月度运营：私域局部 | 1440px | 隔离PG／10月完整来源 | 已自检／待用户反馈 |
| [monthly-private-1920](screenshots/monthly-private-1920.png) | 月度运营：私域局部 | 1920px | 隔离PG／10月完整来源 | 已自检／待用户反馈 |
| [monthly-unrecorded-private-1440](screenshots/monthly-unrecorded-private-1440.png) | 月度运营：未登记消耗 | 1440px | 隔离PG／2025-01边界 | 已自检／待用户反馈 |
| [monthly-zero-spend-private-1440](screenshots/monthly-zero-spend-private-1440.png) | 月度运营：明确登记0元 | 1440px | 同一边界先后对照 | 已自检／待用户反馈 |
| [editor-unrecorded-1440](screenshots/editor-unrecorded-1440.png) | Sheet：只读消耗保留未知 | 1440px | 隔离PG／2025-01边界 | 已自检／待用户反馈 |

首屏过程单独保留：[冷进入](process/first-paint-cold-1440.png)、[慢数据等待](process/first-paint-slow-data-1440.png)、[数据切换过程](process/first-paint-final-1440.png)、[慢资源完成](process/first-paint-slow-delivery-1440.png)。这些图片不是最终稳定页的替代品。

## 视频与PDF审查

固定视口操作视频为1440×1000、约15秒，覆盖未保存取消、失败重试、来源添加／移除、原位保存、月会与历史。首屏视频约5秒，慢字体资源视频约4.5秒（保留首次可见绘制到完整交互；等待时长另在性能记录中）。视频已解码检查，并按2／5／10fps提取操作与首屏关键帧审查；没有将混合视口的测试调试录像作为交付视频。

PDF共16页的审阅预览：[完整来源](pdf/meeting-sealed.png)、[长金额](pdf/meeting-long.png)、[旧口径](pdf/meeting-legacy.png)。各页PNG与实际PDF一同保留在pdf目录；页面图、原始WebM和MP4保留各自用途。

## 本地查看与复验

本次隔离预览：<http://127.0.0.1:38309/business/monthly-operations?month=2026-10>，月会入口见同库页面。仅本机进程存续期间可访问；隔离账号定义见仓库 `tests/auth.fixture.ts`。不使用正式账号或正式数据库。

复验使用Node22，先构建，再设置本机 `TEST_POSTGRES_URL` 和 `PLAYWRIGHT_MODULE` 执行 `pnpm test:private-sources`。夹具创建独立临时库并在正常退出时清理；`PRIVATE_SOURCE_KEEP_SERVER=1` 可保留本地预览。操作和首屏原始调试产物位于被忽略的 `.tools/test-artifacts/private-sources-final/`。

正式发布继续暂停，待用户查看样张后另行指示。
