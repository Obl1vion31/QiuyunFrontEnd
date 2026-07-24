# 系统结构

```text
静态首页 /                         动态排期页 /business/operations-schedule
  └─ 业务系统入口 ─────────────────────────┤
                                            ├─ GET：读取版本、排期与汇总
                                            ├─ POST：新做帖 V0
                                            ├─ PATCH：编辑现有排期
                                            └─ POST：从来源版本派生改帖 V1+
                                                       ↓
                                              Zod → Drizzle 事务 → Neon

operations_content（帖子身份）
  └─ operations_content_version（V0 / V1 / V2）
       └─ operations_content_schedule（发布与推广状态）
```

- 首页保持静态生成；排期页面和写入接口设置 `prerender = false`，由 Astro Node adapter 动态运行。
- `src/middleware.ts` 同时保护排期页和接口，环境变量缺失时失败关闭。
- `src/db/schema.ts` 分开定义帖子、版本和排期，`src/db/client.ts` 只在服务端请求时创建连接，`src/db/validation.ts` 维护新做帖、改帖、排期和延期规则。
- `drizzle/` 保存可追踪的 SQL 迁移；使用 `pnpm db:migrate` 对 `.env` 指向的开发数据库执行迁移。
- 数据库连接串和共享凭据只保存在未提交的 `.env` 或运行环境，不使用 `PUBLIC_` 前缀。
