# 成本右侧微图与简明历史

状态：**已自检／已发布，待用户反馈**。应用 `bc8e130`，分支 `codex/inline-cost-trends`，基线 `1ab2bfd`。正式域名已指向本批部署且READY；[发布回执](release/deployment.json)。

## 当前结果

- 月度与月会桌面每行三项，数据左、小折线右；收紧指标内距，金额不缩字、不拆行。空间不足整格重排。
- 每项最近六个月至少两个非空月才显示44px小图；真实0有效，未知断线。只有单月不显示图、说明或占位。移除独立趋势区、重复标题、金额范围和当前月背景带，起止月份单行，详情保留悬停与键盘气泡。
- 历史抽屉仅显示所选月六项结果及必要人数，不放趋势、环比或来源表；通过“查看该月明细”进入完整页面。
- 来源入口44px，分割线直接位于两行之间；来源卡20px内距、标题到入口组12px；展开表格上12px、下20px，收起后随内容消失。同月保存保留开关状态。
- 统计、接口和表结构保持；冻结事实及已归档PDF不改写，缺新字段的旧版本保留兼容展示。新生成PDF完整展开来源。

数据均来自正式组件、实际Vercel运行包和本机隔离PostgreSQL的虚构样本，不是正式经营数据。主样本为平台多月、私域仅本月，推广人数4／3／2、成本1,395.13／1,860.18／2,790.27元，159人非推广独立；另一组实际月数据覆盖五项趋势同时出现。

## 页面与状态

以下稳定捕获及同源局部均已查看。手机只检查明显遮挡、页面溢出和关键入口，不代表完整手机排版通过。

| 视图／状态 | 证据 | 实际检查 |
| --- | --- | --- |
| 月度默认折叠、私域仅单月 | [1920](screenshots/monthly-collapsed-1920.png) · [1440](screenshots/monthly-collapsed-1440.png) · [1024](screenshots/monthly-collapsed-1024.png) · [完整结果局部](screenshots/monthly-results-1920.png) | 已自检；无单月小图 |
| 月会同组结果与来源 | [1920](screenshots/meeting-1920.png) · [1440](screenshots/meeting-1440.png) · [1024](screenshots/meeting-1024.png) · [结果及来源局部](screenshots/meeting-results-1920.png) | 已自检；右图与共同基线 |
| 精简历史 | [1920](screenshots/history-costs-1920.png) · [1440](screenshots/history-costs-1440.png) · [1024](screenshots/history-costs-1024.png) | 已自检；无图、环比及来源表 |
| 历史缺值与长金额 | [缺私域1920](screenshots/history-missing-1920.png) · [1440](screenshots/history-missing-1440.png) · [1024](screenshots/history-missing-1024.png) · [长金额](screenshots/history-long-1440.png) | 已自检；未知为— |
| 五项图及缺月 | [月度五项](screenshots/monthly-five-trends-1440.png) · [月会五项](screenshots/meeting-five-trends-1440.png) · [真实缺月断线](screenshots/monthly-gap-1440.png) | 已自检 |
| 月度来源展开 | [1920](screenshots/monthly-expanded-1920.png) · [1440](screenshots/monthly-expanded-1440.png) · [1024](screenshots/monthly-expanded-1024.png) | 已自检；宽表在所属容器横滚 |
| 录入抽屉 | [1920](screenshots/editor-1920.png) · [1440](screenshots/editor-1440.png) · [1024](screenshots/editor-1024.png) · [刷新失败](screenshots/saved-refresh-failed-1440.png) | 已自检；保存与只读重试保持 |
| 手机有限检查 | [月度390](screenshots/monthly-mobile-390.png) · [录入390](screenshots/editor-mobile-390.png) | 仅明显问题检查 |
| 旧封存 | [1440](screenshots/legacy-frozen-1440.png) | 已自检；刻意保留原结构 |

来源各开关状态均有实际几何记录：[专项记录](data/checks.json)。1440px局部逐项查看：

| 视图 | 全关 | 仅推广 | 全开 | 仅非推广 | 再全关 |
| --- | --- | --- | --- | --- | --- |
| 月度 | [图](screenshots/monthly-source-1440-closed.png) | [图](screenshots/monthly-source-1440-promotion.png) | [图](screenshots/monthly-source-1440-both.png) | [图](screenshots/monthly-source-1440-organic.png) | [图](screenshots/monthly-source-1440-reclosed.png) |
| 月会 | [图](screenshots/meeting-source-1440-closed.png) | [图](screenshots/meeting-source-1440-promotion.png) | [图](screenshots/meeting-source-1440-both.png) | [图](screenshots/meeting-source-1440-organic.png) | [图](screenshots/meeting-source-1440-reclosed.png) |

## 过程与打印检查

- [录入、键盘气泡、失败重试及未保存保护录像](video/save-retry-flow.webm)；[直接进入、刷新与站内导航录像](video/first-paint.webm)。按4fps／10fps采样复看，过程帧与稳定图分开。键盘[气泡过程图](process/trend-keyboard-popover-1440.png)不作稳定终态。
- 4份实际生成PDF共22页均已渲染查看：[课程成本](pdf/meeting-costs.pdf)、[五项趋势](pdf/meeting-five-trends.pdf)、[长金额](pdf/meeting-long.pdf)、[旧口径](pdf/meeting-legacy.pdf)。新图与对应金额在同一格、同一页；来源完整展开。
- 页面审查联系表：[1](review/screens-01.jpg)／[2](review/screens-02.jpg)／[3](review/screens-03.jpg)／[4](review/screens-04.jpg)／[5](review/screens-05.jpg)／[6](review/screens-06.jpg)／[7](review/screens-07.jpg)。PDF逐页审查：[1](review/pdf-01.jpg)／[2](review/pdf-02.jpg)／[3](review/pdf-03.jpg)／[4](review/pdf-04.jpg)／[5](review/pdf-05.jpg)／[6](review/pdf-06.jpg)。
- 269项规则、15组原来源浏览器、14组最终运行包专项、共享UI隔离回归、schema与Node／Vercel类型构建通过。专项含0／1／2／6有效月、真实0、缺月、单月隐藏、右侧定位及月份单行、六项历史、44px入口及实际间距、503／慢请求／切月／冻结与键盘。[验证摘要](data/validation.json) · [运行包检查](release/runtime-bundle.json) · [机械扫描](data/impeccable.json)
- 候选20项／7关键资源、正式20项／71资源哈希一致。正式域名部署身份已核对；测试没有向共享库写虚构数据，无物理迁移。[候选](release/candidate.json) · [正式](release/production.json)

## 原验收纠正

[上批](../2026-11-06_16-02_monthly-cost-repair/README.md)仍保存原截图与结论。其独立大图区、单月点图及折叠留白虽被标为已自检，仍存在用户指出的信息组织与间距问题；本批将这些项补入实际布局断言并逐图复看，替代当前展示结论。中间的下置样稿不作为最终交付；本批最终方向为用户进一步确认的每行三项、右侧小图及简明历史。
