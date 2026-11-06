# 成本走势与来源就近阅读

状态：**已自检／已发布，待用户反馈**。应用 `bd311e6`，回归 `4c3e358`；正式组件与实际 Vercel 运行包，本机隔离 PostgreSQL 虚构样本。真实经营数据另走已授权的正常保存流程，未混入本批公开截图或测试数据。

## 本批修正

- 桌面结果每行三项，金额旁的折线填满剩余宽度，取消固定靠右的小框；总消耗及五项单位成本均支持56px走势。默认无月份、刻度或重复名称；真实月份和金额通过悬停／键盘查看。
- 最多六个月，各指标仅取第一个至最后一个有效月；两个月铺满两个月，真实0保留，内部未知断线。不足两点在右侧显示“暂无对比数据”。
- 月会来源入口直接接在结果表下面，共用结果外壳；来源仍可独立展开，默认收起。历史抽屉仅六项数值及必要人数。
- 累计费用先归整为分再计算单位成本，修复浮点累计在半分处向下误舍入。冻结事实及旧PDF不改写；旧材料缺新字段仍走原兼容分支。

本批替换[上一批](../2026-11-06_17-08_compact-cost-results/README.md)固定右侧小图、默认日期及独立来源卡；原证据保留。

## 已实际查看

| 视图／状态 | 证据 | 检查范围 |
| --- | --- | --- |
| 两个月六条走势、默认折叠 | 月度[1920](screenshots/monthly-two-months-1920.png)／[1440](screenshots/monthly-two-months-1440.png)／[1024](screenshots/monthly-two-months-1024.png)／[结果局部](screenshots/monthly-results-1920.png) | 1920与1440三列，1024整格两列；无默认月份或多余空月 |
| 月会结果与来源同壳 | [1920](screenshots/meeting-two-months-1920.png)／[1440](screenshots/meeting-two-months-1440.png)／[1024](screenshots/meeting-two-months-1024.png)／[局部](screenshots/meeting-results-1440.png) | 来源直接位于表下，无独立来源标题卡 |
| 平台多月、私域单月 | 月度[1920](screenshots/monthly-collapsed-1920.png)／[1440](screenshots/monthly-collapsed-1440.png)／[1024](screenshots/monthly-collapsed-1024.png)；月会[1440](screenshots/meeting-1440.png) | 私域右侧仅“暂无对比数据” |
| 六项走势及内部缺月 | [月度](screenshots/monthly-five-trends-1440.png)／[月会](screenshots/meeting-five-trends-1440.png)／[缺月](screenshots/monthly-gap-1440.png) | 0／1／2／6有效月、真实0及断线；文件名保留测试用例原名，已包含总消耗 |
| 来源展开及收回 | 月度[全部展开](screenshots/monthly-source-1440-both.png)／[重新收起](screenshots/monthly-source-1440-reclosed.png)；月会[全部展开](screenshots/meeting-source-1440-both.png)／[重新收起](screenshots/meeting-source-1440-reclosed.png) | 两行44px、分割线及展开间距连续 |
| 精简历史 | [1920](screenshots/history-costs-1920.png)／[1440](screenshots/history-costs-1440.png)／[1024](screenshots/history-costs-1024.png)／[长金额](screenshots/history-long-1440.png)／[缺值](screenshots/history-missing-1440.png) | 无趋势、环比或空来源表 |
| 录入与读取失败 | [1920](screenshots/editor-1920.png)／[1440](screenshots/editor-1440.png)／[1024](screenshots/editor-1024.png)／[已存但读取失败](screenshots/saved-refresh-failed-1440.png) | 重试只读，输入与未保存保护保留 |
| 手机有限回归 | [月度390](screenshots/monthly-mobile-390.png)／[录入390](screenshots/editor-mobile-390.png) | 仅明显遮挡、页面溢出与关闭保存入口，不代表完整手机排版验收 |

46张稳定截图（包含2张同源局部及2张共享兼容图）、2张过程气泡图已实际查看；[九张截图审查拼页](review/screens-01.jpg)供定位。原图没有改DOM文字或拼图替代实际状态。

## 录像与PDF

- [展开收起、保存失败重试、慢输入及键盘](video/save-retry-flow.webm)：按4fps连续取样审查，[帧页1](review/flow-01.jpg)／[2](review/flow-02.jpg)／[3](review/flow-03.jpg)。
- [首屏直接进入、刷新和站内导航](video/first-paint.webm)：按10fps取样审查，[帧页1](review/paint-01.jpg)／[2](review/paint-02.jpg)；另有慢字体及慢数据首屏回归。过程中过渡帧不作为稳定截图。
- 实际服务端生成并查看4份20页PDF：[单月私域](pdf/meeting-costs.pdf)5页／[六项走势](pdf/meeting-five-trends.pdf)6页／[旧冻结](pdf/meeting-legacy.pdf)5页／[长金额](pdf/meeting-long.pdf)4页。金额与对应图同页，来源完整展开；逐页渲染保存在 `review/`，没有重写已有归档PDF。

## 验证

- 类型／Node构建、Vercel发布构建、schema检查通过；[269项规则](data/rules.txt)及[7项私域复验](data/cents-regression.txt)通过（后者含新增半分舍入用例）。
- [实际运行包15组专项](data/browser-final.txt)与[完整私域15组回归](data/browser-private-sources.txt)通过，覆盖首次旧口径录入、两门仅课程、空讲义、真实0、各项完整性、隔离159人非推广、保存成功读取503、只读重试、慢输入、切月旧响应、双角色、冻结和PDF。
- [运行包依赖与实际PDF](data/runtime-bundle.json)、[Impeccable布局扫描](data/impeccable.json)、[状态与坐标](data/checks.json)；截图、过程帧和20页PDF均已实际审查。桌面1920／1440／1024；[共享例会13组回归](data/shared-meeting.json)通过；[原周会图](screenshots/weekly-shared-chart-1440.png)、[键盘气泡](process/weekly-lead-keyboard-1440.png)及[缺历史旧材料](screenshots/waste-no-history-1440.png)已查看。该套用例另自动覆盖2560／320等视口，未逐图审查的额外捕获留在调试目录，不计入本批视觉通过。

候选部署 `dpl_HzyjcTiYc1S5q8nhd95JfzxcV2i9` READY，[20项与7个关键资源](release/candidate.json)通过。[正式地址20项与71资源](release/production.json)通过，域名指向同一部署；[发布回执](release/deployment.json)。
