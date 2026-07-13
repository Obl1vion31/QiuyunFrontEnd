# `src/` 源代码学习指南

这份文档面向第一次接触 Astro、React 和 TypeScript 的读者。目标不是让你立即记住所有语法，而是先建立一张清楚的代码地图：浏览器打开首页时，哪些文件以什么顺序协作，以及修改不同内容应该去哪里。

## 先记住一条主线

当前首页可以理解为四层：

```text
src/data/home.ts
        │ 提供文案和展示数据
        ▼
src/pages/index.astro
        │ 组装完整 HTML 页面
        ├───────────────┐
        ▼               ▼
ContentTunnel.tsx    index.astro 内的后半段
首屏 React 交互       静态工作流与系统入口
        │
        ▼
ContentTunnel.module.css
首屏动画、层级和响应式样式
```

简单来说：

- 想改文字或列表内容，先看 `data/home.ts`。
- 想理解整张首页有哪些区块，先看 `pages/index.astro`。
- 想理解首屏为什么会随滚动变化，看 `components/ContentTunnel.tsx`。
- 想理解颜色、位置、大小和动画外观，看对应 CSS。

## 目录和文件

```text
src/
├── README.md                         # 你正在阅读的学习指南
├── env.d.ts                          # Astro 和 TypeScript 环境类型
├── data/
│   ├── README.md
│   └── home.ts                       # 首页内容与数据结构
├── components/
│   ├── README.md
│   ├── ContentTunnel.tsx             # 首屏 React 交互组件
│   └── ContentTunnel.module.css      # 首屏局部样式
└── pages/
    └── index.astro                   # 首页路由、页面结构和后半段样式
```

`src/pages/` 不单独放置 `README.md`，因为 Astro 会把该目录里的 Markdown 文件自动生成为公开页面。它的说明统一写在这里。

## 先用 30 秒判断一个文件是否相关

每个源码文件顶部统一使用“文件说明卡”。第一次打开文件时，先不要立即读实现代码，只看这些字段：

```text
【实现需求】这个文件为用户解决什么问题
【文件职责 / 组件职责】它负责哪些工作
【关联】数据从哪里来、结果交给谁
【修改入口】常见需求应该从哪里开始改
【安全边界】修改时不能破坏什么
```

如果“实现需求”和当前任务无关，可以先跳过该文件。如果相关，再根据内部编号区块继续阅读。

## 统一注释格式

源码注释分为三层，不对显而易见的每一行重复解释：

### 第一层：文件说明卡

位于文件最上方，说明整个文件在系统中的位置。固定格式为：

```ts
/**
 * 文件：文件名
 *
 * 【实现需求】用户或页面希望实现什么
 * 【文件职责】这个文件负责什么
 * 【关联】与哪些数据、组件和样式协作
 * 【修改入口】常见调整从哪里进入
 * 【安全边界】哪些行为不能被破坏
 */
```

### 第二层：编号区块

复杂文件使用连续编号划分阅读范围：

```ts
// ============================================================
// 4. 滚动驱动的封面动画
// 【输入】Hero 位置、窗口尺寸、减少动态效果设置
// 【输出】封面 transform、filter 和 opacity
// ============================================================
```

编号表达阅读顺序，不是装饰。通过编辑器搜索 `// 4.`，可以直接跳到对应逻辑。

### 第三层：关键原因

只解释不容易从语法直接看出的需求、关联和取舍：

```ts
// 【原因】平方根曲线让前半程更快进入可见区域，后半程平缓放大。
const depthProgress = Math.sqrt(travel);
```

统一标签含义：

| 标签 | 回答的问题 |
| --- | --- |
| `【实现需求】` | 用户最终会看到或得到什么 |
| `【文件职责】` / `【组件职责】` | 当前文件负责哪些工作 |
| `【关联】` | 数据从哪里来、结果会影响哪里 |
| `【输入】` | 当前逻辑依赖什么 |
| `【输出】` | 当前逻辑产生什么 |
| `【原因】` | 为什么使用这种实现 |
| `【修改入口】` | 需求变化时优先改哪里 |
| `【安全边界】` | 哪些既有能力不能破坏 |

