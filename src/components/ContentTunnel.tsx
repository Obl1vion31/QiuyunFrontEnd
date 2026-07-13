/**
 * 文件：ContentTunnel.tsx
 *
 * 【实现需求】
 * 在首页首屏中展示从远处向镜头浮现的内容封面，并让 01–06 工作流状态随正常滚动推进。
 *
 * 【组件职责】
 * 1. 接收首页文案、封面和工作流数据；
 * 2. 把页面滚动距离转换成封面位置、纵深、透明度、模糊和亮度；
 * 3. 更新底部当前流程环节；
 * 4. 输出首屏平台定位、存在意义、用户行动路径和流程轨道结构。
 *
 * 【关联】
 * - 上游：pages/index.astro 负责传入 Props；data/home.ts 提供实际内容；
 * - 下游：ContentTunnel.module.css 负责层级、3D 透视、排版和响应式样式；
 * - 运行方式：index.astro 使用 client:load，把本组件作为 React Island 激活。
 *
 * 【修改入口】
 * - 初始构图：positions、initialTravelPhase；
 * - 跨屏一致性：referenceCanvas；
 * - 循环速度和纵深：render() 内的 animationProgress、travel 和 depth；
 * - 首屏结构：文件末尾的 JSX。
 *
 * 【安全边界】
 * 保持正常页面滚动、prefers-reduced-motion、事件清理和每张真实封面单实例。
 */
import { Fragment, useEffect, useRef, useState } from 'react';
import type { CoverItem, WorkflowStage } from '../data/home';
import styles from './ContentTunnel.module.css';

// ============================================================
// 1. 组件输入
// 【输入】全部由 pages/index.astro 传入，实际内容来自 data/home.ts。
// 【原因】组件只负责结构与交互，不在这里散落可编辑文案。
// ============================================================
interface Props {
  covers: CoverItem[];
  stages: WorkflowStage[];
  eyebrow: string;
  title: string[];
  statement: string[];
  note: string;
  scrollHint: string;
  purposeEyebrow: string;
  purposeBody: string;
  boundary: string;
}

// ============================================================
// 2. 场景配置
// 【需求】远景在中间自然交错，近景放大后向视口四角展开。
// 【输出】positions 的每项依次表示横向百分比、纵向百分比、基础旋转角度。
// 【关联】render() 会把这些配置与每张封面的 travel 进度组合成 transform。
// ============================================================
const positions = [
  [-30, -20, -5],
  [25, -25, 3],
  [-26, 22, -2],
  [28, 18, 4],
  [-72, -51, 3],
  [59, -41, -4],
  [-48, 33, 2],
  [39, 26, -3],
];

// 【需求】页面打开时直接采用已确认的初始构图，让第八张封面刚好开始露出。
const initialTravelPhase = 0.08;

// 【需求】显示器和笔记本保持相同构图比例。
// 【原因】桌面端以 1440 × 900 为基准；横向运动使用 1280px，留下两侧安全区。
const referenceCanvas = {
  width: 1440,
  height: 900,
  motionWidth: 1280,
};
const mobileBreakpoint = 820;

