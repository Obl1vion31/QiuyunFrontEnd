 # 运营内容排期 MVP 实施计划

  ## 方案摘要

  - 数据库采用 Neon 托管 PostgreSQL + Drizzle ORM。
  - Astro 增加服务端渲染能力，只让排期页面和写入接口动态运行，首页继续静态生成。
  - 通用 Node 环境使用标准 postgres 驱动，避免绑定 Neon 专用 API，也避免为 Node 18 固定旧版驱动。
  - 使用共享 HTTP Basic Auth 保护排期页面和接口；未配置账号密码时默认拒绝访问。
  - 不升级 Astro、React 或 Node 大版本，不新增独立后端、完整登录系统或部署配置。
  - 实施前由用户在本地 .env 写入 Neon 开发库连接串和共享账号，不在聊天、代码或 Git 中保存凭据。

  ## 核心实现

  ### 服务端与数据库

  - 增加与 Astro 4 兼容的 @astrojs/node@8.3.4，配置 output: "hybrid" 和 standalone Node adapter。
  - 增加 drizzle-orm、drizzle-kit、postgres、zod、dotenv。
  - 增加以下命令：
      - pnpm db:generate：生成迁移。
      - pnpm db:check：检查迁移一致性。
      - pnpm db:migrate：初始化或升级数据库。
      - pnpm start：运行构建后的 Node 服务。

  - 增加 .env.example，并修正 .gitignore，确保真实 .env 不会提交。
  - 环境变量：
      - DATABASE_URL
      - OPERATIONS_ADMIN_USER
      - OPERATIONS_ADMIN_PASSWORD

  - 数据库、认证变量只允许服务端模块读取，不使用 PUBLIC_ 前缀，不进入浏览器代码。

  ### 数据表与字段

  创建 operations_content_schedule 表：

  - id：UUID 主键。
  - content_name：内容名称。
  - content_type：内容类型，使用文本字段；表单提供常见类型建议，同时允许后续扩展。
  - is_promoted：是否推广。
  - sync_to_moments：是否同步朋友圈。
  - current_stage：pending / testing / promoting / paused / completed。
  - project_doc_name：项目文档名称，可空。
  - project_doc_url：项目文档链接，可空。
  - planned_publish_date：应发日期。
  - actual_publish_date：实发日期，可空。
  - completion_status：pending / on_time / delayed / incomplete。
  - delay_reason：延期或未完成说明，可空。
  - created_at、updated_at：审计时间。
  - 为应发日期、当前阶段、完成情况和推广状态建立索引。

  月份和周次从 planned_publish_date 推导，不重复存储，避免字段不一致。关联复盘暂不加入，因为复盘功能明确不在本次范围内。

  ### 页面、接口和权限

  - 新增 /business/operations-schedule 服务端页面。
  - 首页“业务系统”入口连接到该页面。
  - 页面采用清晰的“排期台账”布局：
      - 顶部为月份与基础汇总；
      - 桌面端为新增表单和排期表格双栏；
      - 移动端依次堆叠；
      - 使用语义化表格、明确状态标签、键盘焦点和字段错误提示；
      - 不复制首页的高动效，不使用复杂图表或通用卡片墙。

  - 新增受保护的 POST 接口 /api/operations-content：
      - Zod 服务端校验；
      - 写入数据库后使用 303 跳回列表；
      - 前端增强脚本保留输入并展示字段错误；
      - 校验请求来源，拒绝跨站写入；
      - 数据库不可用时返回明确的 503。

  - Basic Auth 同时保护页面和 API：
      - 凭据缺失时失败关闭；
      - 部署时必须使用 HTTPS；
      - 当前共享账号无法区分操作者，也无法做细粒度审计，这是后续正式权限系统需要解决的风险。

  ### 校验、统计和筛选

  表单覆盖用户要求的全部字段，并增加这些一致性规则：

  - 名称、类型、阶段、应发日期和完成情况必填。
  - 文档链接填写后必须是合法的 HTTP/HTTPS 地址。
  - “按时完成”或“延期完成”必须填写实发日期。
  - “延期完成”或“未完成”必须填写情况说明。
  - 阶段为“已完成”时，完成情况必须是按时完成或延期完成。
  - 空字符串统一写为 NULL。

  实现全部四种筛选：

  - 月份；
  - 是否推广；
  - 当前阶段；
  - 完成情况。

  默认显示当前月，并提供“全部月份”。列表按应发日期升序、创建时间倒序排列。

  汇总默认统计当前月；选择具体月份后统计该月，选择“全部月份”时仍明确显示当前月汇总。其他筛选只影响列表，避免阶段筛选把月度总览数字变得失去意义。统计包括：

  - 内容总数；
  - 待发、测试期、投放期、已完成；
  - 延期完成或未完成；
  - 推广帖、非推广帖；
  - 已同步朋友圈；
  - 项目文档名称或链接缺失。

  ## 文档同步

  - 更新根 README.md、src/README.md、docs/README.md 和 docs/ROADMAP.md。
  - 新建 docs/STRUCTURE.md，说明静态首页、动态业务页、服务端接口、数据库层和迁移目录的关系。
  - 更新 docs/DECISIONS.md，覆盖“当前不建设数据库和业务模块”的旧结论。
  - 更新 docs/DESIGN.md，记录业务页面低动效、高密度可读台账的规则。
  - 按用户明确要求，重新建立：
      - docs/exec-plans/phase-02-business-system.md
      - docs/exec-results/phase-02-business-system.md

  - 因这些阶段目录属于明确要求的例外，为其补充简短 README.md，解释用途和维护边界。
  - 新增数据库目录说明，记录字段、迁移、查询入口和密钥安全边界。
  - 不修改 AGENTS.md，不提交或推送 Git。

  ## 验证计划

  - pnpm install
  - pnpm db:generate
  - pnpm db:check
  - pnpm db:migrate
  - pnpm check
  - pnpm build
  - 使用共享账号验证未认证请求返回 401，认证后可访问页面。
  - 新增一条临时排期，刷新后确认仍存在，且列表和统计同步变化；验证后从开发库清理该测试记录。
  - 分别验证月份、推广状态、阶段和完成情况筛选。
  - 验证非法链接、缺少实发日期、缺少延期说明不会写入数据库。
  - 检查构建产物，确认 DATABASE_URL 和共享密码未进入客户端资源。
  - 检查桌面端、窄屏、空数据和数据库不可用状态。
  - 若实施时 .env 尚未配置，只能完成类型、构建和迁移文件检查，真实保存验证必须标记为未完成。

  ## 已确认假设

  - Neon 使用独立开发分支，正式数据与开发验证隔离。
  - 当前阶段只有新增和查看，不提供编辑、删除、批量导入或导出。
  - HTTP Basic Auth 是临时内部保护，不视为正式多人权限系统。
  - 不创建模拟业务数据，不创建 Docker、生产部署或自动同步配置。
  - Astro/Node 大版本升级另行规划，本次只引入兼容的服务端能力。