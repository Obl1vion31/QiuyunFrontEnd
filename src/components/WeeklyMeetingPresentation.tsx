import {DiscussionText} from './MeetingDiscussionText';
import {useRef} from 'react';
import {PromotionCards,NonPromotionCards} from './WeeklyReviewCards';
import type {WeeklyPostReference} from '../db/meeting-note-ids';
import type {WeeklyMeetingDraft} from '../db/schema';
export default function WeeklyMeetingPresentation({snapshot,postReferences={},discussion,onChange}:{snapshot:any;postReferences?:Record<string,WeeklyPostReference>;discussion?:boolean;onChange?:(draft:WeeklyMeetingDraft)=>void}){
 const {generated={},draft={},meeting={}}=snapshot,summary=generated.summary??{},stage=snapshot.finalizationStage;
 const keys=useRef<string[]>((draft.issues??[]).map((i:any,index:number)=>i.id??`initial-${index}`));
 const update=(key:string,value:any)=>onChange?.({...draft,[key]:value});
 const decisions={...draft.promotionDecisions,...Object.fromEntries((generated.meetingDecisions??[]).map((d:any)=>[d.campaignId,d.action==='restart_testing'?'restart_testing':d.targetStatus]))};
 const money=(value:any)=>value==null?'—':`¥${Number(value).toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
 const writing=(field:string,label:string)=><DiscussionText label={label} value={draft[field]??''} onChange={discussion?value=>update(field,value):undefined}/>;
 const issue=(index:number,field:string,value:string)=>update('issues',draft.issues.map((item:any,n:number)=>n===index?{...item,[field]:value}:item));
 return <article className={`weekly-frozen${discussion?' weekly-discussion business-form':''}`} data-meeting-snapshot data-weekly-snapshot>
  <section className="weekly-paper weekly-results" aria-label="本期结果">
   <header><div><h2>本期结果</h2><p>本期全部实际跑量</p></div><span className={`weekly-final-stage ${stage==='post'?'post':''}`}>{stage==='pre'?'会前定稿':stage==='post'?'会后定稿':'历史定稿'}</span></header>
   <div className="weekly-summary"><div><span>实际跑量帖子</span><strong>{summary.posts??'—'}<small>篇</small></strong></div><div><span>本期总消耗</span><strong>{money(summary.spend)}</strong></div><div><span>实际开口成本</span><strong>{money(summary.actualOpenCost)}</strong></div><div><span>实际留资成本</span><strong>{money(summary.actualLeadCost)}</strong></div></div>
   <div className="weekly-takeaways"><div className="weekly-core-conclusion"><h3>核心结论</h3>{writing('coreConclusion','核心结论')}</div><div className="weekly-next-action"><h3>下一步行动</h3>{writing('nextAction','下一步行动')}{stage==='pre'?<small>拟议安排 · 尚未生效</small>:stage==='post'&&snapshot.decisionEffectiveOn&&<small>已定安排 · 从 {snapshot.decisionEffectiveOn} 起</small>}</div></div>
  </section>
  <section className="weekly-frozen-cards" aria-label="推广帖阶段复盘"><header className="weekly-section-heading"><h2>推广帖阶段复盘</h2><span>{generated.promotions?.length??0} 个阶段</span></header>
   <PromotionCards rows={generated.promotions??[]} inputs={draft.promotionInputs??{}} decisions={decisions} effectiveOn={snapshot.decisionEffectiveOn} decisionStage={stage} postReferences={postReferences} readonly discussion={discussion} onInput={(key,field,value)=>update('promotionInputs',{...draft.promotionInputs,[key]:{...draft.promotionInputs[key],[field]:value}})} onDecision={(key,value)=>update('promotionDecisions',{...draft.promotionDecisions,[key]:value})}/>
   {!generated.promotions?.length&&<p className="weekly-empty">本次未选推广阶段</p>}
  </section>
  <section className="weekly-frozen-cards" aria-label="非推广帖复盘"><header className="weekly-section-heading"><h2>非推广帖复盘</h2><span>{(generated.nonPromotions??[]).filter((r:any)=>!r.comparisonOnly).length} 个节点</span></header>
   <NonPromotionCards rows={generated.nonPromotions??[]} postReferences={postReferences} readonly/>
   {generated.excludedNonPromotions?.length>0&&<details className="weekly-source"><summary>本期不复盘（{generated.excludedNonPromotions.length} 项）</summary>{generated.excludedNonPromotions.map((n:any)=><p key={n.key}>{n.contentName} · {n.checkpointType==='day_7'?'首轮':'二轮'} · {n.reason}</p>)}</details>}
   {!generated.nonPromotions?.length&&<p className="weekly-empty">本次未选非推广节点</p>}
  </section>
  <section className="weekly-paper weekly-support" aria-label="补充分析与事项"><header><h2>补充分析与事项</h2></header><div className="weekly-writing-grid">{[['衡量情况','situation'],['本期具体动作','strategy']].map(([title,key])=><div key={key}><h3>{title}</h3>{writing(key,title)}</div>)}</div>
   <h3>事项跟进</h3><div className="weekly-table-wrap"><table className="weekly-table weekly-discussion-issues"><thead><tr><th>问题</th><th>解决方案</th><th>进度</th><th>是否已解决</th>{discussion&&<th><span className="weekly-visually-hidden">操作</span></th>}</tr></thead><tbody>{draft.issues?.map((item:any,index:number)=><tr key={keys.current[index]??item.id??index}><td><DiscussionText label={`事项${index+1}问题`} value={item.problem} onChange={discussion?v=>issue(index,'problem',v):undefined}/></td><td><DiscussionText label={`事项${index+1}解决方案`} value={item.conclusion} onChange={discussion?v=>issue(index,'conclusion',v):undefined}/></td><td>{discussion?<select aria-label={`事项${index+1}进度`} value={item.status} onChange={e=>issue(index,'status',e.target.value)}>{Object.entries({pending:'待解决',validating:'进行中',resolved:'已解决',paused:'暂缓'}).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select>:({pending:'待解决',validating:'进行中',resolved:'已解决',paused:'暂缓'} as Record<string,string>)[item.status]}</td><td>{discussion?<input type="checkbox" aria-label={`事项${index+1}已解决`} checked={item.status==='resolved'} onChange={e=>issue(index,'status',e.target.checked?'resolved':'pending')}/>:item.status==='resolved'?'是':'否'}</td>{discussion&&<td>{!item.id&&<button type="button" className="weekly-issue-remove" aria-label={`删除事项${index+1}`} onClick={()=>{keys.current.splice(index,1);update('issues',draft.issues.filter((_:any,n:number)=>n!==index));}}>×</button>}</td>}</tr>)}{!draft.issues?.length&&<tr><td colSpan={discussion?5:4}>本期无跟进事项</td></tr>}</tbody></table></div>
   {discussion&&<button type="button" className="business-action-secondary" onClick={()=>{keys.current.push(crypto.randomUUID());update('issues',[...draft.issues,{problem:'',conclusion:'',status:'pending'}]);}}>＋ 新增事项</button>}
  </section>
  {!!(draft.temporaryNotes||draft.temporaryLinks?.length||generated.attachments?.length)&&<section className="weekly-paper"><header><h2>历史补充材料</h2></header><p>{draft.temporaryNotes}</p>{draft.temporaryLinks?.map((l:any)=><p key={l.url}><a href={l.url} target="_blank" rel="noreferrer">{l.label||l.url}</a></p>)}<div className="weekly-images">{generated.attachments?.map((a:any)=>a.mimeType==='application/pdf'?<a key={a.id} href={`/api/meeting-attachments/${a.id}`}>{a.name}</a>:<a key={a.id} href={`/api/meeting-attachments/${a.id}`}><img src={`/api/meeting-attachments/${a.id}`} alt={a.name}/></a>)}</div></section>}
  <div className="weekly-frozen-links"><a href={`/business/operations-schedule?month=${meeting.periodStart?.slice(0,7)}`}>查看内容发布排期 ↗</a></div>
 </article>;
}
