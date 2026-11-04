# 正式发布核对

- 应用源码 `c6ee76d`，已推送工作分支与main；最终文档/验收另行提交。
- 部署 `dpl_GqaF6bvBHp3jWoRidngpz6xMuGLd` 为READY；[正式站](https://qiuyun-frontend.vercel.app)与候选指向同一部署。
- 候选14项、正式122项与87个资源SHA256匹配通过，保护路由/同源表单/外站Origin/私有目录检查通过；见[candidate-smoke](candidate-smoke.json)、[public-smoke](public-smoke.json)、[部署标识](deployment.json)。
- 正式运行包React、Chromium与中文字体核对通过，实际生成月会5页/周会3页PDF并渲染审查：[运行包核对](runtime-bundle.json)、[月会PDF](runtime-monthly.pdf)、[周会PDF](runtime-weekly.pdf)。

业务视觉证据使用隔离PGlite。公网未登录检查与资源哈希用于核对部署版本，不表述为已登录生产数据页面视觉验收。无迁移或生产业务写入。
