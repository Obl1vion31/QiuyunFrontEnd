# 全站材质与交互发布核对

2026-11-07按用户“发布，推送main”授权发布，全站包含排期。正式入口：[内容工作台](https://qiuyun-frontend.vercel.app/business/operations-schedule)。

- 应用源码364f297，提交与发布输入4db5290；沿用已认可的[全站逐页前后对比、三档桌面和真实动效](../2026-11-07_00-15_workspace-glass-all/README.md)。此前“未发布”标识是采集时状态，原图保留。
- Vercel部署dpl_CtzwSkPNmLyC6DyXtYMywYFcE5Dj，独立地址qiuyun-frontend-e7f30hf43-opgobl1v-5358.vercel.app；正式域名与候选指向同一READY部署。[独立部署](checks/release-deployment.json)／[正式核对](checks/release-production.json)。
- 基于远端3e8d037复核，无新增功能差异，main由3e8d037正常快进到4db5290；本记录提交随后同步main。工作分支codex/workspace-glass-release，发布工作树.tools/releases/workspace-glass-release-20261107。原工作区未提交修改和本地对比器均保留。

## 验证

- 独立工作树重新frozen-lockfile离线安装、迁移规则检查与生产Vercel构建通过，类型0错误／0警告、44项既有提示；复用同应用已通过的274规则与公共／相关业务回归。无数据库迁移、无正式业务数据写入。
- 发布包复核正式HTTPS信任、React18编码修补、全部4个Chromium压缩运行文件和72项JS／CSS清单。依赖实际位于函数包内，没有引用构建目录之外的node_modules。[发布包](checks/release-package.json)。
- 实际Vercel运行包在本机隔离PostgreSQL通过排期13组：真实新建、来源拖放／键盘、整月草稿、失败保留、待审占用、提交退回重交、管理员核对及封存后历史。服务端真实生成原21篇预排期和实际3篇封存文件，已查看全部8页。[回归](checks/runtime-schedule.json)、[预排期](pdf/preplanned-monthly.pdf)、[封存](pdf/sealed-monthly.pdf)。
- 同运行包全站1920／1440／1024桌面重新渲染，稳定样本摘要与已认可候选一致；页面错误为空，[页面记录](checks/runtime-pages.json)、[概览图](runtime-pages.jpg)。角色和交互的完整覆盖仍见发布前对比批次。
- 独立部署保留既有Vercel访问保护，通过已登录CLI完成10项检查及4项资源哈希，未更改保护设置。[候选检查](checks/release-smoke-candidate.json)。
- 正式域名99项检查通过，75项静态资源哈希匹配；首页／登录、业务页登录保护、API未登录校验、私有路径404、同源multipart／URL编码表单401和外源403均通过。[公网检查](checks/release-smoke-production.json)。
- 正式首页／登录在1920／1440／1024实际浏览器检查字体、清晰材质、无页面溢出与JS错误。[记录](checks/public-browser.json)。业务写入与双角色流程只在隔离样本验收，未对正式业务造数据或反复读取大快照。

## 关键图像

- 正式登录：[1920](public/login-1920.png) · [1440](public/login-1440.png) · [1024](public/login-1024.png)。
- 正式首页：[1920](public/home-1920.png) · [1440](public/home-1440.png) · [1024](public/home-1024.png)。
- 同一发布包的隔离样本：[排期](runtime/schedule-1440.png) · [月会](runtime/monthly-1440.png) · [推广](runtime/promotion-1440.png) · [非推广](runtime/nonpromotion-history-1440.png)。runtime目录同时保留三档，不冒充正式业务数据。
