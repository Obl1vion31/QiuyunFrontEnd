# MiSans 工作台字体

本工作台使用小米 MiSans 字体。与第八版参考一致，固定为 `misans@5.0.0` 的 Normal 可变字体（150–700），按原包 unicode-range 保留 56 个 WOFF2 子集与 `font-display: swap`，由本站按需加载，不依赖第三方 CDN。

字体来源：https://hyperos.mi.com/font/zh/ 。字体适用本目录 `LICENSE-MiSans.pdf`；切片构建工具许可另见 `LICENSE-build-scripts.txt`，两者不可混用。资产从 https://cdn.jsdelivr.net/npm/misans@5.0.0/lib/Normal/ 原样固定，不二次修改字体。

工作台head提前引入此原始CSS并预加载常用切片。Frame只在首帧前所需字体已就绪时启用MiSans，否则本次文档保持系统回退；迟到字体留作缓存，不改变已显示文字。不修改字体或原始CSS，首页与PDF继续原使用方式。
