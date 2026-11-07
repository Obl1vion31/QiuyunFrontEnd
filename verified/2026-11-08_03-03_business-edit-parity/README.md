# 业务编辑同权、管理员配置与月会展示

已自检并发布，待用户反馈。应用提交1d0a5cd，基于已发布e7ed6e9。数据来自独立PostgreSQL夹具，未向正式库写入测试业务数据。

## 看效果

- [业务配置：帖子类型](screenshots/admin-1440-types.png) · [推广用途](screenshots/admin-1440-purposes.png) · [公共编辑弹窗](screenshots/admin-1440-edit-type.png)
- [员工月会趋势](screenshots/employee-1440-monthly-points.png) · [原坐标气泡](screenshots/employee-1440-point-tooltip.png)
- [员工封存文字编辑](screenshots/employee-1440-sealed-text-edit.png) · [保存为新版本](screenshots/employee-1440-sealed-text-saved.png)
- [员工推广历史更正](screenshots/promotion-employee-1440-02-context.png) · [员工非推广修改](screenshots/employee-1440-nonpromotion-correction-entry.png) · [年度规划](screenshots/employee-1440-annual-editable.png)
- [动态用途录入](screenshots/employee-1440-dynamic-private-entry.png) · [员工公共说明](screenshots/employee-1440-public-guide.png)
- [管理员操作录像](video/admin-1440.mp4) · [员工操作录像](video/employee-1440.mp4)

录像包含主动切换1920／1440／1024／390视口，固定录像画布外的灰边不属于网页；正常速度文件保留，另按8fps实际查看525帧。稳定图等字体、数据及有限动效结束后采集；未以截图代替首屏和操作过程。

## 实际覆盖

| 范围 | 已检查状态 |
|---|---|
| 管理员业务配置 | 三档桌面帖子类型／用途；新增、改名、默认类型、归属、键盘排序、失败重试和并发保留输入；同名按学科独立 |
| 管理员／员工月会 | 三档桌面有效点、末点、气泡；1440文字编辑／修订后新版本；冻结数据、原计划指针及旧PDF字节保持 |
| 双方日常业务 | 非推广更正、笔记ID影响确认、年度新增／编辑、动态用途；推广历史三档、三天确认和失败重试 |
| 共享走势 | 周会双方三档；成本0／1／2／6有效月、真实0、缺值断线、月份切换及减少动态效果 |
| 手机390 | 仅明显遮挡、关闭入口和页面级溢出；不作为手机完整填写验收 |

57张最终截图及全部合图见[审查清单](inspection/manifest.json)。独立设计复核发现圆点伪元素被后续display规则覆盖，修复共享选择器与display:block后重拍，复核通过；历史点6×6、最后有效点9×9，聚焦／点击不缩放移动。

## 验证

301项规则、最后22项聚焦、类型0错误／0警告、schema及Node／Vercel构建通过。实际运行包覆盖3组同权接口、15组私域成本修复、双方角色浏览器及推广历史／现有月度封存链路。配置、审核和排期例外继续拒绝越权。详情见[验证摘要](checks/verification.json)、[浏览器结果](checks/browser.json)及[接口结果](checks/integration.json)。

[原封存PDF](pdf/original.pdf)、[管理员修订PDF](pdf/admin-revision.pdf)、[员工修订PDF](pdf/employee-revision.pdf)为本轮实际运行包生成；已核对生成状态和原文件不变，本轮未逐页审查PDF版式。

## 发布核对

正式域名与候选同为READY部署dpl_BpUTbxMCAWDDXfWispG3A1gK6ugt，应用1d0a5cd已同步main。候选26项／25资源，正式26项／77资源哈希一致；同源表单未登录401、外站Origin403及管理入口登录保护保持。

0050兼容迁移前已在私有工具目录备份；迁移后原有56张表摘要完全一致，4个学科的名称、顺序、默认运营类型及既有费用归类与原值匹配，无待执行迁移。未上传原始备份；[迁移核对](checks/migration.json)只含验证元数据。[发布核对](checks/release.json)、[正式资源与访问结果](checks/production-probe.json)。
