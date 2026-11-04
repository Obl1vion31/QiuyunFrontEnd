# 正式发布核对

应用提交a05b2294a819e905431e4dd378f985c1abdefb90已推送main。沿用qiuyun-frontend项目预构建发布，部署dpl_9BcaxjbenUfk9aCrAi6S283HwKwx为READY，正式域名解析到同一部署。

- [候选核对](candidate-smoke.json)：14项只读路径通过。
- [正式核对](public-smoke.log)：122项及87个资源哈希通过。
- [项目与域名](deployment.json)、[运行包](runtime-bundle.json)及[发布预检](preflight.json)。

未改生产业务数据，无数据库迁移。期间误关联的空临时项目已确认无部署并清理；最终构建和发布均核对原项目ID。
