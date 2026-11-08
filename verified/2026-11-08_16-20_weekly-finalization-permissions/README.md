# 员工周会定稿权限

已发布、已自检，样本来自隔离PostgreSQL，正式库测试业务写入为0。基线1e75712；应用583c4df。正式部署dpl_H5SPC1v8KLDy92A83AiLTkJLhUJK READY，正式域名与候选一致；[候选26项／27资源](candidate-probe.json)、[正式26项／77资源](production-probe.json)均通过。

## 原因与修复

共用按钮误用“管理员或月计划已确认预排期”条件。周会没有月计划记录，员工因此被前端禁用；服务端原有周会保存权限未被禁止。现在按会议类型明确传入canFinalizePost，不再以月计划记录判断周会。

月会首次确认预排期与最终封存的服务端管理员门禁保持原实现。预排期后的既有文字修订、封存后两项文字追加权限保持；冻结材料、计划、来源指针和封存不重算。材料完整性、历史只读、生效日及未修改置灰判断继续生效。

## 清晰截图与实际操作

- [员工周会可定稿，1440原图](screenshots/employee-weekly-enabled-1440.png) · [管理员查看同一场周会](screenshots/admin-same-weekly-enabled-1440.png)
- [月会首次预排期：员工禁用](screenshots/employee-monthly-first-blocked-1440.png) · [管理员可确认](screenshots/admin-monthly-first-enabled-1440.png)
- [月会封存后：员工](screenshots/employee-monthly-sealed-text-only-1440.png) · [管理员](screenshots/admin-monthly-sealed-text-only-1440.png)
- [员工操作录像](video/employee.webm) · [管理员操作录像](video/admin.webm) · [桌面图库](index.html) · [检查记录](checks.json)

## 实际验证

- 实际Vercel包、固定服务端／浏览器时间2026-11-05 12:00、两种角色；1920／1440／1024共24图已查看。两段真实录像按2fps查看162帧，覆盖确认取消、实际保存及月会阶段切换；录像随测试改变视口，灰色余量是录像画布，不是页面空白。
- 周会双方真实会前转会后，取消不新增版本，保存产生定稿及可用PDF。旧完整周会综合回归已重新通过，覆盖重复草稿、同号定稿、幂等、输入保留、回溯、历史只读及到期限制。
- 月会首次确认：员工按钮禁用，直调接口403且状态不变；管理员实际点击成功。预排期后员工文字修订实际保存不重置确认时间、不改计划、不提前封存。员工直接封存403，管理员封存成功；封存后双方普通修改均403，界面保留既有文字追加入口。
- 303规则、schema、类型0错误／0警告、Node及Vercel构建通过，既有59条hint保留；月度预排期／首轮／核对／封存／后续执行及并发链路六组通过。没有修改样式、布局或数据库结构。

原始调试产物保留于本工作树.tools/weekly-permission及.tools/test-artifacts/weekly-permission。本轮只核对桌面权限状态，没有新增手机布局验收结论。
