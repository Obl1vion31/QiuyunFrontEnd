# 首页封面素材

本目录存放总枢纽首页浅弧封面带使用的真实封面。

当前接入 `tmua-1.png` 至 `tmua-9.png`，对应用户确认的九张原图。文件保持原样，以 `object-fit: contain` 展示；每张只保留一个循环实例，下滑平铺后仍横向循环，不额外复制封面。实际配置以 `src/data/home.ts` 为准。

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

未设置 `image` 时，页面会继续显示代码生成的备用封面。
