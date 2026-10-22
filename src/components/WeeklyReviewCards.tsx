import type { WeeklyPromotionCard, WeeklyNonPromotionCard, Benchmark } from '../db/meeting-weekly-material';
import { businessDateTime } from '../scripts/business-date';
import type { WeeklyMeetingDraft } from '../db/schema';
const money = (v: number | null | undefined) => v == null ? '—' : `¥${v.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const rate = (v: number | null | undefined) => v == null ? '—' : `${v.toFixed(2)}%`;
const delta = (v: number | null | undefined, b: number | null | undefined, unit = '') => v == null || b == null ? '—' : `${v - b > 0 ? '+' : ''}${(v - b).toFixed(2)}${unit}`;
function Comparison({ row, non = false }: {
    row: {
        historical: Benchmark;
        peers: Benchmark;
        total?: WeeklyPromotionCard['total'];
        clickRate?: number | null;
        threeSecondReadRate?: number | null;
    };
    non?: boolean;
}) { return <div className="weekly-comparison">{[['历史同类', row.historical], ['同期同类', row.peers]].map(([label, value]) => { const b = value as Benchmark; return <div key={String(label)}><span>{String(label)} <small>n={b.n}{!non && b.n > 0 ? ` · ${b.days}天` : ''}</small></span>{b.n ? <span>{non ? `点击 ${rate(b.clickRate)} · 阅读 ${rate(b.threeSecondReadRate)}` : `开口 ${money(b.actualOpenCost)} · 留资 ${money(b.actualLeadCost)}`}</span> : <span>暂无可比样本</span>}{b.n > 0 && <small>{non ? `相差 ${delta(row.clickRate, b.clickRate, '百分点')} / ${delta(row.threeSecondReadRate, b.threeSecondReadRate, '百分点')}` : `成本相差 ${delta(row.total?.actualOpenCost, b.actualOpenCost)} / ${delta(row.total?.actualLeadCost, b.actualLeadCost)} 元`}</small>}</div>; })}</div>; }
export function PromotionCards({ rows, selected = [], onSelect, inputs = {}, onInput, readonly = false, query = '' }: {
    rows: WeeklyPromotionCard[];
    selected?: string[];
    onSelect?: (key: string, value: boolean) => void;
    inputs?: WeeklyMeetingDraft['promotionInputs'];
    onInput?: (key: string, field: string, value: string) => void;
    readonly?: boolean;
    query?: string;
}) {
    return <div className="weekly-card-grid">{rows.map(row => <article className="weekly-stage-card" data-weekly-promotion={row.key} key={row.key} hidden={!!query && !`${row.contentName} ${row.subjectName} ${row.categoryName ?? ''}`.toLowerCase().includes(query.toLowerCase())}>
 <header><div><strong>{row.contentName}</strong><small>V{row.versionNumber} · {row.subjectName} · {row.categoryName ?? '未分类'}</small></div>{!readonly && <input type="checkbox" aria-label={`纳入 ${row.contentName} ${row.stageType === 'testing' ? '测试' : '放量'}`} checked={selected.includes(row.key)} onChange={e => onSelect?.(row.key, e.target.checked)}/>}</header>
 <div className="weekly-card-context"><span className={`weekly-stage-tag ${row.stageType}`}>{row.label}</span><time>{row.startedOn} — {row.endedOn}</time><span>实际投放 {row.total.recordedDays} 天</span></div>
 <div className="weekly-metrics"><div><span>消耗</span><strong>{money(row.total.spend)}</strong></div><div><span>实际开口成本</span><strong>{money(row.total.actualOpenCost)}</strong></div><div><span>实际留资成本</span><strong>{money(row.total.actualLeadCost)}</strong></div></div>
 <p className="weekly-actual-counts">实际开口 {row.total.actualOpenCount ?? '—'} 人 · 实际留资 {row.total.actualLeadCount ?? '—'} 人</p>
 <Comparison row={row}/>
 {row.previous.length > 0 && <div className="weekly-previous"><span>本期新增／更新消耗 {money(row.changes.spend)}</span><span>上次：<a href={`?meeting=${row.previous[0].meetingId}&version=${row.previous[0].versionNumber}`}>{row.previous[0].name}</a></span></div>}
 {!readonly ? <div className="weekly-card-writing"><label>观察<textarea rows={2} value={inputs[row.key]?.currentSituation ?? ''} onChange={e => onInput?.(row.key, 'currentSituation', e.target.value)}/></label><label>行动<textarea rows={2} value={inputs[row.key]?.activeAction ?? ''} onChange={e => onInput?.(row.key, 'activeAction', e.target.value)}/></label></div> : <div className="weekly-card-writing"><p>{inputs[row.key]?.currentSituation || '观察尚未填写'}</p><p>{inputs[row.key]?.activeAction || '行动尚未填写'}</p></div>}
 <details className="weekly-source"><summary>阶段记录、逐日数据与来源{row.missingDates.length ? ` · 缺 ${row.missingDates.length} 日` : ''}</summary>
  <p>本期实际发生消耗 {money(row.periodTotal.spend)}；阶段完整结果不重复并入本期总消耗。</p>{row.events.map((e, i) => <p key={`${e.date}:${i}`}>{e.date} · {e.label} · 最后测试日 {e.lastTestingOn}</p>)}
  {row.missingDates.length > 0 && <p className="weekly-warning">待补数据：{row.missingDates.join('、')}</p>}
  <div className="weekly-facts">{row.facts.map(f => <div key={f.id}><time>{f.metricDate}</time><span>{money(Number(f.spend))}</span><span>开口 {f.actualOpenCount} · 留资 {f.actualLeadCount}{f.recordKind === 'test_residual' ? ' · 残留' : f.dailyStatus !== 'active' ? ' · 暂停／待定跑量' : ''}</span></div>)}</div>
  {!readonly && <label>手动补充点击率（%）<input type="number" min="0" max="100" step="0.01" value={inputs[row.key]?.clickRate ?? ''} onChange={e => onInput?.(row.key, 'clickRate', e.target.value)}/></label>}
  {readonly && inputs[row.key]?.clickRate != null && <p>手动点击率 {rate(inputs[row.key].clickRate)}</p>}
  {row.ownHistory.map((p, i) => <p key={i}>本帖 V{p.versionNumber} · 消耗 {money(p.spend)} · 开口 {money(p.actualOpenCost)} · 留资 {money(p.actualLeadCost)}</p>)}
 </details>
 </article>)}</div>;
}
export function NonPromotionCards({ rows, context = [], selected = [], onSelect, readonly = false, query = '' }: {
    rows: Array<WeeklyNonPromotionCard & {
        comparisonOnly?: boolean;
    }>;
    context?: WeeklyNonPromotionCard[];
    selected?: string[];
    onSelect?: (key: string, value: boolean) => void;
    readonly?: boolean;
    query?: string;
}) {
    const groups = [...new Set(rows.map(r => r.scheduleId))];
    return <div className="weekly-card-grid">{groups.map(id => {
            const original = rows.filter(r => r.scheduleId === id), post = original[0];
            const second = original.some(r => r.checkpointType === 'day_15');
            const first = original.find(r => r.checkpointType === 'day_7') ?? (second ? context.find(r => r.scheduleId === id && r.checkpointType === 'day_7') : undefined);
            const rounds = [...(first ? [first] : []), ...original.filter(r => r.checkpointType === 'day_15')];
            return <article className="weekly-stage-card weekly-non-card" data-weekly-non={id} key={id} hidden={!!query && !`${post.contentName} ${post.subjectName} ${post.categoryName ?? ''}`.toLowerCase().includes(query.toLowerCase())}><header><div><strong>{post.contentName}</strong><small>V{post.versionNumber} · {post.subjectName} · {post.categoryName ?? '未分类'}</small></div></header>
  {second && !first && <p className="weekly-warning">首轮缺失或未填写，不补为零。</p>}
  {rounds.map(row => {
                    const comparisonOnly = (row as any).comparisonOnly || !original.some(r => r.key === row.key);
                    return <section className="weekly-round" key={row.key}><div className="weekly-round-heading"><strong>{row.checkpointType === 'day_7' ? '首轮' : '二轮'}</strong><span>{comparisonOnly ? '对照数据' : row.label}</span>{!readonly && !comparisonOnly && <input type="checkbox" aria-label={`纳入 ${row.contentName} ${row.checkpointType === 'day_7' ? '首轮' : '二轮'}`} checked={selected.includes(row.key)} onChange={e => onSelect?.(row.key, e.target.checked)}/>}</div>
   <small>数据截止 {row.recordedThrough ?? '待补'}{row.skipped ? ' · 当前设为不复盘' : ''} · 已复盘 {row.previous.length} 次</small><div className="weekly-metrics two"><div><span>点击率</span><strong>{rate(row.clickRate)}</strong></div><div><span>3 秒阅读率</span><strong>{rate(row.threeSecondReadRate)}</strong></div></div><Comparison row={row} non/>
   <p className="weekly-round-conclusion">{row.conclusion || '结论尚未填写'}</p><details className="weekly-source"><summary>录入时间与复盘记录</summary><p>首次录入 {row.firstRecordedAt ? businessDateTime(row.firstRecordedAt) : '—'}</p><p>最近更新 {row.updatedAt ? businessDateTime(row.updatedAt) : '—'}</p>{row.cause && <p>原因：{row.cause}</p>}{row.nextAction && <p>行动：{row.nextAction}</p>}{row.ownHistory?.map((p, i) => <p key={`version:${i}`}>本帖 V{p.versionNumber} · 截止 {p.recordedThrough} · 点击 {rate(p.clickRate)} · 阅读 {rate(p.threeSecondReadRate)}</p>)}{row.previous.map(p => <p key={p.meetingId}><a href={`?meeting=${p.meetingId}&version=${p.versionNumber}`}>{p.name} V{p.versionNumber}</a></p>)}</details>
  </section>;
                })}
 </article>;
        })}</div>;
}
