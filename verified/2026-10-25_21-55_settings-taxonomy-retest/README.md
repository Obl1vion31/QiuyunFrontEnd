# 设置、全站字典与独立复测验收

状态：隔离功能与截图已自检，待公网核对。桌面1920／1440／1280／1024px；截图数据全部为隔离PGlite虚构样本，正式分类核对单独记录。

## 关键画面

- [账号权限](settings-permissions-1440.png)：旧规则链接直接进入账号权限。
- [新建学科](annual-subject-editor-1440.png)／[新建分类与失败保留](annual-category-editor-1440.png)：已填规划内容保留，全站字典即时可用。
- [排期选择新增字典](schedule-dynamic-dictionary-1440.png)。
- [推广两轮独立统计](promotion-retest-1024.png)：旧轮100元、新轮30元、帖子累计130元。
- [例会草稿](meeting-draft-retest-1440.png)、[会前V0](meeting-pre-retest-1440.png)、[会后V1](meeting-post-retest-1440.png)：独立轮次卡片与次日复测安排。

各画面另有1920、1280、1024px同名前缀截图。功能记录见[隔离检查](isolated-checks.json)。

## 验证

191项规则检查、类型检查、Node构建、迁移检查与0037兼容执行通过。年度规划、完整例会流程、非推广Inspector及权限/交互回归通过；新增专项验证管理员字典权限、同源限制、旧规则410、旧不复盘规则不阻止7天待办、创建失败保留/取消/重名映射、动态排期真实保存、日度100/30、暂停恢复、同日去重、未来生效、会前/会后、日度锁定与普通历史更正影响预览。冻结V0指标不变。

实现入口：`taxonomy-store.ts`、`promotion-cycles.mjs`、`promotion-replay.mjs`及现有规划／推广／例会组件。生产0037只扩展允许值；迁移前私有47表备份位于项目忽略目录，不公开。