CSS 使用相同标签，但以选择器区块为单位；HTML/Astro 模板以页面区域为单位。

## 浏览器打开首页时发生了什么

当你运行 `pnpm dev` 并访问 `/` 时，大致会经历以下过程：

1. Astro 找到 `src/pages/index.astro`，因为 `index.astro` 对应网站根路径 `/`。
2. `index.astro` 导入 `homeContent`，取得首页需要的全部文字和列表。
3. `index.astro` 导入 `ContentTunnel`，把首屏需要的数据作为 Props 传进去。
4. Astro 先生成整张页面的 HTML，包括首屏初始内容、工作流、系统入口和页脚。
5. 浏览器加载页面后，`client:load` 让 React 激活 `ContentTunnel`。
6. React 的 `useEffect` 开始监听滚动和窗口尺寸变化。
7. 每次滚动时，组件计算进度，并更新封面的 3D 位置、透明度和模糊程度。
8. Hero 离开后，后续工作流和系统入口仍是普通的 Astro 静态内容，不需要 React 持续管理。

这种做法叫 React Island：只让真正需要交互的局部区域运行 React，而不是把整张网站都变成 React 应用。

## 一、`data/home.ts`：首页的内容仓库

这个文件保存两类东西：类型定义和实际内容。

### 1. 类型定义是什么

例如：

```ts
export interface CoverItem {
  id: string;
  label: string;
  caption: string;
  image?: string;
}
```

`interface` 可以理解为一份数据格式说明：

- `id: string` 表示必须有 `id`，而且它是文字。
- `label: string` 表示必须有标签文字。
- `image?: string` 中的 `?` 表示图片路径可以不填写。

TypeScript 会根据这些规则检查数据。如果把 `label` 错写成数字，`pnpm check` 就能发现问题。

### 2. 联合类型是什么

```ts
export type LinkStatus = 'external' | 'placeholder' | 'restricted';
```

这表示入口状态只能从三个固定值中选择：

- `external`：已经有真实链接；
- `placeholder`：暂时显示建设中；
- `restricted`：表达需要授权。

这样可以避免随手写出无法识别的状态。

### 3. `homeContent` 是什么

`homeContent` 是一个大对象，按页面区域分组：

- `meta`：浏览器标题、页面摘要、更新时间；
- `hero`：首屏平台定位和用户行动路径；
- `covers`：首页使用的封面配置；
- `mission`：`WHY WE EXIST` 和工作边界；
- `workflow`：六阶段工作流；
- `systems`：三个后续系统入口。

例如 `workflow.stages` 是数组，页面可以用 `.map()` 按顺序把六个阶段全部渲染出来。以后增加或调整阶段时，通常只需要修改这份数据，不需要复制 HTML。

### 4. 如何使用真实封面

先把文件放到：

```text
public/images/home/content-plan.webp
```

再给对应封面增加：

```ts
image: '/images/home/content-plan.webp'
```

如果没有 `image`，组件会显示代码生成的临时封面。

## 二、`pages/index.astro`：整张首页的组装文件

Astro 文件由三个部分组成。

### 1. 顶部 Frontmatter

文件开头的两条 `---` 之间是服务器端准备代码：

```astro
---
import ContentTunnel from '../components/ContentTunnel';
import { homeContent } from '../data/home';

const { meta, hero, covers, mission, workflow, systems } = homeContent;
---
```

这里做了三件事：

1. 导入首屏组件；
2. 导入首页数据；
3. 使用解构赋值把大对象拆成几个容易使用的小变量。

### 2. HTML 与 Astro 模板

`<head>` 负责页面标题、摘要、手机缩放和主题色。`<body>` 里面是真正显示的页面。

