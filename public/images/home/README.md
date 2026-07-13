# 首页封面素材

本目录存放总枢纽首页“内容穿越总控台”使用的真实封面。

## 素材规范

- 推荐比例：3:4。
- 推荐格式：WebP 或 AVIF。
- 文件名使用简短英文和连字符，例如 `content-plan.webp`。
- 放入前移除不应公开的用户信息、业务数据和内部标识。

## 引用方式

在 `src/data/home.ts` 的封面配置中增加：

```ts
image: '/images/home/content-plan.webp'
```

未设置 `image` 时，页面会继续显示代码生成的临时封面。
