# 私域汇总与月度成本修复

> 验收补正：独立趋势区、单月图及来源收起后的留白仍有问题，原“已自检”不足以覆盖这些设计判断。后续已按用户进一步确认改为每行三项、右侧小图和精简历史；原证据保留，当前结论见[修正批次](../2026-11-06_17-08_compact-cost-results/README.md)。

状态：**已自检／已发布**。应用 `38442e2`，回归夹具 `78ef96d`，分支 `codex/monthly-costs-repair`，基线 `8ff500d`。正式部署 `dpl_FSnaghNTpzwW2A9zQBEbXYtyUVGN` READY，正式域名指向一致。[部署回执](release/deployment.json)

## 修改与核对

- 仅当月有真实日度记录或已填人数的推广用途进入汇总；无事实的空讲义不再阻断成本，真实0及真实推广缺人数继续保留。读取不改写原数据，正常保存规范化并留历史。
- 六项结果共用主值基线：总消耗、开口／留资成本及三项私域成本；人数留在对应格内。五项六个月趋势按两项平台／三项私域组织，缺数断线；来源默认折叠，局部保存保持展开状态。
- 仅完整自然月环比。消耗及平台成本不再被上月缺少私域人数阻断；实时历史不铺空需求表，旧原值只读折叠。旧封存网页／PDF不补算。
- 保存成功而刷新失败会明确提示，只重读重试；慢保存／刷新期间的新输入、未保存保护及焦点保留。直接进入月度页也已接公共气泡控制器。

所有样本来自 `tests/private-sources.fixture.ts` 和仅课程／空讲义专项，使用本机独立PostgreSQL；不是正式经营数据。两门课程消耗1,483.39／4,097.14元，推广人数4／3／2，合计成本1,395.13／1,860.18／2,790.27元；159人非推广在月度与冻结月会中一致，且不进入推广分母。

## 页面证据

以下稳定图均已查看；超长页按实际结果区裁切辅助审查，原整页保留。手机仅检查明显遮挡、页面溢出和关键入口，不代表完整手机排版通过。

| 视图／状态 | 实际视口与截图 | 状态 |
| --- | --- | --- |
| 月度默认折叠 | [1920](screenshots/monthly-collapsed-1920.png) · [1440](screenshots/monthly-collapsed-1440.png) · [1024](screenshots/monthly-collapsed-1024.png) · [1920局部](screenshots/monthly-results-1920.png) | 已自检 |
| 月度展开来源 | [1920](screenshots/monthly-expanded-1920.png) · [1440](screenshots/monthly-expanded-1440.png) · [1024](screenshots/monthly-expanded-1024.png) | 已自检；159人独立 |
| 当前结果布局月会 | [1920](screenshots/meeting-1920.png) · [1440](screenshots/meeting-1440.png) · [1024](screenshots/meeting-1024.png) | 已自检；展示冻结后的同组样本 |
| 录入抽屉 | [1920](screenshots/editor-1920.png) · [1440](screenshots/editor-1440.png) · [1024](screenshots/editor-1024.png) | 已自检；无空讲义 |
| 历史缺少私域 | [1920](screenshots/history-missing-1920.png) · [1440](screenshots/history-missing-1440.png) · [1024](screenshots/history-missing-1024.png) | 已自检；保留平台比较，无空学科需求表 |
| 长金额与旧封存 | [长金额历史](screenshots/history-long-1440.png) · [旧封存](screenshots/legacy-frozen-1440.png) | 已自检；旧封存刻意保留原展示 |
| 写入成功／刷新失败 | [1440](screenshots/saved-refresh-failed-1440.png) | 已自检；重试无第二次PATCH |
| 手机有限检查 | [月度390](screenshots/monthly-mobile-390.png) · [录入390](screenshots/editor-mobile-390.png) | 仅明显问题检查 |

趋势气泡的[键盘操作过程图](process/trend-keyboard-popover-1440.png)只作交互过程证据，不作为动画稳定终态。新旧打印模板分开：本批3份16页实际运行包PDF已渲染审查，六项结果和五项趋势在同一页，来源完整展开；[课程成本6页](pdf/meeting-costs.pdf) · [长金额5页](pdf/meeting-long.pdf) · [旧口径5页](pdf/meeting-legacy.pdf)。[逐页审查1](review/pdf-contact-1.jpg)／[2](review/pdf-contact-2.jpg)／[3](review/pdf-contact-3.jpg)／[4](review/pdf-contact-4.jpg)

## 操作与验证

- [实际录入、刷新失败重试与未保存保护录像](video/save-retry-flow.webm)；[直接进入、刷新与站内导航录像](video/first-paint.webm)。过程与稳定图分开审查；同范围更新不重播已有趋势。最新录像另按4fps／10fps采样复看：[操作1](review/video-flow-01.jpg)／[2](review/video-flow-02.jpg)，[首屏1](review/video-paint-01.jpg)／[2](review/video-paint-02.jpg)。
- 269项规则、后续9项相关规则复验、15组既有来源浏览器与2组无消耗／真实0对照、5组旧版兼容及6组真实封存流程通过；公共UI、schema、Node构建与最终Vercel类型／构建通过。最终运行包12组专项使用实际HTTP与隔离数据库，含键盘气泡／折叠、503、慢刷新新输入、切月竞争、冻结与三档桌面。[专项记录](data/checks.json) · [兼容](data/compatibility.json) · [扫描](data/impeccable.json)
- 最终包React、Chromium压缩文件、正式域名及实际中文PDF核对通过。[运行包](release/runtime-bundle.json)
- 候选20项／7关键资源，正式20项／71资源哈希通过；七模块登录保护、业务API401、协作410、同源表单401／跨站403均符合预期。[候选](release/candidate.json) · [正式](release/production.json)
- 沿用原API、JSON版本和表结构，无物理迁移、共享库测试写入或批量清理。原工作区无关修改保留。

## 原验收纠正

[上一轮本地样张](../2026-11-06_13-22_private-sources/README.md)及[首次发布](../2026-11-06_14-24_private-sources-release/README.md)保留。原样本各用途都有实际费用及完整人数，遗漏“旧口径首次录入＋仅课程实际推广＋排期含讲义”，因此原完整性验收不能覆盖该路径。本批补上真实入口和已存空占位回归，并替换当前展示；未删除原证据。
