# 组织与人员

已发布、已自检，待用户反馈。应用代码 `05eeb06`；正式部署 `dpl_2VjY4bSVWj5vbAGhdCgAecVpdnDG`，与候选一致。入口：[组织与人员](https://qiuyun-frontend.vercel.app/organization)。

岗位与协作默认呈现主管、三岗职责、主要交付与反馈流程；人员任职按真实账号每人一行，兼任多个岗位。职责、资料与任职由管理员维护，员工只读；任职不改变账号权限。首页和工作台导航共用这一入口。

## 画面与数据来源

本批28张组织图均来自实际构建页面、真实隔离PostgreSQL与三名虚构测试人员，职责来自正式初始化内容。最终稳定图等待字体、数据和有限动画完成；首屏早期图另行标识。实际查看了全部图的contact sheets、关键原图及两段录像的全片逐秒与首屏加密抽样，独立Impeccable审查结论为ship，见[审查记录](checks/visual-review.json)。另在regression/保留七个既有工作台模块的1920px公共导航回归图，已实际对照查看框架与内容起点。

| 视图／状态 | 角色与视口 | 证据 |
| --- | --- | --- |
| 岗位与协作 | 管理员、员工；1920／1440／1024 | [管理员1440](screenshots/admin-roles-1440.png)、[管理员1024](screenshots/admin-roles-1024.png)、[员工1920](screenshots/employee-roles-1920.png)；同目录保留全部六图 |
| 人员任职 | 管理员、员工；1920／1440／1024 | [管理员1440](screenshots/admin-people-1440.png)、[管理员1024](screenshots/admin-people-1024.png)、[员工1440](screenshots/employee-people-1440.png)；同目录保留全部六图 |
| 单个编辑Sheet | 管理员1440 | [职责与资料](screenshots/admin-role-editor-1440.png)、[人员任职](screenshots/admin-member-editor-1440.png)、[失败保留](screenshots/admin-save-error-1440.png) |
| 首屏过程／稳定结果 | 管理员1440，冷缓存慢字体及暖刷新 | [冷缓存早期](screenshots/admin-slow-cold-early.png)、[冷缓存最终](screenshots/admin-slow-cold-stable.png)、[暖刷新早期](screenshots/admin-warm-reload-early.png)、[暖刷新最终](screenshots/admin-warm-reload-stable.png) |
| 有限手机核查 | 双角色两视图390／320，管理员编辑390 | [390职责](screenshots/admin-limited-touch-roles-390.png)、[320人员](screenshots/employee-limited-touch-people-320.png)、[390编辑](screenshots/admin-limited-touch-editor-390.png)；同目录共九图 |

手机仅核查明显遮挡、页面级溢出和关闭可达；表格内部横滚，不代表完整手机排版验收。

## 交互与运行验证

- 类型检查0错误／0警告，保留59条既有hint；303项现有规则、schema检查、Node与正式Vercel构建通过。
- 正式实现与实际Vercel运行包均使用真实隔离PostgreSQL验证实际迁移、初始三人四岗、账号／认证／字典保持、匿名和角色门禁、同源与严格输入、链接往返、重复同值、更名保留及真实并发审计。
- 双角色实际浏览器覆盖三档桌面两视图、刷新后首次编辑、未修改与改回原值关闭、Esc／后退取消保护、失败保留与重试、资料增删、任职更新、权限不变、局部公共节点保留和减少动态。首屏从绘制开始录制，实际平台字体为MiSans VF，导航与正文持续稳定。见[组织检查](checks/organization.json)及[正式运行包检查](checks/organization-runtime.json)。
- 公共UI、29组导航及17组首屏回归通过；首页循环、键盘和减少动态回归通过。另用实际Vercel包的新隔离进程在Chrome点击组织→排期→组织，Toolbar始终72px、左边界232px、顶部0，返回保留人员视图。
- [管理员录像](motion/admin.webm)、[员工录像](motion/employee.webm)包含真实操作与首屏过程；独立审查实际查看了两片全程抽样，未将连续播放列为已完成。
- [运行包](checks/runtime-bundle.json)核对React、Puppeteer、Chromium压缩文件与内联中文字体，并实际生成、提取中文和查看[一页中文PDF烟测](checks/runtime-weekly.pdf)。

## 正式数据与发布

迁移前后私有备份保存在被忽略的本机工具目录。新增三个组织表，四个岗位、五条已批准任职；原有57张表摘要完全一致，账号、凭据及业务事实保持，初始化更正审计为0。见[数据保持检查](checks/database-preservation.json)。正式登录后实际读取两视图，确认主管共同管理、执行岗位由一人兼任；正式验证只读。

[候选18项检查](checks/candidate-smoke.json)通过；[正式145项／98资源核对](checks/public-smoke.json)通过，正式域名与候选均指向同一Ready部署。代码、私有目录隔离、匿名保护、同源表单和外站拒绝均已核对。正式包和迁移支持旧应用读取，应用回滚不删除新增表。
