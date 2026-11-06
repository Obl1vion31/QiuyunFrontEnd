# 推广复盘：电脑端对比

本地候选，未发布；原版 3e8d037 → 应用 26d0fa9。

## 视觉和信息组织

- 生命周期与录入表分为透光外层和清晰数据层，弱化边框并保留行列定位。
- 详情以项目资料、已发布帖子两个入口为重点；日期与ID按需展开。历史编辑窗减少过大的空白。

## 动效位置

- 新增：资料入口随点击位置轻倾、亮斑、阻尼回正；普通动作1px按下反馈。
- 新增：资料元信息展开过渡；选中行与详情保持对应。生命周期、Inspector进出沿用原控制器。

## 逻辑边界

当日状态、相邻衔接、三天确认、权限、保存和失败保留输入不变。没有改回编辑次日安排。

## 实拍

| 状态 | 1440 原版 | 1440 候选 | 其他实际尺寸 |
| --- | --- | --- | --- |
| 每日复盘 | [原图](../before/screenshots/promotion-1440.png) | [原图](../after/screenshots/promotion-1440.png) | [1920 原](../before/screenshots/promotion-1920.png) / [1920 候选](../after/screenshots/promotion-1920.png)；[1024 原](../before/screenshots/promotion-1024.png) / [1024 候选](../after/screenshots/promotion-1024.png) |
| 历史总览 | [原图](../before/screenshots/promotion-history-1440.png) | [原图](../after/screenshots/promotion-history-1440.png) | [1920 原](../before/screenshots/promotion-history-1920.png) / [1920 候选](../after/screenshots/promotion-history-1920.png)；[1024 原](../before/screenshots/promotion-history-1024.png) / [1024 候选](../after/screenshots/promotion-history-1024.png) |
| 当日详情 | [原图](../before/screenshots/promotion-inspector-1440.png) | [原图](../after/screenshots/promotion-inspector-1440.png) | [1920 原](../before/screenshots/promotion-inspector-1920.png) / [1920 候选](../after/screenshots/promotion-inspector-1920.png)；[1024 原](../before/screenshots/promotion-inspector-1024.png) / [1024 候选](../after/screenshots/promotion-inspector-1024.png) |
| 切换记录 | [原图](../before/screenshots/promotion-selection-1440.png) | [原图](../after/screenshots/promotion-selection-1440.png) |  |
| 编辑这一天 | [原图](../before/screenshots/promotion-edit-1440.png) | [原图](../after/screenshots/promotion-edit-1440.png) | [1920 原](../before/screenshots/promotion-edit-1920.png) / [1920 候选](../after/screenshots/promotion-edit-1920.png)；[1024 原](../before/screenshots/promotion-edit-1024.png) / [1024 候选](../after/screenshots/promotion-edit-1024.png) |
| 断网保留输入 | [原图](../before/screenshots/promotion-failure-1440.png) | [原图](../after/screenshots/promotion-failure-1440.png) |  |

[原版整页](../before/screenshots/promotion-1440-full.png) · [候选整页](../after/screenshots/promotion-1440-full.png)

[返回总索引](../README.md)
