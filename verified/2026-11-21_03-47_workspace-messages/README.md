# 全站提示文案

应用代码：`880ac3e8d563550af27711c2f0b71234c8df7aa1`；状态：已自检并发布，待用户反馈。

本批统一限制范围、操作原因与下一步，区分记录变化、重复、权限拒绝、结果未知及保存后的读取失败；周会、月会、排期、推广／非推广复盘、月度运营、年度规划、组织人员、账号及接入管理同步使用。业务权限、截止规则、接口结构和数据库结构保持。长说明沿原提示区换行，日度表保存反馈在横向滚动后仍可见。

截图及 PDF 全部来自实际 Vercel 运行包与 PGlite 隔离夹具，使用虚构业务内容和账号；没有向生产业务库写入测试记录。正式已登录浏览器另外只读核对周会：显示真实截止时间、推广安排锁定与文字可修订范围，以及统计固定说明。正式截图仅私有保存在 `.tools/test-artifacts/workspace-messages/production-copy.jpg`。

## 最终界面

| 场景 | 已查看的角色与尺寸 | 证据 |
| --- | --- | --- |
| 周会跨 05:00 后的安排限制与首次会后定稿截止 | 管理员，1440×1000／1024×1000 | [1440](screenshots/deadline-0500-1440.png)、[1024](screenshots/deadline-0500-1024.png) |
| 草稿中的统计固定说明 | 管理员，1024×1000 | [界面](screenshots/draft-v2-0130-1024.png) |
| 月会定稿并封存的影响范围、具体按钮和取消 | 管理员，1440×1000 | [确认框](screenshots/monthly-seal-confirm-1440.png) |
| 未确认预排期的不同操作指引 | 管理员／员工，1440×1000，同一个月份 | [管理员](screenshots/admin-preplan-1440.png)、[员工](screenshots/employee-preplan-1440.png) |
| 聚光授权失效的不同操作指引 | 管理员／员工，1440×1000，同一活动与日期 | [管理员](screenshots/admin-authorization-expired-1440.png)、[员工](screenshots/employee-authorization-expired-1440.png) |
| 浏览器默认必填提示中文、对应字段聚焦 | 管理员，1440×1000 | [消耗字段](screenshots/native-validation-1440.png) |
| 日度保存成功后列表读取失败；横向滚动后提示仍可见 | 管理员，1440×1000 | [保存反馈](screenshots/saved-read-failed-1440.png) |
| 服务器已保存，但网络没有返回结果；当前输入保留 | 管理员，1440×1000／1024×1000 | [1440](screenshots/save-result-unknown-1440.png)、[1024](screenshots/save-result-unknown-1024.png) |
| 会后定稿已完成，仅 PDF 失败，并可单独重试 | 管理员，1440×1000 | [PDF 提示](screenshots/pdf-failed-1440.png) |

以上最终图已实际查看，长文案、按钮、字段与可见范围无明显遮挡。390×844 仅核查同一周会只读状态的明显溢出与主要入口，不作为手机完整填写验收，也不借用为其他错误状态的手机结论。

## 验证

- 实际目标 `vercel build --prod`：0 错误、0 警告，62 项既有 hint。35 项相关规则通过；最终变更后复验公共文案 5 项及真实浏览器场景。权限、周会期限／版本和月会原约束保持。
- `workspace-messages.browser.ts` 覆盖真实 V2 草稿、截止前及跨 05:00、直接到期请求拒绝、同号会后定稿、旧冻结保持、管理员／员工预排期和权限、中文字段错误、真实过期的隔离聚光连接、浏览器必填／数字范围校验与纠正、保存 201 后读取 503、服务器已提交后丢失响应、PDF 失败及重试。无浏览器未处理异常。[检查结果](checks.json)。
- 浏览器英文默认提示已在中文页面复现；公共 Frame 与登录页接入同一中文说明。真实日度金额／人数输入核查中文、字段名及纠正后恢复有效。原始必填、范围、格式、精度及业务自定义校验不变。
- 代表性周会 PDF 使用本次目标包真实生成，共两页，均已渲染查看：[PDF](pdf/weekly-v2.pdf)、[第 1 页](pdf/weekly-1.png)、[第 2 页](pdf/weekly-2.png)。现有归档 PDF 保留原版。

## 操作实录

三段都从本批真实浏览器录像截取，已按实际录像时间定位并完整抽帧查看；原始调试录像留在 `.tools/test-artifacts/workspace-messages/`。

- [月会封存确认与取消，2 秒](video/monthly-confirm.mp4) · [抽帧](video/monthly-confirm-frames.jpg)
- [中文必填、纠正输入、保存与读取失败，2.9 秒](video/native-and-save-feedback.mp4) · [抽帧](video/native-and-save-feedback-frames.jpg)
- [保存响应丢失、输入保留及两档桌面，2.9 秒](video/unknown-save-result.mp4) · [抽帧](video/unknown-save-result-frames.jpg)

## 正式发布

部署 `dpl_8EvGdadHPuBjtdahxFomdzgiKkgB` 已 READY、归档并切到[正式站](https://qiuyun-frontend.vercel.app)。候选及正式接口核对通过，正式五项变更资源与本地运行包 SHA256 一致；2012 项运行包归档完整，三个既有聚光续期任务保持启用并绑定本部署。源码与验收记录同步 `main`；本轮未执行生产业务保存或数据迁移。
