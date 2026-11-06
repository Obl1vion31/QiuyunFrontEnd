# 依赖修补

react-dom@18.3.1.patch回移[React官方PR26228](https://github.com/react/react/pull/26228)的Node流式编码修复：开发和生产实现仅输出缓冲区中已写入的字节。React版本及客户端实现保持原样，不增加运行时依赖。

由pnpm patchedDependencies和锁文件固定应用，不能直接修改共享node_modules。升级React时先检查上游是否已包含修复，再同步移除补丁与配置；react-ssr-encoding.test.ts和真实页面原始响应检查保留。
