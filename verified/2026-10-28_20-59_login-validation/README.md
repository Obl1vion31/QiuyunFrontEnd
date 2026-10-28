# 显示姓名与登录账号说明、校验错误修复

已自检，待用户反馈。实现 `ce186d3`，正式部署 `dpl_AgUCGFgjEyRBhqjkHbXA7jKzfFjf`。

## 原因与处理

设置修改的是显示姓名，登录标识保持原账号。两个字段未在编辑时充分说明，登录页又把422输入校验误归为服务不可用，导致改名后误用姓名登录时看到故障提示。

- 登录框与管理表明确标为“登录账号”；改显示姓名时展示该行真实登录账号，保存后再次确认。
- 已知422错误翻译为中文输入原因，未知或非JSON校验错误使用安全兜底；403拒绝与5xx故障分开，输入和重试保留。
- 隔离夹具将 `test_admin` 的显示姓名改为 `OB`，实际保存后验证姓名为OB、登录标识仍为test_admin，原凭据继续登录成功。生产仅只读核对目标账号状态和服务连通，未重置真实账号或密码。

## 截图

| 视口 | 登录校验 | 修改姓名说明 |
| --- | --- | --- |
| 1440 | [查看](images/login-validation-1440.png) | [查看](images/account-rename-1440.png) |
| 390 | [查看](images/login-validation-390.png) | [查看](images/account-rename-390.png) |
| 320 | [查看](images/login-validation-320.png) | [查看](images/account-rename-320.png) |

截图等待公共弹窗进入动效结束后采集，实际查看桌面与手机；手机为Chromium模拟视口。样本及密码均为隔离虚构数据。

## 验证与发布

16项认证／账号状态规则、db:check、类型检查、Node／Vercel构建与中文PDF运行包通过；真实HTTP及浏览器覆盖422、403、503、非JSON错误、防重复、原凭据重试、自己的两字符显示名修改、会话及桌面／手机登录，详见 `logs/`。

[候选5项](candidate-smoke.json)、[正式100项与66个资源哈希](public-smoke.json)通过。[正式登录页](https://qiuyun-frontend.vercel.app/login)。本轮使用仓库内隔离工作树构建，保留主工作目录其他未提交修改；无数据库迁移。
