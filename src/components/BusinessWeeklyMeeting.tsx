import {useEffect,useRef,useState} from 'react';
import type {WeeklyMaterial} from '../db/meeting-weekly-material';
import type {WeeklyMeetingDraft} from '../db/schema';
import {PromotionCards,NonPromotionCards} from './WeeklyReviewCards';
import '../styles/meeting-weekly.css';
import {meetingNonPromotionSelections} from '../db/meeting-non-promotion';
import type {WeeklyPostReference} from '../db/meeting-note-ids';
import {meetingFinalizationIssue,type MeetingFinalizationTarget} from '../db/meeting-finalization';
import {cardDataRange,reconcileClickRateRanges,refreshedMeetingName,hasMeetingIssueContent} from '../db/meeting-card-rules';
interface Props{postReferences?:Record<string,WeeklyPostReference>;noteIds?:Record<string,string|null>;meeting:{id:string;name:string;periodStart:string;periodEnd:string;updatedAt:string;status:string;currentVersionNumber:number;meetingType?:string};draft:WeeklyMeetingDraft;material:WeeklyMaterial;images:Array<{id:string;name:string}>;previousAction?:string;previousName?:string;effectiveOn?:string;carriedIssueIds?:string[];}
export default function BusinessWeeklyMeeting({meeting,draft:initial,material:initialMaterial,noteIds:initialNoteIds={},postReferences:initialPostReferences={},effectiveOn,carriedIssueIds=[]}:Props){
 const [draft,setDraft]=useState<WeeklyMeetingDraft>({...initial,workflowVersion:5,nonPromotionSelections:meetingNonPromotionSelections(initialMaterial,initial.nonPromotionSelections)}),[material,setMaterial]=useState(initialMaterial),[range,setRange]=useState({from:meeting.periodStart,to:meeting.periodEnd}),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[picking,setPicking]=useState(!initial.candidatesConfirmed),[query,setQuery]=useState('');
 const [noteIds,setNoteIds]=useState(initialNoteIds),[postReferences,setPostReferences]=useState(initialPostReferences);
 const [failure,setFailure]=useState(false),[problem,setProblem]=useState<MeetingFinalizationTarget>();
 const live=useRef(draft),stamp=useRef(meeting.updatedAt),writing=useRef(false),host=useRef<HTMLFormElement>(null);live.current=draft;
 const issueKeys=useRef(initial.issues.map((issue,index)=>issue.id??`initial-${index}`));
 const displayName=refreshedMeetingName(meeting,material.periodStart,material.periodEnd);
 useEffect(()=>{const title=document.querySelector('.business-toolbar__title strong');if(title)title.textContent=displayName;document.title=displayName+' · 内容发布控制台';},[displayName]);
 function changed(next:WeeklyMeetingDraft){live.current=next;setDraft(next);document.documentElement.dataset.unsaved='true';}
 function text(key:keyof WeeklyMeetingDraft,value:string){changed({...live.current,[key]:value});}
 function select(key:string,checked:boolean){const d=live.current;changed({...d,promotionSelections:checked?[...new Set([...(d.promotionSelections??[]),key])]:(d.promotionSelections??[]).filter(k=>k!==key)});}
 const refresh=async()=>{
  if(writing.current||!host.current)return;
  setBusy(true);
  try{
   const {readBusiness}=await import('../scripts/business-read');
   const result=await readBusiness(host.current,async read=>{const res=await fetch(`/api/meeting-reviews/${meeting.id}/material?from=${range.from}&to=${range.to}`,{cache:'no-store',signal:read.signal}),json=await res.json();if(!res.ok)throw new Error(json.message);return json as {material:WeeklyMaterial;noteIds:Record<string,string|null>;postReferences:Record<string,WeeklyPostReference>}});
   if(!result)return;
   const m=result.material;
   const invalid=(live.current.promotionSelections??[]).some(k=>!m.promotions.some(p=>p.key===k))||live.current.nonPromotionSelections.some(s=>!m.nonPromotions.some(p=>p.key===`${s.scheduleId}:${s.checkpointType}`));
   if(invalid&&!await window.businessConfirm('部分已选内容不在当前区间，刷新将移除这些勾选，保留填写内容。',{title:'更新候选',confirmLabel:'更新候选',cancelLabel:'继续编辑'}))return;
   setMaterial(m);setNoteIds(result.noteIds);setPostReferences(result.postReferences);
   changed({...live.current,materialFingerprint:m.fingerprint,promotionInputs:reconcileClickRateRanges(live.current.promotionInputs,material.promotions,m.promotions),promotionSelections:(live.current.promotionSelections??[]).filter(k=>m.promotions.some(p=>p.key===k)),nonPromotionSelections:meetingNonPromotionSelections(m,live.current.nonPromotionSelections)});
   setFailure(false);setProblem(undefined);setMessage('数据已刷新，已保留填写内容。');
  }catch(e){setFailure(true);setMessage(e instanceof Error?e.message:'刷新失败，输入已保留。');}finally{setBusy(false)}
 };

 function focusProblem(target:MeetingFinalizationTarget){
  setQuery('');
  if(target.kind==='candidates')setPicking(true);
  if(target.kind==='promotion'||target.kind==='nonPromotion')setPicking(false);
  requestAnimationFrame(()=>{
   const form=host.current;if(!form)return;
   const card=target.kind==='promotion'?form.querySelector(`[data-weekly-promotion="${CSS.escape(target.key)}"]`):target.kind==='nonPromotion'&&target.key?form.querySelector(`[data-weekly-non="${CSS.escape(target.key.split(':')[0])}"][data-weekly-checkpoint="${CSS.escape(target.key.split(':')[1])}"]`):null;
   const element=target.kind==='conclusion'?form.querySelector(`[data-meeting-field="${target.field}"]`):target.kind==='issue'?form.querySelector(`[data-meeting-issue="${target.index}"] textarea`):target.kind==='material'?form.querySelector('[data-refresh-material]'):target.kind==='candidates'?form.querySelector('[data-meeting-candidates] button'):card?.querySelector('input:not([readonly]):not(:disabled),select:not(:disabled),textarea:not(:disabled)')??card?.querySelector('.weekly-card-confirm button')??form.querySelector('#weekly-non');
   if(element instanceof HTMLElement){element.scrollIntoView({block:'center'});element.focus({preventScroll:true});}
  });
 }
 function fail(message:string,target?:MeetingFinalizationTarget){setMessage(message);setFailure(true);setProblem(target);if(target)focusProblem(target);}
 const save=async(action='save',back=false):Promise<boolean>=>{
  if(writing.current)return false;
  setFailure(false);setProblem(undefined);
  if(range.from!==material.periodStart||range.to!==material.periodEnd){fail('区间已调整，请先刷新数据。',{kind:'material'});return false;}
  if(action!=='save'){
   const issue=meetingFinalizationIssue(live.current,action==='finalize_pre'?'pre':'post',material.pending.map(p=>p.key));
   if(issue){fail(issue.message,issue.target);return false;}
   const invalid=host.current?.querySelector<HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement>('input:invalid,textarea:invalid,select:invalid');
   if(invalid&&!invalid.disabled){fail(`请检查${invalid.getAttribute('aria-label')||invalid.closest('label')?.firstChild?.textContent?.trim()||'输入字段'}：${invalid.validationMessage}`);setQuery('');requestAnimationFrame(()=>{invalid.scrollIntoView({block:'center'});invalid.focus({preventScroll:true});invalid.reportValidity();});return false;}
  }
  writing.current=true;
  try{
   if(action!=='save'&&typeof window.businessConfirm!=='function')throw new Error('确认框暂不可用，输入已保留，请保存草稿后重新进入。');
   if(action!=='save'&&!await window.businessConfirm(action==='finalize_pre'?'冻结本次会前材料，拟议安排暂不生效。':'确认会后结论、次日安排与事项结果。',{title:action==='finalize_pre'?'会前定稿':'会后定稿',confirmLabel:'确认定稿',cancelLabel:'继续编辑'}))return false;
   setBusy(true);setMessage(action==='save'?'正在保存草稿…':'正在定稿…');
   const res=await fetch(`/api/meeting-reviews/${meeting.id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,draft:{...live.current,workflowVersion:5,materialSnapshot:undefined,materialFingerprint:material.fingerprint,issues:live.current.issues.filter(hasMeetingIssueContent)},expectedUpdatedAt:stamp.current,periodStart:material.periodStart,periodEnd:material.periodEnd})});
   const body=await res.text();let json:{message?:string;updatedAt?:string;versionNumber?:number}|undefined;try{json=JSON.parse(body)}catch{}
   if(!res.ok)throw new Error(json?.message||(res.status===401?'登录已失效，请重新登录后再保存。':`保存失败（${res.status}），输入已保留，请稍后重试。`));
   if(!json?.updatedAt||action!=='save'&&!Number.isInteger(json.versionNumber))throw new Error('保存结果未能确认，输入已保留；请先返回例会总览核对。');
   stamp.current=json.updatedAt;document.documentElement.dataset.unsaved='false';setMessage(action==='save'?'草稿已保存':`已定稿 V${json.versionNumber}，正在打开…`);
   if(action!=='save')location.assign(`?meeting=${meeting.id}&version=${json.versionNumber}`);else if(back)location.assign('/business/meeting-review');return true;
  }catch(e){
   const message=e instanceof TypeError?'连接失败，输入已保留；重试前请先核对例会总览。':e instanceof Error?e.message:'保存失败，输入已保留。';
   fail(message,message.startsWith('来源数据已变化')?{kind:'material'}:undefined);return false;
  }finally{writing.current=false;setBusy(false)}
 };

 const nonDraft=(key:string,value:NonNullable<WeeklyMeetingDraft['nonPromotionInputs']>[string])=>changed({...live.current,nonPromotionInputs:{...live.current.nonPromotionInputs,[key]:value}});
 const nonSaved=async(key:string)=>{const next={...live.current.nonPromotionInputs};delete next[key];changed({...live.current,nonPromotionInputs:next});await refresh();};
 function promotionInput(key:string,field:string,value:string){const d=live.current;changed({...d,promotionInputs:{...d.promotionInputs,[key]:{...d.promotionInputs[key],clickRate:d.promotionInputs[key]?.clickRate??null,recordedThrough:d.promotionInputs[key]?.recordedThrough??'',currentSituation:d.promotionInputs[key]?.currentSituation??'',activeAction:d.promotionInputs[key]?.activeAction??'',confirmed:false,...(field==='confirmed'?{}:{[field]:field==='clickRate'?(value===''?null:Number(value)):value})}}});}
 const promotionConfirmed=async(key:string)=>{const row=material.promotions.find(p=>p.key===key)!;const range=cardDataRange(row),d=live.current;changed({...d,promotionInputs:{...d.promotionInputs,[key]:{...d.promotionInputs[key],confirmed:true,rateNeedsReview:false,rateRange:range,recordedThrough:range?.through??''}}});const saved=await save();if(!saved)changed({...live.current,promotionInputs:{...live.current.promotionInputs,[key]:{...live.current.promotionInputs[key],confirmed:false}}});return saved;};
 function updateIssue(index:number,value:Partial<WeeklyMeetingDraft['issues'][number]>){changed({...live.current,issues:live.current.issues.map((issue,i)=>i===index?{...issue,...value}:issue)});}
 function removeIssue(index:number){if(live.current.issues[index].id)return;issueKeys.current.splice(index,1);const issues=live.current.issues.filter((_,i)=>i!==index);changed({...live.current,issues});requestAnimationFrame(()=>{const target=host.current?.querySelector<HTMLElement>(issues.length?`[data-meeting-issue="${Math.min(index,issues.length-1)}"] textarea`:'[data-weekly-add-issue]');target?.focus({preventScroll:true});});}
 const selectedNon=draft.nonPromotionSelections.map(s=>`${s.scheduleId}:${s.checkpointType}`);
 const candidates=material.promotions.filter(p=>p.kind==='current');
 const filtered=(name:string)=>!query||name.toLowerCase().includes(query.toLowerCase());
 return <form ref={host} data-weekly-report data-report-v4 className="business-form weekly-report" onSubmit={e=>e.preventDefault()}><fieldset className="weekly-fields" disabled={busy}>
 <section className="weekly-material-tools"><div className="business-filter"><label>开始日<input type="date" value={range.from} disabled={meeting.status==='completed'} onChange={e=>{setRange({...range,from:e.target.value});document.documentElement.dataset.unsaved='true'}}/></label><label>结束日<input type="date" value={range.to} disabled={meeting.status==='completed'} onChange={e=>{setRange({...range,to:e.target.value});document.documentElement.dataset.unsaved='true'}}/></label><button type="button" className="business-action-secondary" data-refresh-material onClick={()=>void refresh()}>刷新数据</button></div><label className="weekly-search">搜索候选<input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="帖子名称"/></label></section>
 {picking&&<section className="weekly-paper" data-meeting-candidates><header><h2>选择本期候选</h2><button type="button" className="business-action-secondary" onClick={()=>changed({...live.current,promotionSelections:candidates.map(p=>p.key)})}>全选推广帖</button></header><div className="weekly-table-wrap"><table className="weekly-table"><thead><tr><th>纳入</th><th>帖子</th><th>类型／阶段</th><th>区间</th></tr></thead><tbody>{candidates.filter(p=>filtered(p.contentName)).map(p=><tr key={p.key}><td><input type="checkbox" aria-label={`纳入 ${p.contentName}`} checked={draft.promotionSelections?.includes(p.key)??false} onChange={e=>select(p.key,e.target.checked)}/></td><td>{p.contentName} V{p.versionNumber}</td><td>{p.label}</td><td>{p.startedOn}—{p.endedOn}</td></tr>)}{!candidates.length&&<tr><td colSpan={4}>本期暂无推广帖候选</td></tr>}</tbody></table></div>{material.promotions.some(p=>p.kind==='supplement')&&<details className="weekly-source"><summary>其他历史阶段</summary>{material.promotions.filter(p=>p.kind==='supplement').map(p=><label key={p.key}><input type="checkbox" checked={draft.promotionSelections?.includes(p.key)??false} onChange={e=>select(p.key,e.target.checked)}/>{p.contentName} · {p.label}</label>)}</details>}<p className="weekly-required-note">非推广帖应全部补齐，或明确不复盘<span>本期待处理 {material.pending.length} 项</span></p><div className="weekly-inline-actions"><span>已选推广帖 {draft.promotionSelections?.length??0} 项</span><button type="button" className="business-action-primary" onClick={()=>{changed({...live.current,candidatesConfirmed:true});setPicking(false)}}>确认纳入</button></div></section>}
 {!picking&&<><section id="weekly-promotion"><header className="weekly-section-heading"><h2>推广帖阶段复盘</h2><button type="button" className="business-action-secondary" onClick={()=>setPicking(true)}>调整候选</button></header><PromotionCards postReferences={postReferences} rows={material.promotions.filter(p=>draft.promotionSelections?.includes(p.key))} inputs={draft.promotionInputs} query={query} onInput={promotionInput} decisions={draft.promotionDecisions} onDecision={(id,value)=>changed({...live.current,promotionDecisions:{...live.current.promotionDecisions,[id]:value}})} effectiveOn={effectiveOn} onConfirm={promotionConfirmed}/>{!draft.promotionSelections?.length&&<p className="weekly-empty">本次未纳入推广帖</p>}</section>
 <section id="weekly-non"><header className="weekly-section-heading"><h2>非推广帖复盘</h2></header><NonPromotionCards postReferences={postReferences} noteIds={noteIds} rows={material.nonPromotions.filter(p=>selectedNon.includes(p.key))} context={material.nonPromotionContext} inputs={draft.nonPromotionInputs} onDraft={nonDraft} onSaved={nonSaved} pending={material.pending}/>{!!material.excludedNonPromotions?.length&&<details className="weekly-source"><summary>本期不复盘（{material.excludedNonPromotions.length} 项）</summary>{material.excludedNonPromotions.map(n=><p key={n.key}>{n.contentName} · {n.checkpointType==='day_7'?'首轮':'二轮'} · {n.reason}</p>)}</details>}{!material.pending.length&&!selectedNon.length&&<p className="weekly-empty">本期无待处理非推广节点</p>}</section></>}
 <section className="weekly-paper" id="weekly-conclusion"><header><h2>{draft.finalizationStage==='post'?'会后结论与行动':'初步结论与行动'}</h2></header><div className="weekly-writing-grid">{([['situation','衡量情况'],['strategy','本期具体动作'],['coreConclusion','核心结论'],['nextAction','下一步行动']] as const).map(([key,label])=><label key={key}>{label}<textarea data-meeting-field={key} rows={2} value={draft[key]??''} onChange={e=>text(key,e.target.value)}/></label>)}</div></section>
 <section className="weekly-paper" id="weekly-other"><header><h2>事项跟进</h2></header><p className="weekly-empty">上期未完成事项：{draft.issues.filter(i=>i.id&&carriedIssueIds.includes(i.id)).length||'无'}</p>
 <div className="weekly-table-wrap"><table className="weekly-table weekly-issues-table"><thead><tr><th>问题</th><th>解决方案</th><th>进度</th><th>是否已解决</th><th><span className="weekly-visually-hidden">删除</span></th></tr></thead><tbody>{draft.issues.map((issue,i)=><tr key={issueKeys.current[i]} data-meeting-issue={i}>
 <td><textarea rows={2} aria-label="问题" value={issue.problem} onChange={e=>updateIssue(i,{problem:e.target.value})}/></td>
 <td><textarea rows={2} aria-label="解决方案" value={issue.conclusion} onChange={e=>updateIssue(i,{conclusion:e.target.value})}/></td>
 <td><select aria-label="进度" value={issue.status==='resolved'?'validating':issue.status} onChange={e=>updateIssue(i,{status:e.target.value as typeof issue.status})}><option value="pending">待解决</option><option value="validating">进行中</option><option value="paused">暂缓</option></select></td>
 <td><div className="weekly-issue-check"><input type="checkbox" aria-label="是否已解决" checked={issue.status==='resolved'} onChange={e=>updateIssue(i,{status:e.target.checked?'resolved':'validating'})}/></div></td>
 <td>{!issue.id&&<button type="button" className="weekly-issue-remove" aria-label={`删除第${i+1}项`} title="删除本次新增行" onClick={()=>removeIssue(i)}>×</button>}</td>
 </tr>)}{!draft.issues.length&&<tr><td colSpan={5} className="weekly-issue-empty">暂无跟进事项</td></tr>}</tbody></table></div>
 <button type="button" data-weekly-add-issue className="business-action-secondary" onClick={()=>{issueKeys.current.push('new-'+crypto.randomUUID());changed({...live.current,issues:[...live.current.issues,{problem:'',conclusion:'',status:'pending'}]})}}>新增事项</button></section>
 </fieldset><footer className="weekly-report-actions"><output role={failure?'alert':'status'} aria-live={failure?'assertive':'polite'} data-error={failure||undefined}>{message}</output>{failure&&problem&&<button type="button" className="business-action-secondary" onClick={()=>focusProblem(problem)}>前往处理</button>}<button type="button" className="business-action-secondary" disabled={busy} onClick={()=>void save('save',true)}>{busy?'保存中…':'保存草稿'}</button>{draft.finalizationStage!=='post'&&<button type="button" className="business-action-secondary" disabled={busy} onClick={()=>void save('finalize_pre')}>会前定稿 V{meeting.status==='completed'?meeting.currentVersionNumber+1:0}</button>}{meeting.status==='completed'&&<button type="button" className="business-action-primary" disabled={busy} onClick={()=>void save('finalize_post')}>会后定稿 V{meeting.currentVersionNumber+1}</button>}</footer></form>
}
