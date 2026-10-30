# MiSans 工作台字体

本工作台使用小米 MiSans 字体。与第八版参考一致，固定为 `misans@5.0.0` 的 Normal 可变字体（150–700），按原包 unicode-range 保留 56 个 WOFF2 子集与 `font-display: swap`，由本站按需加载，不依赖第三方 CDN。

字体来源：https://hyperos.mi.com/font/zh/ 。字体适用本目录 `LICENSE-MiSans.pdf`；切片构建工具许可另见 `LICENSE-build-scripts.txt`，两者不可混用。资产从 https://cdn.jsdelivr.net/npm/misans@5.0.0/lib/Normal/ 原样固定，不二次修改字体。

工作台由 `src/pages/fonts/business.css.ts` 基于此CSS生成静态共享样式：原始0–15、50、54切片以data URL内联，其他切片按需读取，派生样式采用block展示策略。字体二进制、可变字重和原CSS不变，首页与PDF继续原入口。
