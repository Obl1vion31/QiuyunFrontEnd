# 第三方接入

仅保存已授权平台的服务端协议、授权校验与凭据存储逻辑，浏览器组件不得导入。

`xiaohongshu-juguang.ts` 对接小红书商业开放平台聚光 OAuth，固定申请 `report_service` 只读报表权限。管理员可直接打开 `/api/integrations/xiaohongshu/authorize`，也可同源 POST 发起；GET 拒绝跨站导航和外站 Origin，HEAD 只检查入口、不创建授权。回调校验当前登录会话、应用与十分钟内的一次性 state，成功后跳转不含授权码的管理员状态接口。临时 state 使用 `auth_verification` 的独立命名空间。

令牌以 AES-256-GCM 加密写入独立连接表，密钥从本站认证根密钥按用途派生，密文绑定应用及授权账号。状态接口仅返回账号、权限与有效期，不返回令牌。更换认证根密钥后，旧连接需要重新授权。

直接 GET／HEAD 无查询参数的回调地址为公开就绪检查，不调用身份或业务数据库；带参数的回调及其余接入接口仍受管理员会话保护。应用创建后在服务端配置 `XHS_JUGUANG_APP_ID`、`XHS_JUGUANG_APP_SECRET`，保留站点正式域名作为回调域名。

协议依据：[授权流程](https://ad-market.xiaohongshu.com/docs-center?bizType=943&articleId=2603)、[权限范围](https://ad-market.xiaohongshu.com/docs-center?bizType=943&articleId=3195)、[获取令牌](https://ad-market.xiaohongshu.com/docs-center?bizType=943&articleId=4929)。官方文档目录加载较慢时，应读取官方文档服务返回的文章正文，不能改用电商、分享或账号登录平台的协议。
