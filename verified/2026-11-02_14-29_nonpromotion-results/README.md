# 非推广复盘结果展示验收

状态：已自检，待用户反馈。应用代码：`35ae2d8`。截图数据来自隔离PGlite虚构夹具；浏览器为Linux Chromium，手机为触屏视口模拟。

分类双轮新增阅读量均值及独立有效样本，比率用0–100%细轨；即时按帖、持续最新／往期与真实日期趋势。录入继续使用原Inspector。修正过15天标签换行、手机指标挤压、趋势点拉伸及分类切平铺时的方式过滤。

## 最终截图

| 状态 | 实际视口 |
| --- | --- |
| 分类双轮 | [1920px](screenshots/category-1920.png) · [1440px](screenshots/category-1440.png) · [1024px](screenshots/category-1024.png) · [390px](screenshots/category-390.png) · [320px](screenshots/category-320.png) |
| 分类展开 | [1920px](screenshots/category-expanded-1920.png) · [1440px](screenshots/category-expanded-1440.png) · [1024px](screenshots/category-expanded-1024.png) · [390px](screenshots/category-expanded-390.png) · [320px](screenshots/category-expanded-320.png) |
| 横滚右端 | [1024px](screenshots/category-right-1024.png) · [390px](screenshots/category-right-390.png) · [320px](screenshots/category-right-320.png) |
| 常规总览 | [1920px](screenshots/history-1920.png) · [1440px](screenshots/history-1440.png) · [1024px](screenshots/history-1024.png) · [390px](screenshots/history-390.png) · [320px](screenshots/history-320.png) |
| 即时结果 | [1920px](screenshots/instant-1920.png) · [1440px](screenshots/instant-1440.png) · [1024px](screenshots/instant-1024.png) · [390px](screenshots/instant-390.png) · [320px](screenshots/instant-320.png) |
| 持续最新 | [1920px](screenshots/continuous-1920.png) · [1440px](screenshots/continuous-1440.png) · [1024px](screenshots/continuous-1024.png) · [390px](screenshots/continuous-390.png) · [320px](screenshots/continuous-320.png) |
| 持续往期与断点趋势 | [1920px](screenshots/continuous-expanded-1920.png) · [1440px](screenshots/continuous-expanded-1440.png) · [1024px](screenshots/continuous-expanded-1024.png) · [390px](screenshots/continuous-expanded-390.png) · [320px](screenshots/continuous-expanded-320.png) |
| 后续与待安排 | [1920px](screenshots/continuous-upcoming-1920.png) · [1440px](screenshots/continuous-upcoming-1440.png) · [1024px](screenshots/continuous-upcoming-1024.png) · [390px](screenshots/continuous-upcoming-390.png) · [320px](screenshots/continuous-upcoming-320.png) |
| 录入Inspector | [1920px](screenshots/input-1920.png) · [1440px](screenshots/input-1440.png) · [1024px](screenshots/input-1024.png) · [390px](screenshots/input-390.png) · [320px](screenshots/input-320.png) |
| 不复盘 | [1920px](screenshots/skipped-1920.png) · [1440px](screenshots/skipped-1440.png) · [1024px](screenshots/skipped-1024.png) · [390px](screenshots/skipped-390.png) · [320px](screenshots/skipped-320.png) |

另验：[保存失败保留](screenshots/save-failure-1440.png)、[重试成功](screenshots/save-success-1440.png)、[日期原位追加](screenshots/append-date-1440.png)、[员工与减少动态效果](screenshots/employee-category-1440.png)、[手机趋势](screenshots/touch-trend-390.png)、[手机详情](screenshots/touch-inspector-390.png)。54张最终图已实际查看。

## 过程与验证

[桌面首次进入／真实方式切换／展开](videos/desktop.mp4) · [手机首次进入／真实切换／趋势](videos/mobile.mp4)。两段录像全部255个解码帧已连续审查，细轨与趋势首次可见播放，再次展开不重播。

246项规则、数据库检查、Node类型检查与构建、公共UI、原非推广Inspector、计划接口／浏览器及真实PDF、推广工作台、17个首屏场景、新结果与动效专项通过。实际字体为MiSans。正式候选10项、正式109项及79个资源哈希核对通过；正式域名指向`dpl_9RwB7uXyRK1zzwbD88TN1KH8PTFr`且为READY。运行包依赖／中文PDF检查通过。正式库九种方式／状态组合经只读事务核对；旧记录目前均缺阅读量，均值显示‘—’及有效0篇，补录真实数量后自动计算。
