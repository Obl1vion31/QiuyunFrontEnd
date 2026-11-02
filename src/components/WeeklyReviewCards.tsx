import {contentRoleLabel,rolesForCategory} from '../db/content-roles';
import {useState} from 'react';
import {DiscussionText} from './MeetingDiscussionText';
import {promotionRateComparison,freezeRateComparisons,rateDifference,type RateComparison} from '../db/meeting-rate-comparison';

import WeeklyCardDetails from './WeeklyCardDetails';
import type {WeeklyPromotionCard,WeeklyNonPromotionCard,WeeklyMaterial,Benchmark} from '../db/meeting-weekly-material';
import type {WeeklyMeetingDraft} from '../db/schema';
import {promotionActualLabels,promotionNextOptions,nextActualPromotionState} from '../db/promotion-successors.mjs';
import type {WeeklyPostReference} from '../db/meeting-note-ids';
import {businessDate} from '../scripts/business-date';
import {cardDataRange,sortMeetingNonPromotions} from '../db/meeting-card-rules';

import {checkpointLabel,reviewModeLabels} from '../db/non-promotion-nodes';
const money=(v:number|null|undefined)=>v==null?'—':`¥${v.toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2})}`;

function CardTitle({name,version,reference}:{name:string;version?:number;reference?:WeeklyPostReference}){
 return <div className="weekly-card-title"><strong>{name}</strong><div className="weekly-title-tools">{version!=null&&<span className="weekly-card-version">V{version}</span>}<WeeklyCardDetails variant="info" label={`查看${name}相关资料`}><p>相关资料</p><div className="weekly-reference-links">{reference?.projectDocUrl?<a href={reference.projectDocUrl} target="_blank" rel="noopener noreferrer">项目文档 ↗</a>:<span>项目文档 · 未登记</span>}{reference?.publicationUrl?<a href={reference.publicationUrl} target="_blank" rel="noopener noreferrer">小红书帖子 ↗</a>:<span>小红书帖子 · 未登记</span>}</div></WeeklyCardDetails></div></div>;
}
export function NonPromotionHeader({row,reference,pending=false}:{row:{contentName:string;versionNumber?:number;checkpointType:string;publishedOn?:string;actualPublishAt?:Date|string|null;comparisonOnly?:boolean};reference?:WeeklyPostReference;pending?:boolean}){
 const publishedOn=row.publishedOn||(row.actualPublishAt?businessDate(row.actualPublishAt):reference?.publishedOn),version=row.versionNumber??reference?.versionNumber;
 return <header><div><CardTitle name={row.contentName} version={version} reference={reference}/><small>{row.checkpointType==='day_7'?'首轮（7 天）':'二轮（15 天）'}{pending?' · 待处理':row.comparisonOnly?' · 对照数据':''} · {publishedOn?`发布于 ${publishedOn}`:'发布时间未登记'}</small></div></header>;
}
 const rate=(v:number|null|undefined)=>v==null?'—':`${v.toFixed(2)}%`;
