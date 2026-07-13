# `src/data/` 页面数据

本目录集中维护页面可编辑内容，避免正文散落在组件和路由文件中。

## 当前文件

- `home.ts`：首页 Meta 信息、平台定位、使命、封面、六阶段工作流和系统入口。

## 与页面的关系

```text
home.ts
  ├── pages/index.astro              页面 Meta、工作流、系统入口
  └── components/ContentTunnel.tsx   Hero 文案、封面、底部流程轨道
```

`home.ts` 只提供类型和内容，不负责 HTML、动画或 CSS。阅读时先看文件顶部说明卡，再按 `1. 数据类型`、`2.1–2.6 首页内容` 的编号跳转。

## 常见修改

- 修改首页文案：编辑 `homeContent` 对应区块。
- 使用真实封面：先把图片放进 `public/images/home/`，再给封面增加 `image` 路径。
- 启用系统入口：增加 `href`，并把 `status` 改为 `external`。

不得在这里写入真实员工隐私、绩效薪资、生产凭据或未经确认的业务结果。
