# 非推广复盘：原帖计划、原始量与周会合卡

状态：已自检、已推送main并发布，待用户反馈。数据来自隔离 PGlite／本机 PostgreSQL；截图中的帖子、数量和账号均为测试样本。业务时钟固定在 2026-11-24，未向正式库写入样本。

## 关键效果

- [发布登记：即时复盘与可选15天](screenshots/publication-instant-1440.png)
- [原始量录入与自动点击率](screenshots/non-promotion-input-1440.png)
- [持续复盘计划与追加日期](screenshots/continuous-plan-390.png)
- [同帖7／15天、本次及往期对照](screenshots/weekly-15day-1440.png)
- [手机7／15天](screenshots/weekly-15day-320.png)
- [手机保存成功及操作可达](screenshots/touch-save-390.png)
- [实际定稿PDF](pdf/weekly-comparison.pdf)，[第1页](pdf/page-1.png)、[第2页](pdf/page-2.png)
- [桌面操作录像](videos/desktop.mp4)、[手机操作录像](videos/mobile.mp4)

## 逐视图覆盖

以下五档均为1920／1440／1024／390／320px，图片文件按同一前缀加宽度命名。稳定图43张已逐组实际查看；手机周会使用真实视口，避免全页拼接使固定导航穿过卡片。

| 视图与状态 | 覆盖 | 检查结果 |
| --- | --- | --- |
| 首次发布登记，即时＋15天、关闭7天 | 五档 `publication-instant` | 累计天数、复选框和固定保存区可读；真实事务保存 |
| 已复盘历史，含长标题、标准及自定义、最大整数阅读量 | 五档 `non-promotion-history` | 阅读量完整、主值对齐；手机阅读量独立一行、比率并排 |
| 指标Inspector，原始量与计算预览 | 五档 `non-promotion-input` | 曝光／阅读成对，点击率只读；输入与焦点保持 |
| 持续复盘Inspector，追加／取消后的历史 | 五档 `continuous-plan` | 独立日期维护、已填节点保护、原帖计划继承 |
| 员工相同数据历史 | 五档 `employee-history` | 同源结果、长标题／真实零值与两项指标层级一致 |
| 周会7天本次、15天未到期 | 五档 `weekly-7day` | 同帖合卡；未来留空不补零、不阻塞定稿 |
| 周会15天本次、7天往期及同帖多个自定义 | 五档 `weekly-15day` | 桌面对齐、手机上下；本次蓝色、往期中性；按帖与按节点计数分开 |
| 零曝光 | 1440／320px `zero-exposure` | 点击率为“—”，3秒率保留；保存再开不变假零 |
| 503失败／重试 | 1440px `save-failure`、`save-retry` | 输入保留，重试原位更新 |
| 手机触控／展开／保存 | 390px `weekly-touch`、`weekly-expanded`、`touch-input`、`touch-save` | 往期折叠、局部滚动、保存完整可达，不挤压卡片 |

## 功能与兼容验证

- `pnpm test`：242项通过。`pnpm db:check`、Node与Vercel类型检查／构建通过；Vercel实际运行包的React、Chromium和中文PDF验证通过。
- `test:non-promotion-plans` 对应规则、真实接口与浏览器：三种方式、即时独立节点／可选7与15天、多次持续节点、跨版本原帖身份、转换为非推广、调整／取消及已填保护、T+1／精确截止、服务端原始量计算、零曝光／零阅读、失败重试、定稿冻结均通过。
- 现有非推广Inspector、公共UI、发布、朋友圈同步确认、例会创建、现行讨论／PDF与协作工作台回归通过。协作工作台和朋友圈双角色专项使用真实本机PostgreSQL；审批提交／批准与新节点回放另由新接口集成验证。
- 0042至0043真实PostgreSQL迁移、原标准唯一键写入、并发新增、归属及数量约束通过。正式迁移前后私有备份核对46张非瞬态表一致，新表为空；原始业务事实与旧快照未改写。[保留性摘要](migration-preservation.json)
- 旧审批无新设置时不扩展快照；旧空值不改变指纹。旧版本复盘仍可读，排除新增待办及基准样本。标准指标按各自有效样本取算术均值；自定义不混入，累计量不相加。

## 实际视觉审查

已查看稳定图、实际PDF两页；桌面16.96秒424帧、手机4.24秒106帧全部连续帧单独检查，非仅抽取开头结尾。录像包含快速改变视口、默认浏览器焦点动画和故障注入；中间帧不作为最终效果。审查记录见[清单](visual-review.json)，浏览器行为见[核对结果](browser-checks.json)。

自检中修正了自定义指标主值基线、长整数阅读量空间、PDF卡片密度和差值位置；同时修复发布表单重复原生校验抢先于朋友圈提示的问题，并重跑其真实双角色回归。旧测试中改帖重复待办、可手填点击率等断言已按新口径更新。

浏览器为本机Linux Chromium，手机为触控视口模拟；未将此结果声称为真实iOS／Safari实机验收。正式站写入仍由隔离环境验证，公网仅执行只读与无权限请求核对。

## 发布

应用实现 `f6122ed`，部署 `dpl_6j8RSaC6yMT5G5AfnxrCtkXJMXQQ`，正式域名 https://qiuyun-frontend.vercel.app。候选10项、正式108项检查与78个资源哈希通过，正式域名指向本部署且为READY；正式数据三视图只读查询无错误、节点身份不重复。工作分支 `codex/nonpromotion-review-plans` 和 main 已同步，兼容迁移0043已执行。详见[发布记录](release.json)、[候选检查](candidate-smoke.json)、[正式检查](public-smoke.json)及[只读模型检查](production-read-model.json)。
