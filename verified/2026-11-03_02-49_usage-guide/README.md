# 使用说明：对照表与跟随目录

应用代码：`65d157e`。数据来自隔离PGlite与验收账号；本批37张稳定截图、28张首屏过程／稳定图、10段录像共1204帧已实际查看。状态：已自检，待真实使用反馈。

正文保留业务对照表，章节上下组织；正文和右侧目录使用完整内容区宽度。管理员保留设置页签与维护入口，员工只读取四个公共章节，手机目录使用公共折叠气泡。

## 稳定截图

| 角色／宽度 | 首屏与表格 | 日期与区间 | 页尾 |
| --- | --- | --- | --- |
| 管理员 1920 | [查看](screenshots/admin-intro-1920.png) | [查看](screenshots/admin-dates-1920.png) | [查看](screenshots/admin-end-1920.png) |
| 管理员 1440 | [查看](screenshots/admin-intro-1440.png) | [查看](screenshots/admin-dates-1440.png) | [查看](screenshots/admin-end-1440.png) |
| 管理员 1024 | [查看](screenshots/admin-intro-1024.png) | [查看](screenshots/admin-dates-1024.png) | [查看](screenshots/admin-end-1024.png) |
| 管理员 390 | [查看](screenshots/admin-intro-390.png) | [查看](screenshots/admin-dates-390.png) | [查看](screenshots/admin-end-390.png) |
| 管理员 320 | [查看](screenshots/admin-intro-320.png) | [查看](screenshots/admin-dates-320.png) | [查看](screenshots/admin-end-320.png) |
| 员工 1920 | [查看](screenshots/employee-intro-1920.png) | [查看](screenshots/employee-dates-1920.png) | [查看](screenshots/employee-end-1920.png) |
| 员工 1440 | [查看](screenshots/employee-intro-1440.png) | [查看](screenshots/employee-dates-1440.png) | [查看](screenshots/employee-end-1440.png) |
| 员工 1024 | [查看](screenshots/employee-intro-1024.png) | [查看](screenshots/employee-dates-1024.png) | [查看](screenshots/employee-end-1024.png) |
| 员工 390 | [查看](screenshots/employee-intro-390.png) | [查看](screenshots/employee-dates-390.png) | [查看](screenshots/employee-end-390.png) |
| 员工 320 | [查看](screenshots/employee-intro-320.png) | [查看](screenshots/employee-dates-320.png) | [查看](screenshots/employee-end-320.png) |
折叠目录：[管理员1024](screenshots/admin-directory-1024.png)、[390](screenshots/admin-directory-390.png)、[320](screenshots/admin-directory-320.png)；[员工1024](screenshots/employee-directory-1024.png)、[390](screenshots/employee-directory-390.png)、[320](screenshots/employee-directory-320.png)。[减少动态效果](screenshots/employee-reduced-390.png)。

## 操作与首屏过程

- 实际目录操作：[桌面录像](video/guide-1440.webm)、[手机录像](video/guide-390.webm)。点击锚点、手动滚动、前后退均保留正文；窄屏列表选择后关闭。
- 双角色1440／390px分别覆盖冷缓存、暖刷新、站内进入及慢字体／提醒，共16场景。[首屏测量](first-paint/result.json)包含真实MiSans字形与各帧位置。`first-paint/screenshots/`的early为过程，stable为稳定终态；站内进入过程保留公共页面过渡，不能用中间帧代替最终图。
- 首屏录像：[管理员桌面](first-paint/video/admin-entry-1440.webm)、[手机](first-paint/video/admin-entry-390.webm)，[员工桌面](first-paint/video/employee-entry-1440.webm)、[手机](first-paint/video/employee-entry-390.webm)；慢请求：[管理员桌面](first-paint/video/admin-slow-1440.webm)、[手机](first-paint/video/admin-slow-390.webm)，[员工桌面](first-paint/video/employee-slow-1440.webm)、[手机](first-paint/video/employee-slow-390.webm)。
- 全部截图和连续帧总览见[审查清单](inspection/manifest.json)，原始拆帧保留在`.tools/test-artifacts/usage-guide/inspection/`。

## 验证

251项规则、schema检查、Node类型检查／构建、登录权限、共享UI与Inspector草稿保护、内容职能接口／浏览器回归通过。说明专项检查双角色五档、员工GET／HEAD与默认跳转、管理页／API403、未登录跳转、员工HTML省略维护区与管理数据、目录键盘／Esc、深链接及前后退、页尾高亮、页面往返清理、角色导航记忆与减少动态效果。[说明浏览器结果](browser.json)。Impeccable设计检测无命中：[结果](design-detector.json)。

## 发布

应用已发布到[正式使用说明](https://qiuyun-frontend.vercel.app/business/settings?view=guide)。部署为 `dpl_49QdyKxDgVjXeK1zFmFktk1Ad7Ae`，正式域名指向该部署且READY；[候选14项](candidate-smoke.json)、[正式122项与87个资源哈希](public-smoke.json)通过。[发布记录](release.json)。
