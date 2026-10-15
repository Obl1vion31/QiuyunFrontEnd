# 私有资料

本目录保存本机导入来源与核对素材，正式业务事实保存在 PostgreSQL。原始资料不修改、不提交、不部署；各目录只提交 README。

- [imports/](imports/README.md)：用户提供的原始 Excel。
- [references/](references/README.md)：界面和数据核对截图。

数据库备份继续保存于被忽略的 `.tools/backups/`，测试截图位于 `.tools/test-artifacts/`，不复制到公开资源。一次性导入遵循[维护脚本](../scripts/README.md)中的预检、显式写入、事务和幂等要求。
