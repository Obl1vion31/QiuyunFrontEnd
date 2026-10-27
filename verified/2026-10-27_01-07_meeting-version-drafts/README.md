# 例会统一布局与版本草稿验收

状态：已自检，待用户反馈。实现提交 `7f90e61`，最终发布源 `2323e81`。截图与示例 PDF 使用正式组件、隔离 PGlite 和虚构业务数据；真实会议的核对截图、PDF及备份保存在私有工具目录。

草稿、会前和会后共用“本期结果与结论 → 推广 → 非推广 → 补充分析与事项”。新建为会前 V0 草稿；从 V2 编辑时首次保存建立 V3 草稿，重复保存和定稿保持 V3。草稿不执行安排、事项或 PDF，修订不刷新冻结指标。

## 主要效果

- [事项编辑：表头居中，文本左齐，控件中线一致](version-draft-issues-1440.png)
- [百分比与正负 pp 同排](inline-delta-1440.png)
- [会后只读首屏](post-read-1440.png)
- [会前编辑与本版定稿操作](pre-edit-1440.png)
- [保存、续填、定稿与回溯操作录像](version-draft-flow.mp4)
- [网页同款 A4 横向示例](example-report.pdf)：普通内容3页；长文5页在私有原始产物中逐页检查。

## 桌面视口

| 状态 | 1920 | 1440 | 1280 | 1024 |
|---|---|---|---|---|
| 初始 V0 草稿卡片 | [查看](draft-cards-1920.png) | [查看](draft-cards-1440.png) | [查看](draft-cards-1280.png) | [查看](draft-cards-1024.png) |
| 修订草稿事项 | [查看](version-draft-issues-1920.png) | [查看](version-draft-issues-1440.png) | [查看](version-draft-issues-1280.png) | [查看](version-draft-issues-1024.png) |
| 同行差值与颜色 | [查看](inline-delta-1920.png) | [查看](inline-delta-1440.png) | [查看](inline-delta-1280.png) | [查看](inline-delta-1024.png) |
| 会前编辑 | [查看](pre-edit-1920.png) | [查看](pre-edit-1440.png) | [查看](pre-edit-1280.png) | [查看](pre-edit-1024.png) |
| 会后只读 | [查看](post-read-1920.png) | [查看](post-read-1440.png) | [查看](post-read-1280.png) | [查看](post-read-1024.png) |

窄卡片按完整指标组重排，保持主值与差值同排；覆盖长标题、较长正负差值、缺样本、零值、长文和不同卡片数量。事项问题／方案均为64px初始高度，进度控件40px，按真实几何核对中线，不以顶边或 CSS 声明代替。

## 验证

209项规则、兼容迁移、七组例会浏览器回归、版本草稿专项、公共 UI、类型检查、Node及Vercel构建、db:check通过。检查并发来源、重复保存、过期文字修订、回溯取消／确认、独立撤销日志、旧客户端拒绝、草稿排除比较与 PDF、事项不重复执行。公共容器与移动端由共享 UI 回归覆盖，本轮设计范围为桌面。

- [自动验证汇总](validation.json)
- [版本草稿、PDF与交互检查](discussion-checks.json)
- [紧凑卡片与事项检查](compact-checks.json)
- [迁移后原快照与事实比对](migration-preservation.json)
- [独立部署动态探针](candidate-smoke.json)
- [公网检查](public-smoke.json)

正式会议只读及编辑态均实际核对；未代保存草稿或定稿。已有 V2 的数字和原快照保留，仅重建自动 PDF。旧安排按原生效日锁定，文字仍可修订。

## 公网核对

正式域名已发布，部署 `dpl_66faqjQmavc6aXj1xNcs98ajkGiC`；独立部署4项动态探针、95项公网检查及61个资源哈希通过。[真实 V2 四档几何检查](production-desktop.json)核对表头、控件中线、页面／指标／事项表均无横向挤出。V2自动PDF已更新至打印模板v4，原3份定稿快照及原业务事实比对保持；未代保存真实 V3 草稿或定稿。