export default function ContentTunnel({
  covers,
  stages,
  eyebrow,
  title,
  statement,
  note,
  scrollHint,
  purposeEyebrow,
  purposeBody,
  boundary,
}: Props) {
  // ==========================================================
  // 3. DOM 引用与界面状态
  // 【关联】sectionRef 用于读取 Hero 滚动位置；cardRefs 用于逐帧更新封面样式。
  // 【输出】activeStage 只负责触发当前 01–06 环节的 React 重渲染。
  // ==========================================================
  const sectionRef = useRef<HTMLElement>(null);
  const cardRefs = useRef<Array<HTMLElement | null>>([]);
  const [activeStage, setActiveStage] = useState(0);

  // 【需求】每张真实封面只创建一个实例，避免同屏出现两张相同素材。
  const stream = covers;

  // ==========================================================
  // 4. 滚动驱动的封面动画
  // 【输入】Hero 的视口位置、窗口尺寸和系统的减少动态效果设置。
  // 【输出】CSS 变量、当前流程状态，以及每张封面的内联 transform/filter/opacity。
  // 【安全边界】高频事件必须经 requestAnimationFrame 合并，并在卸载时清理。
  // ==========================================================
  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    let frame = 0;
    let currentStage = -1;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const render = () => {
      // --------------------------------------------------------
      // 4.1 页面进度：流程状态在 0–1，封面允许在 Hero 离场时继续循环。
      // --------------------------------------------------------
      frame = 0;
      const rect = section.getBoundingClientRect();
      const distance = Math.max(section.offsetHeight - window.innerHeight, 1);
      const rawProgress = Math.max(0, -rect.top / distance);
      const progress = Math.min(1, rawProgress);

      // 【需求】流程到 06 后封面仍继续运动，直到 Hero 完全离开视口。
      const animationProgress = Math.min(1.75, rawProgress);
      section.style.setProperty('--scene-progress', progress.toFixed(4));

      // 【需求】桌面端以基准画布整体缩放；移动端交给 CSS Media Query 单独处理。
      const sceneScale = window.innerWidth > mobileBreakpoint
        ? Math.min(
            window.innerWidth / referenceCanvas.width,
            window.innerHeight / referenceCanvas.height,
          )
        : 1;
      section.style.setProperty('--scene-scale', sceneScale.toFixed(4));

      // --------------------------------------------------------
      // 4.2 流程状态：把 0–1 的页面进度平均映射到 01–06。
      // --------------------------------------------------------
      const nextStage = Math.min(stages.length - 1, Math.floor(progress * stages.length));
      if (nextStage !== currentStage) {
        currentStage = nextStage;
        setActiveStage(nextStage);
      }

      // --------------------------------------------------------
      // 4.3 单张封面：计算循环相位、纵深、位置和视觉强度。
      // --------------------------------------------------------
      cardRefs.current.forEach((card, index) => {
        if (!card) return;
        const [xPercent, yPercent, rotation] = positions[index % positions.length];
        const offset = index / stream.length;
        const travel = reduceMotion
          ? (offset + initialTravelPhase) % 1
          : (animationProgress * 1.55 + offset + initialTravelPhase) % 1;
        // 【原因】平方根曲线让前半程更快进入可见区域，后半程平缓放大。
        const depthProgress = Math.sqrt(travel);
        const depth = -1200 + depthProgress * 1450;
        const spread = referenceCanvas.motionWidth / 100;
        // 【需求】位移随 travel 增加：远景集中，近景向四周展开。
        const x = xPercent * spread * (0.55 + travel * 0.55);
        const y = yPercent * referenceCanvas.height / 100 * (0.68 + travel * 0.32);
        // 【需求】循环首尾平滑淡入淡出；近景稍亮，避免深色遮罩下显得过重。
        const fadeIn = Math.min(1, travel * 4);
        const fadeOut = Math.min(1, (1 - travel) * 4);
        const opacity = Math.max(0, Math.min(fadeIn, fadeOut)) * 0.88;
        const blur = Math.max(0, (0.55 - travel) * 8);
        const brightness = 1 + Math.max(0, travel - 0.4) * 0.3;

        card.style.transform = `translate3d(${x}px, ${y}px, ${depth}px) rotate(${rotation + travel * 4}deg)`;
        card.style.opacity = opacity.toFixed(3);
        card.style.filter = `blur(${blur.toFixed(2)}px) brightness(${brightness.toFixed(3)})`;
      });
    };

    // 【原因】将高频 scroll/resize 合并到浏览器下一帧，避免重复布局计算。
    const requestRender = () => {
      if (!frame) frame = window.requestAnimationFrame(render);
    };

    render();
    window.addEventListener('scroll', requestRender, { passive: true });
    window.addEventListener('resize', requestRender);

    // 【安全边界】组件卸载时必须移除监听并取消未执行的动画帧。
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', requestRender);
      window.removeEventListener('resize', requestRender);
    };
  }, [stages.length, stream.length]);

  // ============================================================
  // 5. 首屏结构
  // 【关联】所有 className 对应 ContentTunnel.module.css。
  // 【结构】背景封面层 → 统一遮罩 → 文案层 → 流程轨道 → 滚动提示。
  // ============================================================
  return (
    <section className={styles.scene} ref={sectionRef} aria-labelledby="page-title">
      <div className={styles.sticky}>
        {/* 背景层：氛围底色、循环封面、全屏统一遮罩。 */}
        <div className={styles.atmosphere} aria-hidden="true" />
        <div className={styles.stage} aria-hidden="true">
          {stream.map((cover, index) => (
            <article
              className={`${styles.cover} ${styles[`tone_${cover.tone}`]}`}
              key={`${cover.id}-${index}`}
              ref={(node) => { cardRefs.current[index] = node; }}
            >
              {cover.image ? (
                <img src={cover.image} alt="" loading={index < 4 ? 'eager' : 'lazy'} />
              ) : (
                <div className={styles.coverArtwork}>
                  <span className={styles.coverSignal} />
                  <span className={styles.coverLine} />
                  <span className={styles.coverBlock} />
                  <small>{cover.label}</small>
                  <strong>{cover.caption}</strong>
                </div>
              )}
            </article>
          ))}
        </div>
        <div className={styles.screenShade} aria-hidden="true" />

        {/* 信息层：平台定位、存在意义和用户行动路径保持同屏。 */}
        <header className={styles.topbar}>
          <span>QIUYUN / FRONTEND</span>
          <span>CONTENT WORKSPACE</span>
        </header>

        <div className={styles.copy}>
          <div className={styles.workspaceIntro}>
            <p className={styles.eyebrow}>{eyebrow}</p>
            <h1 id="page-title">
              {title.map((line) => <span key={line}>{line}</span>)}
            </h1>
            <p className={styles.note}>{note}</p>
          </div>

          <div className={styles.purpose} role="region" aria-labelledby="purpose-title">
            <p className={styles.purposeEyebrow}>{purposeEyebrow}</p>
            <h2 id="purpose-title">{purposeBody}</h2>
            <p className={styles.purposeBoundary}>{boundary}</p>
          </div>

          <div className={styles.statement} aria-label="内容触达目标">
            {statement.map((line, index) => (
              <Fragment key={line}>
                {index > 0 && <span className={styles.statementArrow} aria-hidden="true">→</span>}
                <strong>{line}</strong>
              </Fragment>
            ))}
          </div>
        </div>

        {/* 轨道只表达当前流程环节；详细说明放在后续 workflow 区域。 */}
        <div className={styles.rail} aria-label="当前工作流环节">
          <div className={styles.railMeta}>
            <span>当前流程环节</span>
            <strong>{stages[activeStage]?.label}</strong>
          </div>
          <ol>
            {stages.map((stage, index) => (
              <li className={index === activeStage ? styles.active : ''} key={stage.id}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <strong>{stage.label}</strong>
              </li>
            ))}
          </ol>
        </div>

        <div className={styles.scrollHint}>
          <span />
          {scrollHint}
        </div>
      </div>
    </section>
  );
}
