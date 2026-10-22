import { useEffect, useRef, useState } from 'react';
import type { WeeklyMaterial, WeeklyNonPromotionCard } from '../db/meeting-weekly-material';
import type { WeeklyMeetingDraft } from '../db/schema';
import { PromotionCards, NonPromotionCards } from './WeeklyReviewCards';
import '../styles/meeting-weekly.css';
interface Props {
    meeting: {
        id: string;
        name: string;
        periodStart: string;
        periodEnd: string;
        updatedAt: string;
        status: string;
        currentVersionNumber: number;
    };
    draft: WeeklyMeetingDraft;
    material: WeeklyMaterial;
    images: Array<{
        id: string;
        name: string;
    }>;
    previousAction?: string;
    previousName?: string;
}
const money = (v: number | null) => v == null ? '—' : `¥${v.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export default function BusinessWeeklyMeeting({ meeting, draft: initial, material: initialMaterial, images: initialImages, previousAction, previousName }: Props) {
    const [draft, setDraft] = useState(initial), [material, setMaterial] = useState(initialMaterial), [range, setRange] = useState({ from: meeting.periodStart, to: meeting.periodEnd }), [message, setMessage] = useState(''), [busy, setBusy] = useState(false), [images, setImages] = useState(initialImages), [query, setQuery] = useState('');
    const liveDraft = useRef(draft), liveRange = useRef(range);
    liveDraft.current = draft;
    liveRange.current = range;
    const host = useRef<HTMLFormElement>(null), stamp = useRef(meeting.updatedAt), dirty = useRef(false), reading = useRef(false), writing = useRef(false), readToken = useRef(0);
    const changed = (next: WeeklyMeetingDraft) => { setDraft(next); dirty.current = true; document.documentElement.dataset.unsaved = 'true'; };
    const text = (field: keyof WeeklyMeetingDraft, value: string) => changed({ ...draft, [field]: value });
    const setPromotion = (key: string, value: boolean) => changed({ ...draft, promotionSelections: value ? [...new Set([...(draft.promotionSelections ?? []), key])] : (draft.promotionSelections ?? []).filter(k => k !== key) });
    const setNon = (key: string, value: boolean) => { const [scheduleId, checkpointType] = key.split(':'); changed({ ...draft, nonPromotionSelections: value ? [...draft.nonPromotionSelections, { scheduleId, checkpointType: checkpointType as 'day_7' | 'day_15' }] : draft.nonPromotionSelections.filter(s => `${s.scheduleId}:${s.checkpointType}` !== key) }); };
    const updateInput = (key: string, field: string, value: string) => changed({ ...draft, promotionInputs: { ...draft.promotionInputs, [key]: { ...(draft.promotionInputs[key] ?? { clickRate: null, recordedThrough: '', currentSituation: '', activeAction: '' }), [field]: field === 'clickRate' ? value === '' ? null : Number(value) : value } } });
    const selectedNon = draft.nonPromotionSelections.map(s => `${s.scheduleId}:${s.checkpointType}`);
    const refresh = async () => {
        if (reading.current || writing.current)
            return;
        reading.current = true;
        const token = ++readToken.current;
        setMessage('');
        try {
            const { readBusiness } = await import('../scripts/business-read');
            const result = await readBusiness(host.current!, async (task) => { const response = await fetch(`/api/meeting-reviews/${meeting.id}/material?from=${range.from}&to=${range.to}`, { signal: task.signal, cache: 'no-store' }); const json = await response.json(); if (!response.ok)
                throw new Error(json.message); return json.material as WeeklyMaterial; }, { isCurrent: () => token === readToken.current });
            if (!result)
                return;
            if (liveRange.current.from !== result.periodStart || liveRange.current.to !== result.periodEnd)
                return;
            const current = liveDraft.current;
            const missingPromotion = (current.promotionSelections ?? []).filter(k => !result.promotions.some(p => p.key === k)), missingNon = current.nonPromotionSelections.map(s => `${s.scheduleId}:${s.checkpointType}`).filter(k => !result.nonPromotions.some(p => p.key === k));
            if ((missingPromotion.length || missingNon.length) && !await window.businessConfirm(`当前区间有 ${missingPromotion.length + missingNon.length} 项已选记录不再符合候选条件。刷新会取消这些勾选，文字保持不变。`, { title: '核对候选变化', confirmLabel: '刷新并取消失效勾选', cancelLabel: '保留当前数据' }))
                return;
            setMaterial(result);
            changed({ ...current, promotionSelections: (current.promotionSelections ?? []).filter(k => !missingPromotion.includes(k)), nonPromotionSelections: current.nonPromotionSelections.filter(s => !missingNon.includes(`${s.scheduleId}:${s.checkpointType}`)), materialFingerprint: result.fingerprint });
            setMessage('数据已刷新，请核对后保存。');
        }
        catch (error) {
            setMessage(error instanceof Error ? error.message : '数据刷新失败，输入已保留。');
        }
        finally {
            reading.current = false;
        }
    };
    const save = async (action: 'save' | 'finalize') => {
        if (writing.current || reading.current)
            return;
        if (!host.current?.reportValidity())
            return;
        if (range.from !== material.periodStart || range.to !== material.periodEnd) {
            setMessage('区间已调整，请先刷新数据。');
            return;
        }
        if (action === 'finalize' && !await window.businessConfirm('将保存勾选内容、比较样本、数据和结论为不可变版本。', { title: '周例会定稿', confirmLabel: '确认定稿', cancelLabel: '继续编辑' }))
            return;
        writing.current = true;
        setBusy(true);
        setMessage('正在保存…');
        try {
            const response = await fetch(`/api/meeting-reviews/${meeting.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, draft: { ...draft, schemaVersion: 4, materialSnapshot: undefined, materialFingerprint: material.fingerprint }, expectedUpdatedAt: stamp.current, periodStart: material.periodStart, periodEnd: material.periodEnd }) });
            const result = await response.json();
            if (!response.ok) {
                setMessage(result.message ?? '保存失败，输入已保留。');
                return;
            }
            stamp.current = result.updatedAt;
            dirty.current = false;
            document.documentElement.dataset.unsaved = 'false';
            setMessage(action === 'finalize' ? '已定稿' : '草稿已保存');
            if (action === 'finalize')
                location.assign(`?meeting=${meeting.id}&version=${result.versionNumber}`);
        }
        catch {
            setMessage('连接失败，输入已保留，可重试。');
        }
        finally {
            writing.current = false;
            setBusy(false);
        }
    };
    useEffect(() => { const button = document.querySelector<HTMLButtonElement>('[data-weekly-save]'); const onSave = () => void save('save'); button?.addEventListener('click', onSave); return () => button?.removeEventListener('click', onSave); });
    useEffect(() => () => { readToken.current++; }, []);
    const selectAll = () => changed({ ...draft, promotionSelections: [...new Set([...(draft.promotionSelections ?? []), ...material.promotions.filter(p => p.kind === 'current').map(p => p.key)])], nonPromotionSelections: [...new Map([...draft.nonPromotionSelections, ...material.nonPromotions.filter(p => p.kind === 'current').map(p => ({ scheduleId: p.scheduleId, checkpointType: p.checkpointType }))].map(s => [`${s.scheduleId}:${s.checkpointType}`, s])).values()] });
    const upload = async (files: File[]) => { if (writing.current || reading.current)
        return; writing.current = true; setBusy(true); try {
        for (const file of files) {
            if (file.size > 3145728) {
                setMessage('每张图片最多 3 MB。');
                continue;
            }
            const data = new FormData();
            data.set('meetingId', meeting.id);
            data.set('image', file);
            const res = await fetch('/api/meeting-attachments', { method: 'POST', body: data });
            const result = await res.json();
            if (!res.ok) {
                setMessage(result.message ?? '上传失败');
                continue;
            }
            setImages(list => [...list, { id: result.id, name: result.name }]);
            setDraft(d => ({ ...d, attachmentIds: [...(d.attachmentIds ?? []), result.id] }));
            dirty.current = true;
            document.documentElement.dataset.unsaved = 'true';
            setMessage('图片已上传，请保存草稿。');
        }
    }
    catch {
        setMessage('上传失败，输入已保留。');
    }
    finally {
        writing.current = false;
        setBusy(false);
    } };
    const nonGroup = (rows: WeeklyNonPromotionCard[]) => <NonPromotionCards rows={rows} query={query} context={material.nonPromotionContext} selected={selectedNon} onSelect={setNon}/>;
    return <form ref={host} data-weekly-report data-report-v4 className="business-form weekly-report" onSubmit={e => e.preventDefault()}>
  <fieldset className="weekly-fields" disabled={busy}><nav className="weekly-section-nav" aria-label="例会内容"><a href="#weekly-conclusion">结论与行动</a><a href="#weekly-promotion">推广阶段</a><a href="#weekly-non">非推广</a><a href="#weekly-other">其他事项</a></nav>
  <section className="weekly-paper" id="weekly-conclusion"><header><div><h2>本期结论与行动</h2><p>{material.periodStart} — {material.periodEnd}</p></div><button type="button" className="business-action-secondary" onClick={selectAll} disabled={busy}>全选本期候选</button></header>
   <div className="weekly-summary"><div><span>实际跑量帖子</span><strong>{material.summary.posts}<small>篇</small></strong></div><div><span>本期总消耗</span><strong>{money(material.summary.spend)}</strong></div><div><span>实际开口成本</span><strong>{money(material.summary.actualOpenCost)}</strong></div><div><span>实际留资成本</span><strong>{money(material.summary.actualLeadCost)}</strong></div></div>
   <p className="weekly-summary-context">测试 {material.summary.testingPosts} 篇 · 放量 {material.summary.scalingPosts} 篇 · 开口 {material.summary.actualOpenCount ?? '—'} 人 · 留资 {material.summary.actualLeadCount ?? '—'} 人</p>
   <div className="weekly-writing-grid">{([['situation', '跑量情况'], ['strategy', '本周具体动作'], ['coreConclusion', '核心结论与整体总结'], ['nextAction', '下一步行动']] as const).map(([key, label]) => <label key={key}>{label}<textarea rows={3} value={draft[key] ?? ''} onChange={e => text(key, e.target.value)}/></label>)}</div>
   {previousAction && <details className="weekly-source"><summary>上期行动 · {previousName}</summary><p>{previousAction}</p></details>}
   <details className="weekly-source"><summary>持续跟进事项（{draft.issues.length}）</summary><div className="weekly-issues">{draft.issues.map((issue, i) => <div key={issue.id ?? i}><label>问题<input value={issue.problem} onChange={e => changed({ ...draft, issues: draft.issues.map((s, j) => j === i ? { ...s, problem: e.target.value } : s) })}/></label><label>进展<textarea rows={2} value={issue.conclusion} onChange={e => changed({ ...draft, issues: draft.issues.map((s, j) => j === i ? { ...s, conclusion: e.target.value } : s) })}/></label><label>状态<select value={issue.status} onChange={e => changed({ ...draft, issues: draft.issues.map((s, j) => j === i ? { ...s, status: e.target.value as typeof s.status } : s) })}><option value="pending">待处理</option><option value="validating">验证中</option><option value="resolved">已解决</option><option value="paused">暂缓</option></select></label></div>)}</div><button type="button" className="business-action-secondary" onClick={() => changed({ ...draft, issues: [...draft.issues, { problem: '', conclusion: '', status: 'pending' }] })}>新增问题</button></details>
  </section>
  <section className="weekly-calendar-link"><div><strong>内容发布排期核对</strong><span>对照月历核对本期发布安排</span></div><a href={`/business/operations-schedule?month=${material.periodStart.slice(0, 7)}`} target="_blank" rel="noreferrer">查看月历 ↗</a></section>
  <section className="weekly-material-tools"><div className="business-filter"><label>开始日<input type="date" aria-label="例会开始日" disabled={meeting.status === 'completed'} value={range.from} onChange={e => { setRange({ ...range, from: e.target.value }); dirty.current = true; document.documentElement.dataset.unsaved = 'true'; }}/></label><label>结束日<input type="date" aria-label="例会结束日" disabled={meeting.status === 'completed'} value={range.to} onChange={e => { setRange({ ...range, to: e.target.value }); dirty.current = true; document.documentElement.dataset.unsaved = 'true'; }}/></label><button type="button" className="business-action-secondary" onClick={() => void refresh()} disabled={busy}>刷新数据</button></div><label className="weekly-search">搜索候选<input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="名称、学科或分类"/></label></section>
  <section className="weekly-paper" id="weekly-promotion"><header><div><h2>推广帖阶段复盘</h2><p>已选 {(draft.promotionSelections ?? []).length} 项</p></div></header>
   {(['testing', 'scaling'] as const).map(stage => <div className="weekly-card-section" key={stage}><h3>{stage === 'testing' ? '测试结果与阶段小结' : '本期放量'}</h3><PromotionCards rows={material.promotions.filter(p => p.kind === 'current' && p.stageType === stage)} query={query} selected={draft.promotionSelections} onSelect={setPromotion} inputs={draft.promotionInputs} onInput={updateInput}/>{!material.promotions.some(p => p.kind === 'current' && p.stageType === stage) && <p className="weekly-empty">本期暂无{stage === 'testing' ? '测试终止或暂停节点' : '已录入的放量数据'}</p>}</div>)}
   {material.promotions.some(p => p.kind === 'supplement') && <details className="weekly-supplements"><summary>往期补充与更新（{material.promotions.filter(p => p.kind === 'supplement').length}）</summary><PromotionCards rows={material.promotions.filter(p => p.kind === 'supplement')} query={query} selected={draft.promotionSelections} onSelect={setPromotion} inputs={draft.promotionInputs} onInput={updateInput}/></details>}
  </section>
  <section className="weekly-paper" id="weekly-non"><header><div><h2>非推广帖复盘</h2><p>已选 {selectedNon.length} 个主复盘节点 · 二轮自动携带首轮对照</p></div></header>{nonGroup(material.nonPromotions.filter(p => p.kind === 'current'))}{!material.nonPromotions.some(p => p.kind === 'current') && <p className="weekly-empty">本期暂无实际数据截止日在区间内的复盘</p>}
   {material.nonPromotions.some(p => p.kind === 'supplement') && <details className="weekly-supplements"><summary>往期补录与更新（{material.nonPromotions.filter(p => p.kind === 'supplement').length}）</summary>{nonGroup(material.nonPromotions.filter(p => p.kind === 'supplement'))}</details>}
   {material.pending.length > 0 && <details className="weekly-source"><summary>待补数据（{material.pending.length}）</summary>{material.pending.map(p => <p key={p.key}>{p.contentName} · {p.checkpointType === 'day_7' ? '首轮' : '二轮'} · {p.reason}</p>)}</details>}
  </section>
  <section className="weekly-paper" id="weekly-other"><header><h2>其他事项</h2></header><div className="weekly-writing-grid"><label>临时事项<textarea rows={3} value={draft.temporaryNotes ?? ''} onChange={e => text('temporaryNotes', e.target.value)}/></label><label>相关链接（名称 | https://…）<textarea rows={3} defaultValue={(draft.temporaryLinks ?? []).map(l => `${l.label} | ${l.url}`).join('\n')} onChange={e => changed({ ...draft, temporaryLinks: e.target.value.split('\n').filter(l => l.trim()).map(l => { const i = l.indexOf('|'); return { label: i < 0 ? '' : l.slice(0, i).trim(), url: (i < 0 ? l : l.slice(i + 1)).trim() }; }) })}/></label></div><label className="weekly-upload" tabIndex={0} onPaste={e => { const files = [...e.clipboardData.items].filter(i => i.kind === 'file' && i.type.startsWith('image/')).map(i => i.getAsFile()).filter((v): v is File => !!v); if (files.length) {
        e.preventDefault();
        void upload(files);
    } }}>上传或粘贴图片（每张最多 3 MB）<span className="weekly-upload-button">选择图片</span><input className="weekly-file" type="file" accept="image/png,image/jpeg,image/webp" multiple disabled={busy} onChange={e => void upload([...e.target.files ?? []])}/></label><div className="weekly-images">{images.map(image => <label key={image.id}><input type="checkbox" checked={draft.attachmentIds?.includes(image.id) ?? false} onChange={e => changed({ ...draft, attachmentIds: e.target.checked ? [...draft.attachmentIds ?? [], image.id] : (draft.attachmentIds ?? []).filter(id => id !== image.id) })}/><img src={`/api/meeting-attachments/${image.id}`} alt={image.name}/></label>)}</div></section>
  </fieldset><footer className="weekly-report-actions"><output role="status" aria-live="polite">{message}</output><button type="button" className="business-action-secondary" onClick={() => void save('save')} disabled={busy}>{busy ? '正在保存…' : '保存草稿'}</button><button type="button" className="business-action-primary" onClick={() => void save('finalize')} disabled={busy}>{meeting.status === 'completed' ? `定稿 V${meeting.currentVersionNumber + 1}` : '定稿 V0'}</button></footer>
 </form>;
}
