# 表格边界、例会排版、悬浮工具与账号登录

状态：已自检并发布，待用户反馈。数据来自隔离测试库，未在正式库创建演示账号或业务记录。

- [分类展开，1920px](categories/category-open-1920.png) · [多个分类，1440px](categories/category-multiple-1440.png) · [390px](categories/category-open-390.png) · [320px滚到右侧](categories/category-right-320.png) · [Inspector](categories/category-inspector-1440.png)
- [例会普通名称，1920px](meetings/normal-1920.png) · [长名称与附件](meetings/mixed-1920.png) · [PDF错误，右侧1440px](meetings/error-right-1440.png) · [手机PDF操作](meetings/normal-right-320.png)
- [悬浮工具，1440px](accounts-tools/tools-open-1440.png) · [手机触控](accounts-tools/tools-touch-320.png)
- [新增管理员](accounts-tools/create-admin-1440.png) · [重名重试](accounts-tools/create-conflict-1440.png) · [手机新增](accounts-tools/create-admin-320.png) · [修改账号](accounts-tools/rename-account-390.png) · [OB登录](accounts-tools/login-name-320.png)
- 录像：[分类展开与详情](video/category-expansion.webm) · [例会状态与PDF反馈](video/meeting-states.webm) · [账号操作与工具菜单](video/accounts-tools.webm)。三段均按12fps导出并逐张审查连续帧，帧图在video目录；稳定截图另行审查，未用动画中间帧代替最终效果。

| 视图 | 状态 | 实测宽度（px） |
| --- | --- | --- |
| 分类汇总 | 收起、单展开、多展开 | 1920、1440、1024、390、320；1374／1376断点两侧 |
| 分类明细 | 共同横滚到最右侧／Inspector | 1024、390、320／1440 |
| 例会记录 | 普通名称、V3同行、两组PDF | 1920、1440、1280、1024、390、320 |
| 例会记录 | 长名称、附件；历史、生成中、失败 | 1920、1440、1024；历史与失败1440 |
| 工具 | 展开及关闭，不挤动正文 | 1920、1440、1024、390、320 |
| 工具 | 悬停跨间隙、离开、固定、键盘、返回焦点；实际触控 | 1440；390、320 |
| 账号／登录 | 新增管理员、改号、完整用户名登录 | 1440、390、320 |
| 账号管理 | 默认员工、重名保持输入并重试、自身改号会话连续 | 1440及实际表单流程 |

几何检查守住汇总／明细边界误差≤1px、单横滚与正文不溢出；实际审图同时核对比例、字号、基线、长文本与末列操作。发现桌面悬浮底板压住PDF错误末尾后，改成正文外竖点、常态透明底板并重新构建、回归和拍图。旧批次分类展开只验1440px及例会布局误判已在[原记录](../2026-10-29_00-54_workspace-visual-correction/README.md)更正，旧图保留。

验证：222项规则、认证浏览器、真实PostgreSQL账号并发与迁移、非推广、例会记录、协作查帖、公共UI、db:check、Astro类型检查、Node／Vercel构建及正式运行包中文PDF通过，详见[验证摘要](validation.json)。正式迁移前预检与备份，49张身份／凭据／业务表逐行摘要一致，唯一差异为在线位置表的心跳过期时间，见[数据比对](migration-check.json)。

发布源 `2072b45`，正式部署 `dpl_D779E9V4c67ASjj1hbSroTQjTwPp`；[正式站点](https://qiuyun-frontend.vercel.app)已核对，6项候选动态检查、108项公网检查及66个资源哈希通过（[发布信息](release.json)、[公网结果](public-smoke.json)）。工作分支已推送，main未合并。
