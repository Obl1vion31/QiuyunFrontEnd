# 正式发布核对

- 应用提交：`25a31e8e87df419765badafb89dd7651ccdc77b1`；分支 `codex/month-plan-persistent-pool` 与 `main` 已同步。
- 正式域名：[内容工作台](https://qiuyun-frontend.vercel.app)，解析部署 `dpl_BBznGg97JnKd17hJsMFfTaYdZ2CM`，状态 READY。先独立候选验证再推广，正式与候选部署 ID 一致。
- [候选14项](candidate-smoke.json)、[正式122项与87个资源哈希](public-smoke.json)、[发布记录](production.json)通过；未登录写入口返回401，外站来源403，私有目录404。
- [构建包预检](preflight.json)与[运行包PDF](runtime-bundle.json)通过。测试和截图均来自隔离数据库；本轮无数据库迁移或生产业务写入。