首屏组件的写法：

```astro
<ContentTunnel
  client:load
  covers={covers}
  stages={workflow.stages}
/>
```

- `client:load`：页面加载后立即在浏览器中激活 React 组件；
- `covers={covers}`：把封面数组传给组件；
- `stages={workflow.stages}`：把六阶段列表传给组件。

传进去的这些值叫 Props。Props 是父级页面交给子组件的数据。

### 3. `.map()` 如何生成重复内容

工作流的六个阶段没有手写六遍 HTML，而是：

```astro
{workflow.stages.map((stage, index) => (
  <li>
    <span>{index + 1}</span>
    <h3>{stage.verb}</h3>
  </li>
))}
```

`.map()` 会依次读取数组中的每一项，并为每项生成一段界面。

### 4. 条件渲染是什么

系统入口使用了：

```astro
{entry.href ? (
  <a href={entry.href}>进入</a>
) : (
  <span>建设中</span>
)}
```

这相当于：如果存在 `href`，显示链接；否则显示状态文字。这里的 `条件 ? A : B` 叫三元表达式。

### 5. 文件末尾的 CSS

`<style is:global>` 负责首页后半段的公共样式，包括：

- 全站颜色变量和基础字体；
- 六阶段工作流；
- 系统入口；
- 页脚；
- 后半段的移动端规则。

首屏没有写在这里，因为首屏已经有独立的 CSS Module。

## 三、`components/ContentTunnel.tsx`：首屏交互组件

这是当前最复杂的文件。第一次阅读不需要理解每一个数字，先理解它的五个职责。

### 1. 接收 Props

`interface Props` 规定页面必须向组件传入哪些数据，例如封面、阶段、标题和使命文字。

```ts
interface Props {
  covers: CoverItem[];
  stages: WorkflowStage[];
  title: string[];
}
```

`CoverItem[]` 表示由多条 `CoverItem` 组成的数组。

### 2. 保存 DOM 引用和当前状态

```ts
const sectionRef = useRef<HTMLElement>(null);
const cardRefs = useRef<Array<HTMLElement | null>>([]);
const [activeStage, setActiveStage] = useState(0);
```

- `sectionRef`：记住整个 Hero 对应的真实 HTML 元素；
- `cardRefs`：记住每一张封面元素，之后可以直接更新它们的样式；
- `activeStage`：保存当前高亮的是第几个流程阶段；
- `setActiveStage`：用于更新当前阶段并让 React 重新渲染文字和高亮状态。

`useRef` 适合保存元素或不会触发界面刷新的值；`useState` 适合保存会影响界面显示的状态。

### 3. 生成不重复的封面流

```ts
const stream = covers;
```

封面流直接使用配置中的八张素材，每张只创建一个实例。滚动循环由每张卡片的 `travel` 进度完成，不再额外复制素材，因此同一个画面中不会出现两张相同封面。

### 4. 根据滚动计算动画

`useEffect` 会在组件进入浏览器后执行。它内部读取 Hero 的位置，并计算三种进度：

- `rawProgress`：没有在 1 处截断的原始进度；Hero 离场时可以继续增长；
- `progress`：限制在 0 到 1，用来控制 01–06 流程状态；
- `animationProgress`：允许继续增长到 1.75，让流程到 06 后封面仍在离场期间循环。

封面流还会叠加 `initialTravelPhase`。当前值为 `0.08`，相当于页面打开时预先推进一小段动画，使第八张封面刚好从远景开始露出；它只改变封面构图，不会让流程环节跳过 01。

每张封面最终会得到：

- `x`：横向位置；
- `y`：纵向位置；
- `depth`：离屏幕远近，对应 CSS 3D 的 Z 轴；
- `rotation`：旋转角度；
- `opacity`：透明度；
- `blur`：模糊程度。

