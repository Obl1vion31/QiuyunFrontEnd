# 推广版本行资料图标对齐

- 状态：已自检，待用户反馈。图标修正 `d33bc91`；发布源 `dd7f5ee`，包含正式站最新的例会版本更新。
- 根因：版本行的6px间距、资料组件3px左边距和24px按钮内边距叠加，且按钮框撑高了18px元信息行。改由版本行单独控制4px间距；图形按18px行框对齐，点击热区独立扩展为24px，不撑高排版。每日、补录及推广安排共享同一规则；例会标题的既有布局保留。
- 中英文版本标签的实际文字 Range 与 SVG 纵向中心偏差为0，文字到SVG盒间距5px。图标仍为16px，未用缩小图形掩盖间距。
- 数据来源：正式组件与隔离PGlite虚构事实；本轮未写生产业务数据，未执行数据库迁移。

## 最终效果

[文字与图标局部](states/identity-1440.png)

| 场景 | 截图 |
| --- | --- |
| 桌面 | [1920px](desktop/references-1920.png) · [1440px](desktop/references-1440.png) · [1024px](desktop/references-1024.png) |
| 手机 | [390px](mobile/references-390.png) · [320px](mobile/references-320.png) |

已实际查看截图及[录像关键帧](motion/contact.png)，[操作录像](motion/interaction.webm)包含资料查看、复制、键盘／焦点、修改确认、失败重试和保存。

## 验证

合并最新正式源后，206项规则、db:check、类型检查、Node／Vercel构建、公共UI及资料／安排专项通过。五档视口覆盖中文、英文和较长学科标签；实际测量文字与SVG的位置并查看图像。打开／关闭资料保留表格滚动、原行节点、指标及修改草稿。发布包React、Puppeteer、Chromium及断网生成中文PDF通过。[浏览器结果](checks/browser.json) · [日志](checks/)。

## 发布

已发布[正式域名](https://qiuyun-frontend.vercel.app/business/daily-promotion-review)，源 `dd7f5ee`，部署 `dpl_AXWhCfZ6meY8irUhZKfnf4iepp6a`；独立动态探针6项、正式域名84项检查及61个资源哈希核对通过。[公网结果](checks/public-smoke.json) · [正式部署](checks/formal.txt) · [切换记录](checks/promote.txt)。