function Comparison({b,non=false}:{b:Benchmark;non?:boolean}){if(!b.n)return <div className="weekly-comparison"><span>历史同类 · 暂无可对比样本</span></div>;return <div className="weekly-comparison"><strong>历史同类（{b.n} 份样本）</strong><span>{b.n?(non?`点击率 ${rate(b.clickRate)} · 阅读率 ${rate(b.threeSecondReadRate)}`:`开口成本 ${money(b.actualOpenCost)} · 留资成本 ${money(b.actualLeadCost)}`):'暂无可对比样本'}</span></div>}
function RateDelta({value,comparison,field='clickRate'}:{compact?:boolean;value:number|null|undefined;comparison?:RateComparison;field?:'clickRate'|'threeSecondReadRate'}){
 const delta=rateDifference(value,comparison,field);
 if(delta==null)return null;
 const rounded=Math.abs(delta)<0.005?0:delta;
 return <span className="weekly-rate-comparison" data-direction={rounded>0?'positive':rounded<0?'negative':'neutral'}><b>{rounded>0?'+':''}{rounded.toFixed(2)} pp</b></span>;
}
function RateSamples({comparison}:{comparison?:RateComparison}){return comparison?<p className="weekly-rate-samples">{comparison.n?(comparison.threeSecondReadRate!=null&&comparison.clickCount!=null&&comparison.readCount!=null&&comparison.clickCount!==comparison.readCount?`同类样本 点击 ${comparison.clickCount}／3秒 ${comparison.readCount} 份`:`同类样本 ${comparison.n} 份`):'暂无同类样本'}</p>:null;}
interface PromotionProps{arrangementsLocked?:boolean;discussion?:boolean;rows:WeeklyPromotionCard[];selected?:string[];onSelect?:(key:string,value:boolean)=>void;inputs?:WeeklyMeetingDraft['promotionInputs'];onInput?:(key:string,field:string,value:string)=>void;readonly?:boolean;query?:string;decisions?:Record<string,string>;onDecision?:(id:string,value:string)=>void;effectiveOn?:string;decisionStage?:'pre'|'post';postReferences?:Record<string,WeeklyPostReference>;onConfirm?:(key:string)=>Promise<boolean>;}
export function PromotionCards({rows,...props}:PromotionProps){return <div className="weekly-card-grid">{freezeRateComparisons({promotions:rows},{promotionInputs:props.inputs??{}}).promotions.map(row=><PromotionCard key={row.key} row={row} {...props}/>)}</div>}
function PromotionCard({row,inputs={},onInput,readonly=false,decisions={},onDecision,effectiveOn,decisionStage,postReferences={},onConfirm,query='',discussion=false,arrangementsLocked=false}:Omit<PromotionProps,'rows'>&{row:WeeklyPromotionCard}){
 const [saving,setSaving]=useState(false),[error,setError]=useState('');
 const input=inputs[row.key],confirmed=!!input?.confirmed&&!input.rateNeedsReview,status=row.currentStatus??(row.stageType==='testing'?'testing':'scaling'),options=row.testCycleEndedOn?[]:promotionNextOptions(status),dataRange=cardDataRange(row);
 const locked=readonly||confirmed;
 const writingLocked=readonly&&!discussion||confirmed&&!discussion,comparison=promotionRateComparison(row,input);
 const confirm=async()=>{if(confirmed){onInput?.(row.key,'confirmed','false');return;}if(input?.clickRate==null){setError('请补充点击率');return;}setSaving(true);setError('');try{if(!await onConfirm?.(row.key))setError('尚未保存，请重试');}catch{setError('保存失败，输入已保留');}finally{setSaving(false)}};
 return <article className="weekly-stage-card" data-print-long={(input?.currentSituation?.length??0)+(input?.activeAction?.length??0)>600?'true':undefined} data-weekly-promotion={row.key} hidden={!!query&&!`${row.contentName} ${row.subjectName}`.toLowerCase().includes(query.toLowerCase())}>
  <header><CardTitle name={row.contentName} version={row.versionNumber} reference={postReferences[row.scheduleId]}/><span className={`weekly-stage-tag ${row.stageType}`}>{row.testCycleEndedOn?`测试第${row.testCycleNumber??1}轮 · 已结束`:promotionActualLabels[status]??row.label}</span></header>
  <div className="weekly-data-context"><p className="weekly-data-range">{dataRange?`${row.testCycleNumber?`测试第${row.testCycleNumber}轮 · `:''}数据 ${dataRange.from}—${dataRange.through}`:'暂无非零数据'}</p><p className="weekly-actual-counts">消耗 {money(row.total.spend)} · 实际开口 {row.total.actualOpenCount??'—'} 人 · 留资 {row.total.actualLeadCount??'—'} 人</p></div>
  <div className="weekly-metrics"><div><span>实际开口成本</span><strong>{money(row.total.actualOpenCost)}</strong></div><div><span>实际留资成本</span><strong>{money(row.total.actualLeadCost)}</strong></div><label><span>点击率（%）</span><div className="weekly-rate-value">{locked?<strong>{rate(input?.clickRate)}</strong>:<input aria-label={`${row.contentName} 点击率`} type="number" min="0" max="100" step="0.01" placeholder="待补充" value={input?.clickRate??''} onChange={e=>onInput?.(row.key,'clickRate',e.target.value)}/>}<RateDelta value={input?.clickRate} comparison={comparison} compact/></div></label></div>
  {!readonly&&input?.rateNeedsReview&&<p className="weekly-rate-warning" role="status">数据区间已变化，点击率待核对</p>}
  <details className="weekly-own-history" open={row.ownHistory.length>0}><summary>本帖历史对比{!row.ownHistory.length?' · 暂无可对比样本':''}</summary>{row.ownHistory.map((h,i)=><div key={i}><span>{h.stageType==='scaling'?'放量':'测试'} · {h.periodLabel??`V${h.versionNumber}`}</span><strong>开口 {money(h.actualOpenCost)} · 留资 {money(h.actualLeadCost)}</strong></div>)}</details>
  <RateSamples comparison={comparison}/>{row.historical.n>0&&<Comparison b={row.historical}/>}
  {readonly&&!discussion&&!input?.currentSituation&&!input?.activeAction?<p className="weekly-writing-empty">观察与行动 · 未补充</p>:<div className="weekly-card-writing">{(['currentSituation','activeAction'] as const).map((key,i)=><label key={key}>{i?'行动':'观察'}{discussion?<DiscussionText label={`${row.contentName} ${i?'行动':'观察'}`} value={input?.[key]??''} onChange={value=>onInput?.(row.key,key,value)}/>:writingLocked?<p>{input?.[key]||'待补充'}</p>:<textarea rows={2} aria-label={`${row.contentName} ${i?'行动':'观察'}`} value={input?.[key]??''} onChange={e=>onInput?.(row.key,key,e.target.value)}/>}</label>)}</div>}
  {discussion?!row.testCycleEndedOn&&options.length>0&&<div className="weekly-promotion-arrangement"><label htmlFor={`discussion-next-${row.key}`}>{decisionStage==='post'?'已定安排':'拟议安排 · 尚未生效'} · 从 {effectiveOn} 起</label><span title={arrangementsLocked?'已过可编辑时间':undefined}><select disabled={arrangementsLocked} id={`discussion-next-${row.key}`} aria-label={`${row.contentName} 下一步状态`} value={decisions[row.campaignId]??''} onChange={e=>onDecision?.(row.campaignId,e.target.value)}><option value="" disabled>请选择下一步安排</option>{options.map(o=>{const value=o.value==='restart_testing'?'restart_testing':nextActualPromotionState(status,o.value)!;return <option key={value} value={value}>{o.label}</option>})}</select></span>{arrangementsLocked&&<small className="weekly-expired">已过可编辑时间</small>}</div>:readonly?!row.testCycleEndedOn&&effectiveOn&&(options.length>0||decisions[row.campaignId])&&<div className="weekly-decision-result" data-decision-stage={decisionStage??'legacy'}><span>{decisionStage==='pre'?'拟议安排 · 尚未生效':decisionStage==='post'?'已定安排':'记录安排'}</span><strong>{(decisions[row.campaignId]==='restart_testing'?'重新开始测试':promotionActualLabels[decisions[row.campaignId]??status])??decisions[row.campaignId]??status}</strong><small>{decisionStage==='pre'?'拟从':'从'} {effectiveOn} 起</small></div>:<div className="weekly-promotion-arrangement">
   <div className="weekly-arrangement-label">{options.length>0&&effectiveOn&&<label htmlFor={`weekly-next-${row.key}`}>从 {effectiveOn} 起</label>}{confirmed&&<small>已确认到草稿</small>}</div>
   <div className="weekly-card-confirm weekly-promotion-controls">{options.length>0&&effectiveOn&&(locked?<strong>{(decisions[row.campaignId]==='restart_testing'?'重新开始测试':promotionActualLabels[decisions[row.campaignId]??status])}</strong>:<select id={`weekly-next-${row.key}`} aria-label={`${row.contentName} 下一步状态`} value={decisions[row.campaignId]??status} onChange={e=>onDecision?.(row.campaignId,e.target.value)}>{options.map(o=>{const target=o.value==='restart_testing'?'restart_testing':nextActualPromotionState(status,o.value)!;return <option key={o.value} value={target}>{o.label}</option>})}</select>)}<button type="button" className="business-action-secondary" disabled={saving} onClick={()=>void confirm()}>{saving?'保存中…':confirmed?'修改':'确认'}</button></div>
   {error&&<output className="weekly-rate-warning" role="alert">{error}</output>}
  </div>}
  <WeeklyCardDetails><p>{row.subjectName} · {row.categoryName??'未分类'} · {row.stageType==='testing'?'测试阶段':'放量阶段'}</p><p>阶段区间 {row.startedOn}—{row.endedOn}</p><p>本期消耗 {money(row.periodTotal.spend)}；完整阶段不重复计入本期总量。</p>{readonly&&input?.clickRate!=null&&input.rateRange===undefined&&<p>原版本未单独记录点击率区间</p>}{row.previous.map(p=><p key={p.meetingId}><a href={`?meeting=${p.meetingId}&version=${p.versionNumber}`}>{p.name} V{p.versionNumber}</a></p>)}
   <table className="weekly-daily-facts"><thead><tr><th scope="col">日期</th><th scope="col">当日状态</th><th scope="col">消耗</th><th scope="col">开口</th><th scope="col">留资</th></tr></thead><tbody>{[...row.facts].sort((a,b)=>a.metricDate.localeCompare(b.metricDate)).map(f=><tr key={f.id}><td><time>{f.metricDate}</time></td><td className="weekly-fact-status">{promotionActualLabels[f.actualStatusSnapshot??row.dailyStates?.[f.metricDate]??'']??'状态未记录'}</td><td>{money(Number(f.spend))}</td><td>{f.actualOpenCount}</td><td>{f.actualLeadCount}</td></tr>)}</tbody></table>
   <a href="/business/daily-promotion-review" target="_blank" rel="noreferrer">前往推广帖复盘查看与编辑</a></WeeklyCardDetails>
 </article>;
}
type NonRow=WeeklyNonPromotionCard&{comparisonOnly?:boolean};
interface NonProps{onConclusion?:(key:string,value:string)=>void;rows:NonRow[];pending?:WeeklyMaterial['pending'];context?:WeeklyNonPromotionCard[];readonly?:boolean;selected?:string[];onSelect?:(key:string,value:boolean)=>void;query?:string;noteIds?:Record<string,string|null>;postReferences?:Record<string,WeeklyPostReference>;}
export function NonPromotionCards({rows,context=[],noteIds={},postReferences={},onConclusion}:NonProps){
 const groups=new Map<string,NonRow[]>();
 for(const row of sortMeetingNonPromotions(rows)){const id=row.contentId||row.scheduleId;if(!groups.has(id))groups.set(id,[]);groups.get(id)!.push(row);}
 const status=(row:NonRow,primary:boolean)=>row.placeholder==='future'?'未到复盘时间':row.placeholder==='missing'?'待补录':row.skipped?'不复盘':primary?'本次复盘':row.previous?.length?'往期已复盘':'已录入，待例会复盘';
 const node=(row:NonRow,primary:boolean)=><section key={row.key} className={`weekly-non-node ${primary?'is-current':'is-comparison'}`} data-weekly-checkpoint={row.checkpointType}>
  <header><strong>{checkpointLabel(row.checkpointType)}</strong><span className="weekly-node-status">{status(row,primary)}</span></header><small className="weekly-node-date">{row.statisticsFrom?row.statisticsFrom+' 至 ':row.statisticsScope==='legacy_cumulative'?'旧累计口径 · 截至 ':'截至 '}{row.recordedThrough||row.dueOn||'未记录'}</small>
  {row.placeholder?<p className="weekly-node-empty">{row.placeholder==='missing'?<a href={`/business/non-promotion-review?view=pending&row=${encodeURIComponent(row.key)}`} target="_blank" rel="noreferrer">前往补录 ↗</a>:'—'}</p>:<>
   <div className="weekly-node-metrics"><div><span>阅读量</span><strong>{row.readCount==null?'未记录':row.readCount.toLocaleString('zh-CN')}</strong></div><div><span>点击率</span><strong>{rate(row.clickRate)}</strong>{row.checkpointKind!=='custom'&&<RateDelta value={row.clickRate} comparison={row.rateComparison}/>}</div><div><span>3 秒阅读率</span><strong>{rate(row.threeSecondReadRate)}</strong>{row.checkpointKind!=='custom'&&<RateDelta value={row.threeSecondReadRate} comparison={row.rateComparison} field="threeSecondReadRate"/>}</div></div>
   {onConclusion&&primary?<DiscussionText label={`${row.contentName} 结论`} value={row.conclusion??""} onChange={v=>onConclusion(row.key,v)}/>:row.conclusion&&<p className="weekly-node-conclusion">{row.conclusion}</p>}
   {row.checkpointKind!=='custom'&&(row.rateComparison?<RateSamples comparison={row.rateComparison}/>:row.historical&&<Comparison b={row.historical} non/>)}
  </>}
 </section>;
 return <div className="weekly-card-grid weekly-non-grid">{[...groups.entries()].map(([id,selected])=>{
  const first=selected[0],primary=new Set(selected.filter(r=>!r.comparisonOnly).map(r=>r.key));
  const others=context.filter(r=>(r.contentId||r.scheduleId)===id&&!selected.some(s=>s.key===r.key)).map(r=>({...r,comparisonOnly:true}));
  const all=[...selected,...others].sort((a,b)=>(a.dueOn??'').localeCompare(b.dueOn??'')||a.key.localeCompare(b.key));
  const visible=all.filter(r=>!r.checkpointType.startsWith('custom:')||primary.has(r.key)),history=all.filter(r=>r.checkpointType.startsWith('custom:')&&!primary.has(r.key)&&!r.placeholder),upcoming=all.filter(r=>r.checkpointType.startsWith('custom:')&&!primary.has(r.key)&&r.placeholder);
  return <article className="weekly-stage-card weekly-non-card" key={id} data-weekly-non={first.scheduleId}>
   <header><div><CardTitle name={first.contentName} version={first.versionNumber} reference={postReferences[first.scheduleId]}/><small>{first.reviewMode?reviewModeLabels[first.reviewMode]:'非推广复盘'}{rolesForCategory(first.categoryId).length?' · '+contentRoleLabel(first.contentRole):''} · 发布于 {first.publishedOn||(first.actualPublishAt?businessDate(first.actualPublishAt):'未记录')}</small></div></header>
   <div className={`weekly-non-compare ${visible.length===1?'single':''}`}>{visible.map(r=>node(r,primary.has(r.key)))}</div>
   {!!history.length&&<details className="weekly-source"><summary>往期自定义复盘 ({history.length})</summary>{history.map(r=>node(r,false))}</details>}
   {!!upcoming.length&&<details className="weekly-source"><summary>待复盘节点 ({upcoming.length})</summary>{upcoming.map(r=>node(r,false))}</details>}
   <WeeklyCardDetails><a href={`/business/non-promotion-review?view=history&row=${encodeURIComponent(first.key)}`} target="_blank" rel="noreferrer">查看完整复盘记录 ↗</a>{noteIds[first.scheduleId]&&<p>笔记 ID：{noteIds[first.scheduleId]}</p>}</WeeklyCardDetails>
  </article>;
 })}</div>;
}