横向和纵向位移会随 `travel` 一起增加。封面在远处时受到透视缩放，自然聚拢在中间；向镜头靠近时，尺寸和位移同步增大，逐渐向页面四周展开并离场。这正是“从后面往前浮现”的主要来源。纵深使用平方根曲线，让封面前半程更快进入可见区域、后半程平缓放大，避免初始画面过空或近景突然膨胀。近景还会小幅提高 `brightness`，让放大的四角封面保持轻盈，不会在深色遮罩下显得过重。

然后通过内联样式写到封面上：

```ts
card.style.transform = `translate3d(...) rotate(...)`;
card.style.opacity = opacity.toFixed(3);
card.style.filter = `blur(...)`;
```

这里使用 `requestAnimationFrame`，让高频滚动事件合并到浏览器下一帧执行，减少无效计算。

### 5. 清理事件监听

`useEffect` 最后返回一个函数：

```ts
return () => {
  window.removeEventListener('scroll', requestRender);
  window.removeEventListener('resize', requestRender);
};
```

组件离开页面时，这个函数会移除监听，避免重复执行和内存泄漏。

### 6. JSX 是什么

组件最后的 `return (...)` 看起来像 HTML，但它实际是 JSX/TSX。

- `{变量}`：把 JavaScript 值插入界面；
- `{数组.map(...)}`：循环生成元素；
- `{条件 ? A : B}`：根据条件选择显示内容；
- `className`：React 中的 CSS 类名属性；
- `key`：帮助 React 区分循环中的每个元素；
- `ref`：把真实 DOM 元素保存到 `useRef`。

`aria-label`、`aria-labelledby` 和 `aria-hidden` 是无障碍属性，用于帮助屏幕阅读器理解页面结构，或忽略纯装饰内容。

## 四、`ContentTunnel.module.css`：首屏的外观与空间

CSS Module 的特点是类名只作用于当前组件。代码里写：

```ts
import styles from './ContentTunnel.module.css';
```

组件里使用：

```tsx
<div className={styles.screenShade} />
```

构建时，Astro 会把类名转换成不会和其他页面冲突的唯一名称。

### 1. Hero 为什么可以固定

`.scene` 高度是 `270vh`，表示它比一屏高很多；`.sticky` 使用：

```css
position: sticky;
top: 0;
height: 100vh;
```

所以用户继续向下滚动时，Hero 会在一段距离内停留在视口中，为封面动画提供滚动空间。

### 2. 背景层级

首屏从后往前大致是：

```text
atmosphere   氛围背景
stage        3D 封面
screenShade  全屏统一深色遮罩
copy         标题、使命和箭头路径
rail         底部 01–06 流程轨道
topbar       顶部信息
```

`z-index` 控制这些层的前后关系。统一遮罩放在封面上、文字下，所以能压暗所有封面，但不会让文字一起变暗。

### 3. 3D 纵深

`.stage` 使用 `perspective` 建立透视空间，React 再给每张封面设置 `translate3d(x, y, z)`。Z 值越小，封面看起来越远；Z 值逐渐变大时，封面就像向用户靠近。

桌面端封面场景以 `1440 × 900` 为基准画布，横向运动在其中使用 `1280px` 安全宽度。React 根据实际窗口宽高计算统一的 `--scene-scale`，CSS 再整体缩放 `.stage`。因此封面尺寸、位置、透视和移动距离保持同一比例；宽屏只增加居中的安全留白，不会改变构图。`820px` 以下继续使用单独的移动端布局。

### 4. 响应式函数

代码大量使用：

```css
font-size: clamp(3.8rem, 6.8vw, 6.8rem);
```

`clamp(最小值, 理想值, 最大值)` 表示字号会跟随屏幕变化，但不会小于最小值，也不会超过最大值。

### 5. Media Query

```css
@media (max-width: 820px) { ... }
@media (max-width: 560px) { ... }
```

它们分别处理平板和手机：缩小封面、把双栏文字改为单栏、隐藏部分次要信息，并让用户路径改成纵向排列。

