# 首页入口悬停底色验收

已自检并发布。入口列表的三行共用圆角卡片的背景，按钮分别显示悬停反馈和键盘焦点。

在本地预览、正式运行包和正式首页用 Chromium 测试了 1440／1024／906px。鼠标依次移入三行的文字区、移出卡片，截图逐像素一致。另实测按钮悬停、按 Tab 和 Enter 导航，以及 390px 触屏点按。

代码 `c65a67a8`，正式部署 `dpl_7W8hHUMHa37QCQgqVj11yxz23okw`。

- [本地预览，1024px，鼠标停在业务系统一行](screenshots/local-card-row-hover-1024.png)
- [本地预览，906px，鼠标停在业务系统一行](screenshots/local-card-row-hover-906.png)
- [正式首页，1440px，鼠标停在业务系统一行](screenshots/public-card-row-hover-1440.png)
- [正式首页，1024px，鼠标停在业务系统一行](screenshots/public-card-row-hover-1024.png)
- [正式首页，1024px，鼠标停在按钮上](screenshots/public-card-button-hover-1024.png)
- [正式首页，1024px，键盘焦点在按钮上](screenshots/public-card-keyboard-focus-1024.png)
- [正式首页，390px，触屏点按业务系统一行](screenshots/public-card-touch-390.png)
