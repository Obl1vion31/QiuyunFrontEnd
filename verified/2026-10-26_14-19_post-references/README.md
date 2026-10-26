# 每日录入就近查看资料

- 状态：已自检，待用户反馈；代码 `3a44954`，工作分支 `codex/promotion-inline-references`，已同步既有工作分支。
- 每日与推广安排名称保留普通标题，版本旁资料入口就近展示项目文档、小红书帖子链接、完整笔记 ID 与复制。移除重复录入 Inspector、整行克隆和镜像适配器；历史与排期详情按原职责保留。
- 资料与例会共用原生气泡的视觉、悬停／聚焦、点击保持、Esc／外点关闭及视口避让，分别声明表格与卡片的锚点边界。读取不导航、不产生第二份指标表单、不打断安排草稿。
- 已有 ID 为只读文字，复制失败可直接选取；缺失才打开补填，仍随复盘原子保存。长期规则、接入实例及验收用例已替换原双入口要求。
- 数据来源：正式组件与隔离 PGlite 的虚构业务事实；所有业务写入仅在隔离库。独立检出只包含本次修改，使用独立安装的依赖构建。

## 最终界面

| 场景 | 图片 |
| --- | --- |
| 桌面行内资料 | [1920px](desktop/references-1920.png) · [1440px](desktop/references-1440.png) · [1024px](desktop/references-1024.png) |
| 手机资料与完整 ID | [390px](mobile/references-390.png) · [320px](mobile/references-320.png) |
| 复制失败可选取 ID | [1440px](states/copy-fallback-1440.png) |
| 缺失 ID 的必要补填 | [1440px](states/missing-id-1440.png) |
| 查看资料保留安排草稿 | [1440px](states/references-with-draft-1440.png) |
| 原位保存与最终列表 | [保存反馈](states/saved-inline-1440.png) · [最终列表](states/final-1440.png) |
| 例会共享资料气泡 | [1440px](states/meeting-reference-1440.png) |

截图与[录像关键帧](motion/contact.png)已实际查看。[操作录像](motion/interaction.webm)包含五档视口、资料与复制、焦点、未保存确认、失败重试和保存回显。

## 验证

197项规则、db:check、类型检查与 Node／Vercel 构建通过；公共UI、每日工作台、当日状态更正、资料／安排专项、例会内联与展示回归通过。发布包中 React、PDFKit、内置字体及实际中文PDF生成通过。

专项实际核对原行节点／指标／选择／滚动／URL保留、无重复表单与 Inspector、链接与缺失资料、ID复制与失败回退、旧重复入口书签重定向、缺ID原子保存、安排草稿保护、断网／冲突及减少动态效果。[专项结果](checks/browser.json) · [验证日志](checks/)。

## 公网发布

已发布 [正式域名](https://qiuyun-frontend.vercel.app/business/daily-promotion-review)，源代码 `3a44954`，部署 `dpl_69xdGLwE1KJYZXZj4iNTtFeQYpCU`。独立动态探针6项、正式域名84项检查及61个资源哈希核对通过；正式域名指向该部署。公网检查覆盖未登录边界、Origin保护、动态会话、私有路径及静态资源；交互截图来自隔离库，未写生产业务数据，无数据库迁移。

[公网结果](checks/public-smoke.json) · [正式部署核对](checks/formal.txt) · [切换记录](checks/promote.txt)。
