# 首页入口排版验收

已自检并发布首页排版修复。图中使用两版首页的实际文案和入口。

在 Chromium 复现了 768px 下说明文字碎行的问题。修复后用真实页面检查 320px 至 1440px 的 11 档宽度，包括 960／961px 布局边界。三条标题在所测尺寸均完整显示，页面无横向溢出，使用 Tab 和 Enter 可从本地首页进入工作台选择页，正式入口导向登录。

代码提交 `373b4a70`，正式部署 `dpl_ELhLLaQCF3MmtsxPx6SC5Bwn7r6r`。

[正式首页](https://qiuyun-frontend.vercel.app/#systems-title) · [本地预览首页](http://127.0.0.1:4327/#systems-title)

## 本地销售预览

- [本地首页入口，截图问题对应宽度 768px](screenshots/local-home-entrances-768.png)
- [本地首页入口，906px](screenshots/local-home-entrances-906.png)
- [本地首页入口，1024px](screenshots/local-home-entrances-1024.png)
- [本地首页入口，390px](screenshots/local-home-entrances-390.png)

## 正式首页

- [正式首页入口，768px](screenshots/public-home-entrances-768.png)
- [正式首页入口，1024px](screenshots/public-home-entrances-1024.png)
- [正式首页入口，390px](screenshots/public-home-entrances-390.png)
- [正式首页入口，320px，按钮在说明下方](screenshots/public-home-entrances-320.png)
- [相邻工作流区，768px](screenshots/public-home-workflow-768.png)
- [相邻工作流区，390px](screenshots/public-home-workflow-390.png)