### 6. 减少动态效果

```css
@media (prefers-reduced-motion: reduce) { ... }
```

如果用户在操作系统中选择减少动画，CSS 会停止非必要提示动画；React 也会让封面保持静态纵深。这是可访问性和舒适度要求，不建议删除。

## 五、`env.d.ts`：类型环境声明

这个文件只有几行引用：

```ts
/// <reference types="astro/client" />
```

它告诉 TypeScript：项目运行在 Astro 的客户端环境中，因此可以识别 Astro 提供的类型。通常不需要修改，也不会直接生成页面内容。

## 常用术语速查

| 术语 | 在本项目中的含义 |
| --- | --- |
| Astro | 负责路由、HTML 生成和静态构建的主框架 |
| React Island | 只在首屏交互区域启用的 React 组件 |
| TypeScript | 带类型检查的 JavaScript |
| Component | 可独立维护和复用的界面单元 |
| Props | 父页面传给组件的数据 |
| State | 会影响界面显示、更新后触发渲染的数据 |
| Ref | 对真实 DOM 元素或持久值的引用 |
| Hook | `useState`、`useEffect`、`useRef` 等 React 功能函数 |
| JSX / TSX | 在 JavaScript/TypeScript 中描述界面的语法 |
| CSS Module | 只作用于特定组件的局部 CSS |
| `.map()` | 把数组中的每项转换为一段界面 |
| 响应式 | 根据不同屏幕宽度调整布局 |
| 无障碍 | 让键盘、屏幕阅读器和减少动画设置可正常使用 |

## 修改需求时应该去哪

| 你想做的事 | 优先修改 |
| --- | --- |
| 修改首页文字 | `data/home.ts` |
| 替换真实封面 | `public/images/home/` 和 `data/home.ts` |
| 修改 01–06 阶段 | `data/home.ts` 的 `workflow.stages` |
| 调整封面速度或深度 | `components/ContentTunnel.tsx` |
| 调整首屏颜色、大小、遮罩 | `components/ContentTunnel.module.css` |
| 调整后半段工作流或入口布局 | `pages/index.astro` |
| 修改浏览器标题或更新时间 | `data/home.ts` 的 `meta` |
| 新增页面 | 先确认范围，再在 `pages/` 中增加路由文件 |

## 推荐阅读顺序

第一次阅读时建议按以下顺序：

1. 先看每个文件顶部的说明卡，只建立职责和关联概念。
2. 阅读 `data/home.ts` 的第 1、2 区块，认识页面实际使用的类型、文字和列表。
3. 阅读 `pages/index.astro` 的第 1–6 区块，理解数据被放到了哪里。
4. 阅读 `ContentTunnel.tsx` 的第 1–3、5 区块，先理解输入、状态和最终结构。
5. 再阅读 `ContentTunnel.tsx` 第 4 区块，理解滚动和封面动画。
6. 阅读 `ContentTunnel.module.css` 第 1、3、5、6 区块，理解空间层级和信息层。
7. 最后阅读两个文件的响应式区块，理解桌面、平板和手机差异。

不需要第一次就理解动画中的每个数字。先能回答“这个文件负责什么、数据从哪里来、修改应该去哪里”，就已经读懂了项目的大部分结构。

## 适合练习的安全修改

可以按难度逐步尝试：

1. 在 `home.ts` 修改一句文案，观察页面变化。
2. 修改某个封面的 `tone`，观察临时封面颜色。
3. 调整 CSS 中的 `screenShade` 透明度，理解遮罩层。
4. 把 `.scene` 的 `270vh` 改小再改回来，观察滚动距离。
5. 调整 `ContentTunnel.tsx` 中的 `1.55`，观察封面循环速度。

每次修改后运行：

```bash
pnpm check
pnpm build
```

不要直接修改 `dist/` 或 `.astro/`。它们是工具生成的目录，下次构建时会被覆盖。
