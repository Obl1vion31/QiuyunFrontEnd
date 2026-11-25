# 销售来源接入正式内容库验收

已自检、合入 main 并发布。代码 `aa6aa0ba`，部署 `dpl_HRszKp93Hbx5kLcbqUB5vjXowhnN`。

截图来自实际 Vercel 运行包与隔离账号。标题和客户是隔离夹具，通过正式库的同一张表和接口读取。正式库以只读事务核对推广／非推广的标题、笔记 ID 及已登记分享短链。

## 查找与关联

- [正式销售工作台入口](screenshots/01-workspace-choice-1440.png)
- [来源核对列表](screenshots/20-source-queue-1440.png)
- [同一标题关键词找到推广与非推广记录](screenshots/31-source-both-results-1440.png)
- [推广帖，历史笔记身份与推广记录](screenshots/06-source-selection-1440.png)
- [非推广帖与实发时间](screenshots/32-source-organic-1440.png)
- [1024 px 推广来源确认](screenshots/35-source-promotion-1024.png)
- [390 px 来源表单与关闭入口](screenshots/34-source-390.png)

## 反馈、兼容与复盘

- [查询失败保留输入](screenshots/29-source-search-failed-1440.png)
- [慢查找使用共享局部加载](screenshots/30-source-search-loading-1440.png)
- [旧样例关联回到待重新核对](screenshots/33-legacy-source-pending-1440.png)
- [其他来源的必填字段](screenshots/13-source-other-1440.png)
- [无法确认来源帖](screenshots/14-source-unknown-1440.png)
- [销售按帖复盘读取已核对的真实来源身份](screenshots/22-stats-post-details-1440.png)

[查找两类帖子、确认及回显录屏](process/source-review.mp4)
