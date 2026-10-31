# 网页内湫云品牌图标

按确认计划将E3原色图形接入首页左上、页脚、登录左上和共享侧栏。深色区域使用浅底板，浅色侧栏保持透明；36px常规、24px页脚，与文字间距8px。当前本机功能与视觉自检通过，正式发布结果核对后补齐。

## 实际效果

| 位置 | 查看截图 |
| --- | --- |
| 首页左上 | [1920px](screenshots/home-top-1920.png)、[1440px](screenshots/home-top-1440.png)、[1024px](screenshots/home-top-1024.png) |
| 首页页脚 | [1920px](screenshots/home-footer-1920.png)、[1440px](screenshots/home-footer-1440.png)、[1024px](screenshots/home-footer-1024.png) |
| 登录 | [1920px](screenshots/login-1920.png)、[1440px](screenshots/login-1440.png)、[1024px](screenshots/login-1024.png)、[390px](screenshots/login-390.png)、[320px](screenshots/login-320.png) |
| 管理员工作台 | [1920px](screenshots/workspace-admin-1920.png)、[1440px](screenshots/workspace-admin-1440.png)、[1024px](screenshots/workspace-admin-1024.png)、[390px](screenshots/workspace-admin-390.png)、[320px](screenshots/workspace-admin-320.png) |
| 员工工作台 | [1440px](screenshots/workspace-employee-1440.png)、[390px](screenshots/workspace-employee-390.png) |
| 慢图片完成态 | [1440px](screenshots/slow-logo-loaded-1440.png) |

以上19张稳定截图均已实际查看。图形、文字和底板中线协调，320px登录品牌与返回操作仍有间距；原侧栏提醒和导航起点保持，手机继续隐藏侧栏品牌区。

## 验证与过程

- [专项记录](checks.json)：15个页面／角色／宽度场景，13组与修改前`270f6fa`的[实际布局](baseline.json)比较，顶栏、正文、登录表单、品牌区及导航误差不超过1px。
- 两个角色共11次真实工作台跨页切换保留同一侧栏品牌节点；品牌链接键盘Enter返回首页。图片延迟650ms时占位与加载后的图形框均为36×36，表单、文字及顶栏不移动，刷新后同样稳定。
- [加载／刷新／返回首页录像](motion/brand-loading.webm)从首次绘制起记录；已查看完整时间范围的连续帧及12fps头部局部。浅底板先保留占位，图形到达后原位显示。
- [首页完整流程录像](motion/home-flow.webm)已按连续帧查看，覆盖浅弧换组、展开平带、持续循环、向下滚动及返回。原首页动效继续使用既有控制器；`test:home`三档1440／1280／1024px及原九图回收、暂停／键盘、离场、缺图和减少动态通过。
- 233项规则、`db:check`、`pnpm build`类型检查及Node构建、现有`test:ui`四档公共布局／交互通过。Vercel构建、[正式来源预检](preflight.json)及[实际运行包中文PDF](bundle-check.json)通过；首页SSR含两处图形，未新增图标客户端岛，原资源逐字节一致。

数据来自用户确认的现有SVG、真实构建与隔离PGlite虚构账号／空会议列表；SVG和PNG原文件未改动。原始调试与逐帧图位于`.tools/test-artifacts/brand-placement/`。
