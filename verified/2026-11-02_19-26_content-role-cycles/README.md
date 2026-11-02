# 内容职能与持续复盘版本周期

已自检，待实际使用反馈。截图使用隔离夹具，不是正式业务结果；最终图为真实视口，表格必要横滚单独拍摄，详情浮层不使用拼接整页图。

- [第一时间解析职能分组 · 1440px](screenshots/role-groups-1440.png) · [出分合集 · 1440px](screenshots/score-roles-1440.png)
- [分类原位明细](screenshots/role-expanded-1440.png) · [排期职能单选](screenshots/schedule-role-1440.png)
- [持续结果与真实缺点趋势](screenshots/continuous-expanded-1440.png) · [手机区间录入](screenshots/interval-inspector-390.png) · [旧累计只读](screenshots/legacy-readonly-1440.png)
- [管理员使用说明](screenshots/admin-guide-1440.png) · [手机说明](screenshots/admin-guide-390.png)
- [桌面过程录像](video/focused-1440.webm) · [手机过程录像](video/focused-390.webm) · [逐帧查看清单](inspection/manifest.json)

| 实际检查 | 视口 |
| --- | --- |
| 两合集职能分组、常规双轮、分类展开及原Inspector | 1920／1440／1024／390／320px |
| 即时结果、持续展开趋势／缺值、区间Inspector及后续节点 | 同上五档 |
| 管理员说明正文与表格 | 同上五档；390／320px另查正文各节 |
| 职能筛选前后退、排期条件字段、旧链接只读 | 1440px |
| 减少动态效果 | 390px |
| 说明冷缓存、字体慢请求与可见动效过程 | 1440／390px |

共62张最终视口截图；桌面186帧、手机178帧的全部连续帧已实际查看。检查MiSans实际字形、分类父子外边界、各指标字体层级、区间完整显示、横滚容器、动画终态及只读状态。[浏览器结果](browser.json)与[真实字体](fonts.json)保留证据。

验证包含251项规则、真实接口的职能创建／更正／审核、同职能标准样本与即时共享、自定义隔离、普通非推广V0继续、推广后版本实发生效切换、真实区间、旧表单拒绝与冻结版本保留；[真实PostgreSQL迁移及约束验证](postgres.json)逐表核对0045→0046兼容保留。共享UI、发布、月会完整链路、非推广Inspector与推广工作台回归使用隔离数据。

对应应用代码`9c6f95a`。正式迁移、回填和发布见本目录最终发布记录；私有备份和逐帖回填清单位于被忽略的本机目录，不进入验收图库或部署。

正式发布：应用`9c6f95a`，部署`dpl_G1FNFSXi7eWgCHDB9B7BJrPevx32`；正式域名解析到本候选且READY。候选14项、正式121项与86个资源哈希核对通过，正式库九种方式／状态读取通过。0046兼容迁移及授权职能回填完成，51张非瞬态表的原字段与冻结JSON逐项保留，70条旧指标未补造统计起点；备份及逐帖清单继续私有保存。[发布记录](release.json)、[迁移核对](production-migration.json)、[回填核对](production-backfill.json)、[正式读模型](production-read-model.json)、[公网核对](public-smoke.json)。

补充操作图（同一界面的隔离验收示例，已实际查看）：[推广正常结束后添加复盘日期](how-to/after-end-1440.png)、[按明确统计区间填写指标](how-to/continuous-input-1440.png)。示例曝光1000、阅读100时，点击率自动显示10.00%；复盘截止次日开放。
