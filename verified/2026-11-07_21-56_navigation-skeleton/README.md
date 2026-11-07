# 切页骨架屏 B：正式实施验收

历史记录：用户随后撤销B，正式实现改为A细线方案。本批截图、录像与发布检查仅描述当时的B版本，不能作为当前效果依据；源码快照以.txt保存，不参与构建。

已自检并发布；待用户反馈。应用代码 `35e19a5e1c7fb7c07daaba8779e99bec96a17bb4`，基于已发布 main `be5f800`，保留根工作区并行修改。

等待超过120ms显示目标骨架，1200ms后补充提示，结果就绪后180ms原位淡入。快速就绪不补播，连续改选直接衔接下个骨架；减少动态效果时静态交接。公共MiSans、蓝色、磨砂壳层和正文边界保持。

## 录像与关键图

同一“排期管理 → 非推广复盘”路径、同一隔离样本，录像原速。

| 场景 | 录像 | 关键图 |
| --- | --- | --- |
| 1440，快速请求 | [播放](video/admin-1440-80.mp4) | [结果](screenshots/admin-1440-80-complete.png) |
| 1440，800ms | [播放](video/admin-1440-800.mp4) | [加载](screenshots/admin-1440-800-loading.png) |
| 1440，2500ms | [播放](video/admin-1440-2500.mp4) | [加载](screenshots/admin-1440-2500-loading.png)／[结果](screenshots/admin-1440-2500-complete.png) |
| 1920，2500ms | [播放](video/admin-1920-2500.mp4) | [加载](screenshots/admin-1920-2500-loading.png) |
| 1024，2500ms | [播放](video/admin-1024-2500.mp4) | [加载](screenshots/admin-1024-2500-loading.png) |
| 减少动态效果 | [播放](video/reduced-1440.mp4) | 见录像逐帧合图 |
| 取消、连续改选、前后退 | [播放](video/rapid-1440.mp4) | [取消返回](screenshots/cancel-return-1440.png)／[最后目标](screenshots/rapid-latest-1440.png) |
| 未保存输入取消离开 | [播放](video/draft-1440.mp4) | [输入保留](screenshots/draft-retained-1440.png) |

[简短动图](video/navigation-b.gif)；全部53张状态图见screenshots，39张审查合图及889抽样帧索引见[manifest](inspection/manifest.json)。其中连续切页最后修正后补跑并重看238帧；32张合图与前次已审查内容像素一致，另外重看受影响的状态合图。

## 验证依据

- 实际Vercel运行包与本机隔离PostgreSQL，8篇虚构样本；管理员／员工，1920／1440／1024px，80／800／2500ms。真实字体、骨架几何、快速不闪、一次HTML请求、取消与失败恢复、七模块键盘切换、草稿保护及前后退通过。[29组结果](checks/navigation.json)。最后仅补跑连续切页并逐帧断言衔接，中途不露出来源页。
- 390px仅检查明显遮挡、页面级溢出及底部导航可达；常规和减少动态效果各一组，不作为完整手机排版验收。
- 296项规则、类型0错误／0警告、schema检查、Node及最终Vercel构建、公共UI、共享读取、网络传输通过。实际部署包依赖与中文PDF生成烟测通过（611865字节）；没有以此宣称PDF版式已审查。
- 正式数据库测试写入为0；无数据库迁移或发布配置改动。仅按现有流程发布同一预构建包。检查日志与关键源码副本见checks及source。

## 发布核对

正式部署 `dpl_H4z4QD1tyRYw6fLBDVrZdEUuN952` READY，正式域名与候选为同一部署。候选22项门禁／21项资源、正式22项门禁／75项资源哈希通过；应用35e19a5与验收eb634aa已同步main。[发布核对](checks/release.json)／[正式请求](checks/production-probe.json)。

未登录门禁与资源哈希使用正式请求核对，登录后的视觉审查使用上述隔离运行包。
