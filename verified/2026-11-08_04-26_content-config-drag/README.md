# 业务配置：推广与非推广分组、拖动排序

应用a103485，基于已发布0316626。使用独立PostgreSQL样本，正式业务测试写入为0；不增加数据库字段或迁移。19图与原速录像172个8fps抽样帧已实际查看，已自检并发布，待用户反馈。

## 看效果

- [完整类型列表：1440](screenshots/admin-1440-types.png) · [1920](screenshots/admin-1920-types.png) · [1024](screenshots/admin-1024-types.png)
- [按住手柄、邻行让位与空档](screenshots/admin-1440-drag-gap.png) · [长列表自动滚动](screenshots/admin-1440-drag-autoscroll.png) · [1024长标题占位](screenshots/admin-1024-long-title-drag.png)
- [推广编辑](screenshots/admin-1440-promotion-editor.png) · [非推广编辑](screenshots/admin-1440-nonpromotion-editor.png)
- [用途目录](screenshots/admin-1440-purposes.png) · [失败重试](screenshots/admin-1440-sort-retry.png) · [修订冲突](screenshots/admin-1440-sort-conflict.png)
- [分组随默认类型保存更新](screenshots/admin-1440-type-group-changed.png) · [减少动态效果](screenshots/admin-1440-reduced-motion.png)
- [原速操作录像](video/admin-config.mp4) · [原已发布界面](comparison/before-1440.png)

录像从首次绘制开始，包含主动切换不同视口；固定画布外灰边不属于网页。稳定整页图回顶部后等待实际绘制，避免固定壳层出现在中段；减少动态效果图以实际可见视口确认文字，不沿用缺字中间图。此前图像问题已重拍，不作为最终证据。

## 实际覆盖

| 状态 | 视口与检查 |
|---|---|
| 类型／用途 | 1920／1440／1024，统一正文外边界、行锚点、编辑及右侧手柄；非推广无用途列及待归类文字 |
| 鼠标与键盘 | 1440真实按住拖动、等高空档、邻行让位、边缘自动滚动、松手仅保存一次；空格抓取／保存、方向键及Esc取消与焦点恢复 |
| 编辑 | 1440推广字段及非推广两字段；新非推广空用途，旧映射、实际推广消耗及已录人数保留；默认改变后进入对应组 |
| 错误与刷新 | 503保留顺序并重试；409保留预览，取消载入保持，确认载入最新；未保存导航取消；硬刷新首次操作及站内导航后操作 |
| 长标题与空组 | 1024长标题拖动等高占位；1440空推广组；减少动态效果无行过渡、仍可排序和取消 |
| 手机 | 390／320仅明显遮挡及页级溢出，数据横滚留在表格内，不作为手机完整填写验收 |

[浏览器结果](checks/browser.json)记录7组、19图和实际MiSans VF字形；301规则、类型0错误／0警告、schema、Node／Vercel构建、真实运行包及共享UI通过。[审查清单](inspection/manifest.json)、[验证摘要](checks/verification.json)。独立复核指出恢复按钮和整页捕获的问题，修复后4张原路径最终图复看通过。

## 发布

应用a103485及验收记录已同步main。正式域名与候选同为READY部署dpl_HVLhcA4xKvVNQ3nM7nf8NXAqLrdA；候选26项／25资源，正式26项／77资源哈希通过，同源未登录表单401、外站Origin403及管理保护保持。[发布结果](checks/release.json)与[正式核对](checks/production-probe.json)。

实际Vercel运行包依赖、信任域名及隔离中文PDF生成烟测通过，本轮不修改PDF版式、未逐页审查PDF。[运行包结果](checks/runtime.json)。本次无迁移或正式业务数据写入，根工作区的并行未提交修改保留。
