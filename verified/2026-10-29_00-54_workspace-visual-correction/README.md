# 工作台工具、接管与复盘列表整改

状态补正：该批已发布，但分类汇总／展开宽度和例会列间比例的视觉通过判断不合格。分类展开仅有1440px证据，不能等同平铺视图的五档覆盖；旧图中已可见问题。本批原图保留供复盘，后续整改以新批次为准。业务数据全部来自隔离 PostgreSQL／PGlite 虚构夹具，无生产业务写入或数据库迁移。代码对应本批归档所在实现提交。

## 直接查看

- [右侧工具菜单](collab/tools-menu-1440.png) · [手机工具](collab/tools-menu-320.png)
- [非推广占用定位](collab/nonpromotion-locked-1440.png) · [管理员接管员工](collab/takeover-confirm-1440.png) · [员工接管管理员](collab/admin-occupancy-1440.png)
- [待复盘](nonpromotion/pending-1440.png) · [已复盘含零值与100%](nonpromotion/history-flat-1440.png) · [不复盘原因](nonpromotion/skipped-1440.png) · [手机不复盘](nonpromotion/skipped-320.png)
- [例会1920px](meeting/normal-1920.png) · [例会1440px](meeting/normal-1440.png) · [长标题与PDF条件态](meeting/mixed-1440.png) · [历史](meeting/history-1440.png)

## 操作录像

- [刷新后首次输入与离开确认](video/first-input.webm)：800ms取锁延迟期间连续输入1234.56，随后Tab；[逐帧记录](collab/first-input-frames.json)。
- [管理员确认接管](video/admin.webm) · [员工确认接管](video/employee.webm)。

录像为真实浏览器操作的短片，960px／12fps压缩，保持片段原时长；三段导出录像的全部连续帧已通过同目录12张frames图逐张查看，稳定确认截图另行全尺寸检查。管理员片段开头包含验收视口切换。完整原片保留私有测试目录。

## 实际覆盖

- 1920／1440／1024／390／320px：工具菜单、查帖详情及末尾、推广占用、非推广占用与待复盘／已复盘／不复盘。例会另含1280px及内部横滚。部分列表截图保留滚动后的位置，用于检查节点连续性。
- 双角色同字段确认／取消／接管、中文输入法、两人同时首点、旧输入保留、过时凭证拒写、503重试、表内人员标记不改变行高列宽；只读列表观察不取得编辑权。
- 日期同行、标题与长分类上下、完整百分比／真实零值／无基准、分类明细及平铺、不复盘无指标；例会标题与表格外部留白对称，PDF附件、生成、失败和历史。
- 手机真实触控、焦点返回、未保存确认、滚动、面板进出及减少动态效果。已实际打开最终图片，修正组件样式覆盖、窄日期、排序标签拆字、筛选溢出和Inspector下过大卡片。

## 验证

最终`test:collaboration-lookup`、`test:non-promotion`、`test:ui`、`test:meeting-ledger`、`test:motion`通过；Node及Vercel构建／类型检查、db:check、正式运行包中文PDF通过。结果见各子目录JSON。

本轮早期完整规则222项通过；最终全量复跑多次被WSL的Wsl/Service/E_UNEXPECTED中断，未计为最终通过。中断后完成生产构建及专项证据整理；未将中间帧或被中断任务冒充验收结果。

## 发布

实现`a8d98c1`，工作分支已推送；正式域名已核对为`dpl_EqRmWS9o7sRNSSShmjRKjopFA5ZL`。独立部署6项、正式107项检查及66个资源哈希通过。[发布记录](release.json) · [独立检查](candidate-smoke.json) · [公网检查](public-smoke.json)。main未合入。
