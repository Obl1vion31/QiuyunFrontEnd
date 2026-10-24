# 复盘视觉参考 · 收紧名称与状态之间的空档

状态：已自检，待用户反馈。独立示例参考；本轮修正用户指出的内容列过度伸展，保留已经确认的页面顺序、字体、单行结构与状态气泡。

名称列依据本批最长文字统一测量，短示例使用 112px，长标题按容器余量增加，最大 176px；各行共用同一列宽。名称不再吸收宽屏剩余空间。数字、成本和次日安排适量伸展，状态仍居中并保留与消耗之间的间距。

## 实际效果

- 每日区域：[1920px](daily-default-1920.png)、[1440px](daily-default-1440.png)
- 整页：[1920px](promotion-default-1920.png)、[1440px](promotion-default-1440.png)、[390px](promotion-default-390.png)
- 长标题：[1440px](long-title-1440.png)、[1920px](long-title-1920.png)
- 气泡：[修改中](state-change-unsaved-1440.png)、[保存回执](state-change-saved-1440.png)、[手机](state-change-unsaved-390.png)
- 场景：[暂无待填写](promotion-empty-1440.png)、[多条待填写](promotion-ready-1440.png)、[淘汰后无次日动作](test-discarded-saved-1440.png)
- [气泡与完成复盘演示](state-bubble-demo.webm)

## 实际检查

覆盖 1920、1440、1280、1024、736、390、320px。实际查看桌面局部、整页、长标题、手机及录像关键帧。1920px 短示例名称列从第六版 233.11px 收至 112px，标题文字末端到状态文字起点从 200.80px 收至 72.5px。长标题在 1440px 使用 134px、1920px 使用 176px；全部行共列，桌面没有横向溢出，完整名称保留在文字与提示中。

五项数值用真实字体测量，录入代表性金额与六位人数可见；状态及修改两行仍居中，长状态距消耗至少约 15px。气泡、后继选项、空选与原因校验、草稿、取消、保存、终态完成、次日安排和减少动态效果沿用本轮浏览器回归，未发现脚本错误。详见[间距前后实测](spacing-comparison.json)与[检查记录](check.json)。

源为 `reference-source.html`、包装为 `reference-preview.html`；HEAD `55b6ff6`，源 SHA-256 `8699b04a86a17ed76cb310507f07077edc232010c6857c2b72190dee48183bf7`。数据为标明的独立示例，不调用业务 API 或数据库；正式业务实施尚待用户确认。
