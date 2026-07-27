# 系统结构

```text
静态首页 /
  └─ 业务系统入口
       ├─ 年度规划 /business/annual-plan
       │    ├─ 自动总规划：由细致规划查询时计算，不落为可编辑记录
       │    └─ 年度说明、学科细致规划行、多时间块、行级链接与版本快照
       └─ 排期页 /business/operations-schedule
            ├─ GET：读取版本、排期与汇总
            ├─ POST：新做帖 V0
            ├─ PATCH：编辑现有排期
            └─ POST：从来源版本派生改帖 V1+
                       ↓
              Zod → Drizzle 事务 → Neon

operations_content（帖子身份）
  └─ operations_content_version（V0 / V1 / V2）
       └─ operations_content_schedule（发布与推广状态）

operations_annual_plan_year（年度说明）

operations_annual_plan（分区内的规划行当前状态）
  ├─ operations_annual_plan_block（一个或多个连续月份时间块）
  ├─ operations_annual_plan_link（规划行级链接）
  └─ operations_annual_plan_version（不可变历史快照）

年度规划版本：
  V0 = 初始化基线
  V1+ = 用户确认初始化结束后的真实运营修改
```

- 首页保持静态生成；年度规划、排期页面和写入接口设置 `prerender = false`，由 Astro Node adapter 动态运行。
- `src/middleware.ts` 同时保护年度规划、排期页和相关接口，环境变量缺失时失败关闭。
- `src/db/schema.ts` 分开定义年度规划、帖子、版本和排期，`src/db/client.ts` 只在服务端请求时创建连接，校验层维护规划、改帖、排期和延期规则。
- `drizzle/` 保存可追踪的 SQL 迁移；使用 `pnpm db:migrate` 对 `.env` 指向的开发数据库执行迁移。
- development 和 production 是独立 Neon 分支；迁移文件、网页录入的业务数据和应用部署需要分别审核，彼此不会自动同步。
- 数据库连接串和共享凭据只保存在未提交的 `.env` 或运行环境，不使用 `PUBLIC_` 前缀。
