# 月计划角标叉号与轻量数量器

已自检并发布，正式域名及部署版本已核对。本轮仅调整SVG和本页CSS，沿用原移回、数量、保存及锁定逻辑，无接口或数据库变更。

- 左侧常显10px叉号，桌面定位到卡片右上角，不再占一列；点击直接移回一篇，名称及×2有避让，提示仍为“移回待分配”。
- 右侧桌面数量器实际88×28px、13px数字；透明底、单圈浅边框、无内部隔线，输入／焦点及零值加减规则沿用。触屏保留44px操作范围。
- 本页设计规范和接入说明已替换旧减号及大数量器规格，不扩改其他页面。

放大复查发现中间稿四位数字末位裁切，已调整中部输入宽度，并将空字体简写造成的测量误判改为真实字体字段和滚动宽度检查；中间稿不作为最终验收。

## 查看效果

| 场景 | 证据 |
| --- | --- |
| 桌面角标与数量器 | [1920](screenshots/plan-merged-1920.png) · [1440](screenshots/plan-merged-1440.png) · [1024](screenshots/plan-merged-1024.png) |
| 四位数字1000 | [1440](screenshots/plan-multi-digit-1440.png) · [1024](screenshots/plan-multi-digit-1024.png) |
| 零值与手机回归 | [桌面](screenshots/plan-quantity-controls-1440.png) · [390](screenshots/plan-quantity-controls-390.png) · [320](screenshots/plan-quantity-controls-320.png) |
| 失败／锁定 | [保留输入](screenshots/plan-confirm-failure-1440.png) · [锁定追加](screenshots/monthly-locked-addition-1440.png) |
| 操作过程 | [桌面](video/plan-desktop.mp4) · [触屏](video/plan-phone.mp4) |

17张截图及两段录像的全部0.5秒取样43帧已实际打开审查。桌面重点验收1920／1440／1024px；390／320px仅核对本次改动的明显遮挡、页级溢出、入口及原触屏流程，不声称独立完成整套手机设计。测试数据均为本机隔离合成数据，1000仅为可读性边界样本。

[完整月计划流程](validation/browser.json)通过：逐篇移回、合并、数量输入、零值恢复、暂存刷新、失败重试、保序、重排、遗留／已有、定稿、审批、48小时与锁定追加。实际字号／尺寸、四位数字可读宽度及角标不遮名称／计数另有几何核对，图片和录像独立审查。5项计划摘要测试、公共UI、类型检查、Node／Vercel构建、发布包预检与运行包依赖检查通过；PDF仅核对最终包依赖，不重新声明整份PDF视觉通过。

[源码哈希](validation/source.json)，原始产物.tools/test-artifacts/compact-controls-final；已整合main的公共全宽更新后重新验收。复现：Node构建后运行node --import tsx tests/monthly-workflow.browser.ts、pnpm test:ui与node --import tsx --test tests/monthly-plan-summary.test.ts，使用项目Node22及Playwright缓存；MONTHLY_WORKFLOW_EVIDENCE_DIR指定证据位置。

应用e012707已推送main；正式部署dpl_ArV6qZsevn7NDCovwgRp46yvQTFy为READY且域名一致，候选14项、正式122项及87资源哈希通过：[发布核对](release/README.md)。
