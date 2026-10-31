# 湫云 E3 纯图标与全站 favicon

用户选择 E3 云形翻转带。按原图描摹为三个纯矢量路径，移除方案编号、中文与拼音；SVG 和透明 PNG 作为公开资源，站点图标由同源图形生成。已自检并发布至正式域名。

## 资源与效果

- [SVG 主文件](../../public/images/brand/qiuyun-mark.svg)：透明底，深蓝／青绿纯色，无内嵌位图。
- [透明 PNG](../../public/images/brand/qiuyun-mark.png)：2048×1408px；外部、云内留白及接缝均透明。
- [桌面对照](screenshots/icon-preview-1440.png)、[手机对照](screenshots/icon-preview-390.png)：同一真实文件在白底、透明棋盘及浅色背景上显示，并比较深浅主题的16／24／32／48／96px站点图标。
- [登录桌面](screenshots/login-1440.png)、[登录手机](screenshots/login-390.png)、[工作台桌面](screenshots/workspace-1440.png)、[工作台手机](screenshots/workspace-390.png)。六张最终稳定图均已实际打开检查。
- 正式站浏览器复查：[SVG实图](screenshots/public-svg-1024.png)、[登录桌面](screenshots/public-login-1440.png)、[登录手机](screenshots/public-login-390.png)，三图均已实际查看。

站点入口为保证深浅主题下可辨认，使用白色底板；可下载主图保持透明。PNG 从 SVG 渲染，不重新生成轮廓；首页、登录及七个工作台页面通过 `SiteIcons.astro` 共用引用和缓存版本。

## 实际验证

- 233项规则测试与`db:check`通过；`pnpm build`包含类型检查并完成Node构建。
- 现有`pnpm test:ui`通过，覆盖1440／1280／390／320px公共布局与原交互。
- 图标专项使用正式构建及隔离PGlite，核对管理员／员工可访问页面的共享引用、员工设置页保持403、登录及五项资源可读取；[检查记录](checks.json)。
- 实际浏览器像素检查透明PNG为2048×1408，外角与内部留白alpha均为0；三路径SVG不含文本、位图或外部图像。[导出记录](export-report.json)。
- 1440／390px图标与页面截图已查看，图标无文字残留、裁切或形变，小尺寸深浅底可辨。此次只修改静态图标及head引用，未新增界面动效。
- Vercel production构建、正式域名manifest、五项新资源哈希和运行依赖预检通过；实际运行包中文PDF201251字节通过。[发布预检](preflight.json)、[运行包检查](bundle-check.json)。

数据来源：用户确认的E3原图；界面检查使用隔离虚构账号及空会议列表，不连接共享Neon进行业务写入。

## 正式发布

- 应用源码：`281ac6be750488cf3503889c61608d1830b25321`；分支`codex/qiuyun-cloud-icon`。
- 部署`dpl_4ZWVyjuhdSCswk8PKFNy7xLohWZD`，[正式站](https://qiuyun-frontend.vercel.app)。11项[候选检查](candidate.json)、104项[正式检查](public-smoke.json)通过，76个资源哈希一致；包含同源表单401、外站403、业务页登录保护和私有路径404。
- [公网SVG](https://qiuyun-frontend.vercel.app/images/brand/qiuyun-mark.svg)、[公网透明PNG](https://qiuyun-frontend.vercel.app/images/brand/qiuyun-mark.png)、[favicon](https://qiuyun-frontend.vercel.app/favicon.svg)。
