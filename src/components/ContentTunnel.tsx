/** 首页浅弧封面带。数据由 home.ts 提供，动效只管理当前 Island 内的节点。 */
import { useEffect, useRef, type CSSProperties } from 'react';
import type { CoverItem, WorkflowStage } from '../data/home';
import { attachHomeMotion } from '../scripts/home-motion';
import styles from './ContentTunnel.module.css';
interface Props {
  covers: CoverItem[]; stages: WorkflowStage[]; eyebrow: string; title: string[];
  statement: string[]; note: string; scrollHint: string; purposeEyebrow: string;
  purposeBody: string; boundary: string;
}
// SSR 先输出与动画首帧一致的构图，避免等待 hydration 时九张图片叠在原点。
function initialCoverStyle(index: number, count: number): CSSProperties {
  const d = ((index - 3 + count / 2) % count + count) % count - count / 2;
  const a = Math.abs(d), fade = Math.max(0, Math.min(1, (a - .9) / 2.2));
  return {
    left: `${50 + d * 16.5}%`, top: `calc(70% - ${Math.min(a, 3.8) ** 2 * 6.2}px)`,
    transform: `translate(-50%, -50%) perspective(1100px) rotateY(${-d * 10}deg) rotate(${-d * 2.2}deg) scale(${1.08 - Math.min(a, 3.8) * .105})`,
    opacity: (1 - fade * fade * (3 - 2 * fade)) ** 1.7, zIndex: Math.round(100 - a * 10),
  };
}
export default function ContentTunnel(props: Props) {
  const section = useRef<HTMLElement>(null);
  useEffect(() => section.current ? attachHomeMotion(section.current) : undefined, []);
  const { covers, stages, eyebrow, title, statement, note, scrollHint, purposeEyebrow, purposeBody, boundary } = props;
  return (
    <section ref={section} className={styles.hero} aria-labelledby="page-title" data-home-hero>
      <div className={styles.frame} data-home-frame>
        <header className={`${styles.masthead} shell`}>
          <a className={styles.wordmark} href="/">QIUYUN <span>/</span> FRONTEND</a>
          <span className={styles.context}>CONTENT WORKSPACE</span>
          <a className={styles.login} href="/login">登录工作台 <span aria-hidden="true">↗</span></a>
        </header>
        <div className={styles.ambient} aria-hidden="true" />
        <div className={`${styles.scene} shell`} aria-label="内容封面" data-home-scene>
          {covers.map((cover, index) => (
            <figure key={cover.id} className={styles.cover} data-home-cover={index} style={initialCoverStyle(index, covers.length)}>
              {cover.image && <img src={cover.image} alt={`${cover.label}：${cover.caption}`} width="1080" height="1443" fetchPriority={index >= 2 && index <= 4 ? 'high' : 'auto'} />}
              <figcaption>{cover.label}</figcaption>
              <div className={styles.fallback} aria-hidden="true" data-home-fallback>{cover.label}<strong>{cover.caption}</strong></div>
            </figure>
          ))}
        </div>
        <div className={`${styles.copy} shell`} data-home-copy>
          <div className={styles.intro}>
            <p className="eyebrow">{eyebrow}</p>
            <h1 id="page-title">{title.map(line => <span key={line}>{line}</span>)}</h1>
            <p className={styles.note}>{note}</p>
          </div>
          <div className={styles.purpose} role="region" aria-labelledby="purpose-title">
            <p className="eyebrow">{purposeEyebrow}</p>
            <h2 id="purpose-title">{purposeBody}</h2>
            <p className={styles.boundary}>{boundary}</p>
          </div>
          <div className={styles.goals} aria-label="内容触达目标">
            {statement.map((line, index) => <strong key={line}>{index > 0 && <span className={styles.arrow} aria-hidden="true">→</span>}{line}</strong>)}
          </div>
        </div>
        <div className={`${styles.rail} shell`} aria-label="当前工作流环节" data-home-rail>
          <div className={styles.railMeta}><span>当前流程环节</span><strong data-home-active-stage>{stages[0]?.label}</strong></div>
          <div className={styles.railSteps}>
            <div className={styles.railLine} aria-hidden="true"><i /></div>
            <ol>{stages.map((stage, index) => (
              <li key={stage.id} data-home-stage={index} aria-current={index === 0 ? 'step' : undefined}>
                <i aria-hidden="true" /><span>{String(index + 1).padStart(2, '0')}</span><strong>{stage.label}</strong>
              </li>
            ))}</ol>
          </div>
        </div>
        <div className={`${styles.controls} shell`} data-home-controls hidden>
          <button type="button" className={styles.toggle} aria-label="暂停封面轮播" aria-pressed="false" data-home-toggle><span aria-hidden="true">Ⅱ</span><span data-home-toggle-label>暂停轮播</span></button>
        </div>
        <div className={styles.scrollHint} aria-hidden="true"><i />{scrollHint}</div>
      </div>
    </section>
  );
}
