import { Fragment, useEffect, useRef, useState } from 'react';
import type { CoverItem, WorkflowStage } from '../data/home';
import styles from './ContentTunnel.module.css';

interface Props {
  covers: CoverItem[];
  stages: WorkflowStage[];
  eyebrow: string;
  title: string;
  statement: string[];
  note: string;
  scrollHint: string;
}

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
}: Props) {
  const sectionRef = useRef<HTMLElement>(null);
  const cardRefs = useRef<Array<HTMLElement | null>>([]);
  const [activeStage, setActiveStage] = useState(0);

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
      const progress = Math.min(1, Math.max(0, -rect.top / distance));
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
        const travel = reduceMotion ? offset : (progress * 1.55 + offset) % 1;
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

        <header className={styles.topbar}>
          <span>QIUYUN / FRONTEND</span>
          <span>CONTENT WORKSPACE</span>
        </header>

        <div className={styles.copy}>
          <p className={styles.eyebrow}>{eyebrow}</p>
          <h1 id="page-title">{title}</h1>
          <div className={styles.statement}>
            {statement.map((line, index) => (
              <Fragment key={line}>
                {index > 0 && <span className={styles.statementArrow} aria-hidden="true">→</span>}
                <strong>{line}</strong>
              </Fragment>
            ))}
          </div>
          <p className={styles.note}>{note}</p>
        </div>

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
