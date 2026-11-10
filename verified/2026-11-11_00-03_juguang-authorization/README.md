# 聚光授权确认入口

已自检，待用户反馈。确认页复用既有工作台外壳、字体及表单控件；GET／HEAD仅展示或检查，原生同源POST创建一次性state并前往小红书，范围固定为`report_service`。

| 状态／视口 | 最终图与结果 |
| --- | --- |
| 管理员确认页，1440×900 | [桌面截图](juguang-authorization-1440.png)，正文／一级内容边界一致、文字及按钮可读 |
| 确认页，390×900 | [有限手机检查](juguang-authorization-390.png)，未见页面级横向溢出或关键入口遮挡 |

数据来源：独立PostgreSQL中的虚构验收账号与真实服务端实现，未使用生产业务行。真实渲染字形为MiSans VF，按钮14px。浏览器验证原生POST返回303、后续请求为整页导航，授权范围仅报表读取；对测试的外站请求进行断网注入，不向平台提交虚构授权。角色、跨站POST、state、实际迁移和加密存储由隔离接口检查覆盖。

源码入口：`src/pages/api/integrations/xiaohongshu/authorize.astro`；验证入口：`tests/xiaohongshu-juguang.browser.ts`、`tests/xiaohongshu-juguang.integration.ts`。最终目标Vercel包与新增浏览器检查通过，Impeccable机械检查无发现。原始字体／几何记录及日志位于本工作树`.tools/test-artifacts/juguang-confirm-*`。
