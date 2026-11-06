> 本批为合并前基线的早期验收。当前正式功能及重新采集的最终界面见[最终验收](../2026-11-07_04-41_schedule-inspector-final/README.md)。

# 排期 Inspector：单层浮层与一致性修复

状态：已自检并发布，待同步main。图像均为隔离样张。

[前后对比器](comparison.html) · [真实操作录像](media/interaction-1440.mp4) · [深滚动返回录像](media/deep-scroll-1440.mp4)

原版为正式基线 `79fe541`（渲染工作树4db5290的应用源码与其一致），候选应用 `27245f9`。两版使用相同虚构PostgreSQL样本、稳定业务ID、账号、日期和1440×1000／1920×1000／1024×1000视口；[样本依据](proof/sample.json)。主对比图在screenshots；interaction与history是独立真实业务回归样本，均不连接共享业务库。

## 具体修改

| 项目 | 最终行为 |
| --- | --- |
| 面板呈现 | 排期使用680px右侧原生模态Sheet；日历、顶栏和侧栏不挤压。详情、编辑、发布、改帖在同一层切换 |
| 信息层级 | 运营计划、版本与改帖、历史使用同级标题；取消版本区重复标题和嵌套留白。应发、实发、发布状态可见，资料入口就近 |
| 交互 | 外层220ms，内层120ms内容淡入；取消回详情，×／Esc／遮罩关闭整层，未保存只确认一次。保存反馈放到底部，头部不被顶动 |
| 保存 | 使用现有月份读取局部同步卡片、统计、Week、详情及凭据；整月草稿保留。已写入但读取失败只重读，慢响应不抢回旧选择 |
| 业务门禁 | 来源actualPublishAt非空才允许改帖，未来登记沿用现行口径；直写、审核及旧申请重放均校验，未发布返回422／SOURCE_NOT_PUBLISHED |
| 历史 | 仅before===null为建立排期，直接列填写内容；后续只列真实原值→新值。原始历史保留，助手共用摘要 |

早期调试图中版本区过高、同级标题混用的问题未达到视觉标准；本批已重新修正和验收。其他Inspector保留原呈现，共享层修正切帖重播、读取取消与选中更新。

## 实际验证

| 范围 | 已检查 |
| --- | --- |
| 双角色三档桌面 | 相同对象的详情、编辑、发布、改帖及返回；字体、标题层级、单一dialog、关闭、焦点、滚动 |
| 真实保存 | 1440实际编辑、未来发布、V1创建；员工发布、失败输入、未保存取消；局部更新不发起整页导航 |
| 慢与失败 | 断网、读取失败只重试GET、读取期间关闭后切帖、旧响应、快速开关、减少动态效果 |
| 月度流程 | 首轮工作区13组：拖放、遗留、Week5、草稿、待审、退回、封存、真实PDF；实际Vercel包复验通过 |
| 门禁与历史 | 两角色直写／审核／禁用、未来登记、最新未发版本、旧审批重放、建立摘要、清空及更正 |
| 公共消费者 | 公共UI、年度、非推广、助手、登录及发布回归通过；其他模块呈现保持 |
| 例行检查 | Node／Vercel构建、类型0错误、277规则、schema一致 |

[运行包复验](proof/runtime-checks.json) · [单层操作](proof/single-panel.json) · [门禁](proof/revision-gate.json) · [首轮工作区](proof/workspace.json) · [月度链路](proof/monthly-flow.json)

手机仅核查390／320的明显遮挡、溢出和关闭入口。1024月历保留既有两行省略，完整名称由原title和Inspector读取。

## 性能与位移

使用原生requestAnimationFrame／performance，业务Date固定；不使用模拟RAF的Playwright时钟，不同时录屏或逐帧读DOM。下表为三轮暖操作P95；首轮及逐帧原始数据一并保留。

| 桌面宽度 | 打开发布登记，原版→候选 | 取消回详情，原版→候选 |
| --- | --- | --- |
| 1920 | 100.0 → 50.0ms | 100.0 → 50.0ms |
| 1440 | 83.4 → 33.4ms | 66.8 → 33.4ms |
| 1024 | 66.7 → 33.3ms | 66.7 → 33.4ms |

[原始采样](proof/performance.json)。1920候选仍约50ms，未达到约33ms目标；这属于WSL headless同环境对照，不能替代用户实机帧率。

关闭后上移未在隔离环境复现，不声称已定位原根因。新路径18组月历／台账深滚动、1600ms慢首读、×／取消／Esc记录到页面滚动、顶栏和侧栏坐标均保持（误差≤1px），取消恢复详情滚动与来源焦点。[逐帧几何](proof/deep-scroll.json)

## 关键图与录像

[详情局部：同级标题及紧凑版本关系](detail-focus-1440.png)


- [已发布详情：原版](screenshots/before-admin-published-detail-1440.png) ／ [候选](screenshots/after-admin-published-detail-1440.png)
- [发布登记：原版](screenshots/before-admin-publication-1440.png) ／ [候选](screenshots/after-admin-publication-1440.png)
- [建立排期摘要](history/created-history-1440.png) ／ [后续更正](history/changed-history-1440.png)
- [保存成功但读取失败](interaction/saved-read-failure-1440.png)
- [真实操作MP4](media/interaction-1440.mp4) ／ [原始WebM](media/interaction-1440.webm)
- [深滚动MP4](media/deep-scroll-1440.mp4) ／ [原始WebM](media/deep-scroll-1440.webm)

录像为实际浏览器操作，已抽帧审查进入／退出、内部切换和失败返回；没有使用静态演示替代。截图及媒体校验见[素材索引](proof/assets.json)。

[正式工作台](https://qiuyun-frontend.vercel.app/business/operations-schedule)

## 发布核对

正式部署 `dpl_4zdBpAgGWJdNfyMgjxNSqgKrLVLH` READY，与候选一致；100项检查、76个资源哈希通过，无生产测试写入或数据库迁移。应用源码与发布输入27245f9一致，后续提交为验收记录与测试接入。

[正式核对](proof/production.json) · [候选核对](proof/candidate.json) · [发布记录](proof/release.json)
