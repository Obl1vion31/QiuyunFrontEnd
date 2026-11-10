# 第三方接入

保存已授权平台的服务端协议、授权校验与凭据存储逻辑；浏览器不得导入运行时代码。`juguang-check-types.ts` 仅提供不含凭据的检查摘要类型。

## 聚光离线报表

管理员从系统设置 `/business/settings?view=integrations` 查看配置、授权广告账户、有效期、最近检查及接口用途。申请权限固定为 `report_service`。本轮只管理连接、验证离线报表读取，不自动填入或保存推广复盘，不扩大到笔记素材列表、实时数据、创编、财务或自然数据。

`xiaohongshu-juguang.ts` 负责 OAuth、十分钟一次性 state、会话／应用绑定、AES-256-GCM 加密持久化及安全状态。管理员原生同源 POST `/api/integrations/xiaohongshu/authorize` 发起授权；GET／HEAD 不创建 state。表单使用 `data-astro-reload`，保证 303 为整页授权导航。成功或管理员回调失败后回到管理页，登录失效回调返回固定登录入口，URL 清除授权码。无参数精确回调 GET／HEAD 仍为公开就绪检查。

`juguang-check.ts` 通过管理员同源 POST `/api/integrations/xiaohongshu/check`，按服务端保存的授权连接和账户顺序调用官方笔记离线报表。检查用上海前两天，页大小1，只保存状态与白名单错误，不保存或返回报表指标；HTTP成功且业务码0即读取正常，空报表也成功。单次上游检查预算25秒，各请求最多10秒。超时／限流是可重试检查失败，不当作数据为零或自动失去授权。

短期令牌到期前一分钟或上游明确返回失效时，按需刷新；每轮最多刷新一次。刷新账号／应用／场景及实际只读scope均校验。OAuth交换与检查共享应用级数据库锁，竞争检查返回409；报表失败作为安全结果保存，不能回滚已轮换的令牌。最近结果保存在连接表 `last_check`，重新授权清除旧检查。

`juguang-usage.ts` 是页面接口及数据用途说明的维护入口。新增接口、字段或业务消费者时同步维护页面、本文和交接；只有真正落入业务流程后才标为已用于复盘。消耗与点击率当前供人工核对；私信条数／进线与平台开口／留资的对应尚待确认；实际人数与复盘判断继续人工维护。

Production 配置 `XHS_JUGUANG_APP_ID` 与 `XHS_JUGUANG_APP_SECRET`。Secret只在服务端保存，状态接口只返回App ID、账户、scope、日期及安全检查摘要。更换认证根密钥后旧连接需重新授权。

官方依据：[授权流程](https://ad-market.xiaohongshu.com/docs-center?bizType=943&articleId=2603)、[权限范围](https://ad-market.xiaohongshu.com/docs-center?bizType=943&articleId=3195)、[获取令牌](https://ad-market.xiaohongshu.com/docs-center?bizType=943&articleId=4929)、[刷新令牌](https://ad-market.xiaohongshu.com/docs-center?bizType=943&articleId=4808)、[笔记离线报表](https://ad-market.xiaohongshu.com/docs-center?bizType=943&articleId=3803)。文档网页超时时可读取官方文章服务正文，不能混用电商或账号登录平台协议。
