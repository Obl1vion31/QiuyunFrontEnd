import { Fragment, useEffect, useRef, useState } from 'react';
import type { CoverItem, WorkflowStage } from '../data/home';
import styles from './ContentTunnel.module.css';

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

// 每张封面的横向位置、纵向位置和基础旋转角度。
// 数组顺序与下方循环生成的 12 张封面一一对应。
const positions = [
  [-36, -23, -9],
  [34, -18, 7],
  [-14, 18, 4],
  [42, 20, -7],
  [-43, 25, 10],
  [12, -28, -4],
  [28, 6, 8],
  [-29, 2, -6],
  [5, 26, 3],
  [-7, -10, -3],
  [47, -4, 6],
  [-48, -12, -8],
];

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
  const sectionRef = useRef<HTMLElement>(null);
  const cardRefs = useRef<Array<HTMLElement | null>>([]);
  const [activeStage, setActiveStage] = useState(0);

  // 重复内容配置形成足够长的视觉流，不需要在数据文件里维护重复项。
  const stream = Array.from({ length: 12 }, (_, index) => covers[index % covers.length]);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    let frame = 0;
    let currentStage = -1;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const render = () => {
      frame = 0;
      const rect = section.getBoundingClientRect();
      const distance = Math.max(section.offsetHeight - window.innerHeight, 1);
      const rawProgress = Math.max(0, -rect.top / distance);
      const progress = Math.min(1, rawProgress);

      // 流程状态在 sticky 阶段结束时停在 06；封面使用未截断的进度，
      // 因此 sticky 开始离场后仍会继续循环，直到整个 Hero 离开视口。
      const animationProgress = Math.min(1.75, rawProgress);
      section.style.setProperty('--scene-progress', progress.toFixed(4));

      const nextStage = Math.min(stages.length - 1, Math.floor(progress * stages.length));
      if (nextStage !== currentStage) {
        currentStage = nextStage;
        setActiveStage(nextStage);
      }

      cardRefs.current.forEach((card, index) => {
        if (!card) return;
        const [xPercent, yPercent, rotation] = positions[index];
        const offset = index / stream.length;
        const travel = reduceMotion ? offset : (animationProgress * 1.55 + offset) % 1;
        const depth = -1450 + travel * 1900;
        const spread = Math.min(window.innerWidth, 1280) / 100;
        const x = xPercent * spread * (0.55 + travel * 0.55);
        const y = yPercent * Math.min(window.innerHeight, 900) / 100;
        const fadeIn = Math.min(1, travel * 6);
        const fadeOut = Math.min(1, (1 - travel) * 7);
        const opacity = Math.max(0, Math.min(fadeIn, fadeOut)) * 0.9;
        const blur = Math.max(0, (0.55 - travel) * 8);

        card.style.transform = `translate3d(${x}px, ${y}px, ${depth}px) rotate(${rotation + travel * 4}deg)`;
        card.style.opacity = opacity.toFixed(3);
        card.style.filter = `blur(${blur.toFixed(2)}px)`;
      });
    };

    // 将高频 scroll/resize 事件合并到浏览器的下一帧执行。
    const requestRender = () => {
      if (!frame) frame = window.requestAnimationFrame(render);
    };

    render();
    window.addEventListener('scroll', requestRender, { passive: true });
    window.addEventListener('resize', requestRender);

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', requestRender);
      window.removeEventListener('resize', requestRender);
    };
  }, [stages.length, stream.length]);

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
