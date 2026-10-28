import {meetingReadiness} from '../db/meeting-readiness';
import {useEffect,useRef,useState} from 'react';
import type {WeeklyMaterial} from '../db/meeting-weekly-material';
import type {WeeklyMeetingDraft} from '../db/schema';
import WeeklyMeetingPresentation from './WeeklyMeetingPresentation';
import {PromotionCards,NonPromotionCards} from './WeeklyReviewCards';
import '../styles/meeting-weekly.css';
import {meetingNonPromotionSelections} from '../db/meeting-non-promotion';
import type {WeeklyPostReference} from '../db/meeting-note-ids';
import {meetingFinalizationIssue,type MeetingFinalizationTarget} from '../db/meeting-finalization';
import {cardDataRange,reconcileClickRateRanges,refreshedMeetingName,hasMeetingIssueContent} from '../db/meeting-card-rules';
import {meetingValueKey} from '../db/meeting-discussion-values';
interface Props{draftVersionId:string;postReferences?:Record<string,WeeklyPostReference>;noteIds?:Record<string,string|null>;meeting:{id:string;name:string;periodStart:string;periodEnd:string;updatedAt:string;status:string;currentVersionNumber:number;meetingType?:string};draft:WeeklyMeetingDraft;material:WeeklyMaterial;images:Array<{id:string;name:string}>;previousAction?:string;previousName?:string;effectiveOn?:string;carriedIssueIds?:string[];}
export default function BusinessWeeklyMeeting({meeting,draftVersionId,draft:initial,material:initialMaterial,noteIds:initialNoteIds={},postReferences:initialPostReferences={},effectiveOn}:Props){
 const [draft,setDraft]=useState<WeeklyMeetingDraft>({...initial,workflowVersion:7,materialFingerprint:initialMaterial.fingerprint,promotionSelections:(initial.promotionSelections??[]).filter(key=>initialMaterial.promotions.some(row=>row.key===key)),promotionInputs:reconcileClickRateRanges(initial.promotionInputs,(initial.materialSnapshot as unknown as WeeklyMaterial|undefined)?.promotions??initialMaterial.promotions,initialMaterial.promotions),nonPromotionInputs:Object.fromEntries(Object.entries(initial.nonPromotionInputs??{}).map(([key,value])=>[key,{...value,editing:false}])),nonPromotionSelections:meetingNonPromotionSelections(initialMaterial,initial.nonPromotionSelections)}),[material,setMaterial]=useState(initialMaterial),[range,setRange]=useState({from:meeting.periodStart,to:meeting.periodEnd}),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[picking,setPicking]=useState(!initial.candidatesConfirmed),[query,setQuery]=useState(''),[entered,setEntered]=useState(false);
 const [noteIds,setNoteIds]=useState(initialNoteIds),[postReferences,setPostReferences]=useState(initialPostReferences);
 const [failure,setFailure]=useState(false),[problem,setProblem]=useState<MeetingFinalizationTarget>();
 const live=useRef(draft),stamp=useRef(meeting.updatedAt),writing=useRef(false),host=useRef<HTMLFormElement>(null);live.current=draft;
 const contentKey=(value:WeeklyMeetingDraft)=>{const {materialSnapshot,workflowVersion,...content}=value;return meetingValueKey(content);};
 const savedKey=useRef(contentKey(draft));
 const hasChanges=contentKey(draft)!==savedKey.current||range.from!==material.periodStart||range.to!==material.periodEnd;
 const displayName=refreshedMeetingName(meeting,material.periodStart,material.periodEnd);
 useEffect(()=>{const title=document.querySelector('.business-toolbar__title strong');if(title)title.textContent=displayName;document.title=displayName+' · 内容发布控制台';},[displayName]);
 function changed(next:WeeklyMeetingDraft){live.current=next;setDraft(next);document.documentElement.dataset.unsaved=String(contentKey(next)!==savedKey.current||range.from!==material.periodStart||range.to!==material.periodEnd);}
 function select(key:string,checked:boolean){const d=live.current;changed({...d,promotionSelections:checked?[...new Set([...(d.promotionSelections??[]),key])]:(d.promotionSelections??[]).filter(k=>k!==key)});}
 useEffect(()=>{const check=()=>{if(!document.hidden)void refresh();};document.addEventListener('visibilitychange',check);return()=>document.removeEventListener('visibilitychange',check);},[range.from,range.to,material.fingerprint]);
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
   if(meetingReadiness(m).length)setEntered(false);setMaterial(m);setNoteIds(result.noteIds);setPostReferences(result.postReferences);
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
   if(meetingReadiness(material).length){fail('本次例会仍有待补数据，请先完成底表登记。',{kind:'material'});return false;}
   const issue=meetingFinalizationIssue(live.current,action==='finalize_pre'?'pre':'post',material.pending.map(p=>p.key));
   if(issue){fail(issue.message,issue.target);return false;}
   const invalid=host.current?.querySelector<HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement>('input:invalid,textarea:invalid,select:invalid');
   if(invalid&&!invalid.disabled){fail(`请检查${invalid.getAttribute('aria-label')||invalid.closest('label')?.firstChild?.textContent?.trim()||'输入字段'}：${invalid.validationMessage}`);setQuery('');requestAnimationFrame(()=>{invalid.scrollIntoView({block:'center'});invalid.focus({preventScroll:true});invalid.reportValidity();});return false;}
  }
  writing.current=true;
  try{
   if(action!=='save'&&typeof window.businessConfirm!=='function')throw new Error('确认框暂不可用，输入已保留，请保存草稿后重新进入。');
   if(action!=='save'&&!await window.businessConfirm(action==='finalize_pre'?'将冻结本版会前材料，拟议安排暂不生效。':'将冻结本版内容，并按原生效日期处理安排和事项。',{title:action==='finalize_pre'?'会前定稿 V0':`会后定稿 V${meeting.currentVersionNumber+1}`,confirmLabel:action==='finalize_pre'?'确认会前定稿':'确认会后定稿',cancelLabel:'继续编辑'}))return false;
   setBusy(true);setMessage(action==='save'?'正在保存草稿…':'正在定稿…');
   const res=await fetch(`/api/meeting-reviews/${meeting.id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:action==='save'?'save_version_draft':'finalize_version_draft',stage:action==='save'?undefined:action==='finalize_pre'?'pre':'post',draftVersionId,draft:{...live.current,workflowVersion:7,materialSnapshot:undefined,materialFingerprint:material.fingerprint,issues:live.current.issues.filter(hasMeetingIssueContent)},expectedUpdatedAt:stamp.current,periodStart:material.periodStart,periodEnd:material.periodEnd})});
   const body=await res.text();let json:{message?:string;updatedAt?:string;versionNumber?:number}|undefined;try{json=JSON.parse(body)}catch{}
   if(!res.ok)throw new Error(json?.message||(res.status===401?'登录已失效，请重新登录后再保存。':`保存失败（${res.status}），输入已保留，请稍后重试。`));
   if(!json?.updatedAt||action!=='save'&&!Number.isInteger(json.versionNumber))throw new Error('保存结果未能确认，输入已保留；请先返回例会总览核对。');
   stamp.current=json.updatedAt;savedKey.current=contentKey(live.current);document.documentElement.dataset.unsaved='false';setMessage(action==='save'?'V0 草稿已保存':`已定稿 V${json.versionNumber}，正在打开…`);
   if(action!=='save')location.assign(`?meeting=${meeting.id}&version=${json.versionNumber}`);else if(back)location.assign('/business/meeting-review');return true;
  }catch(e){
   const message=e instanceof TypeError?'连接失败，输入已保留；重试前请先核对例会总览。':e instanceof Error?e.message:'保存失败，输入已保留。';
   fail(message,message.startsWith('来源数据已变化')?{kind:'material'}:undefined);return false;
  }finally{writing.current=false;setBusy(false)}
 };

 function promotionInput(key:string,field:string,value:string){const d=live.current;changed({...d,promotionInputs:{...d.promotionInputs,[key]:{...d.promotionInputs[key],clickRate:d.promotionInputs[key]?.clickRate??null,recordedThrough:d.promotionInputs[key]?.recordedThrough??'',currentSituation:d.promotionInputs[key]?.currentSituation??'',activeAction:d.promotionInputs[key]?.activeAction??'',confirmed:false,...(field==='confirmed'?{}:{[field]:field==='clickRate'?(value===''?null:Number(value)):value})}}});}
 const promotionConfirmed=async(key:string)=>{const row=material.promotions.find(p=>p.key===key)!;const range=cardDataRange(row),d=live.current;changed({...d,promotionInputs:{...d.promotionInputs,[key]:{...d.promotionInputs[key],confirmed:true,rateNeedsReview:false,rateRange:range,recordedThrough:range?.through??''}}});const saved=await save();if(!saved)changed({...live.current,promotionInputs:{...live.current.promotionInputs,[key]:{...live.current.promotionInputs[key],confirmed:false}}});return saved;};
 const selectedNon=draft.nonPromotionSelections.map(s=>`${s.scheduleId}:${s.checkpointType}`);
 const candidates=material.promotions.filter(p=>p.kind==='current');
 const filtered=(name:string)=>!query||name.toLowerCase().includes(query.toLowerCase());
 const gaps=meetingReadiness(material);
 return <form ref={host} data-collaboration-resource={`meeting:${meeting.id}`} data-collaboration-label={displayName} data-weekly-report data-report-v4 className="business-form weekly-report" onSubmit={e=>e.preventDefault()}><fieldset className="weekly-fields" disabled={busy}>
 <section className="weekly-material-tools"><div className="business-filter"><label>开始日<input type="date" value={range.from} disabled={meeting.status==='completed'} onChange={e=>{setRange({...range,from:e.target.value});document.documentElement.dataset.unsaved='true'}}/></label><label>结束日<input type="date" value={range.to} disabled={meeting.status==='completed'} onChange={e=>{setRange({...range,to:e.target.value});document.documentElement.dataset.unsaved='true'}}/></label><button type="button" className="business-action-secondary" data-refresh-material onClick={()=>void refresh()}>刷新数据</button></div><label className="weekly-search">搜索候选<input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="帖子名称"/></label></section>
 {!entered&&<section className="weekly-paper meeting-preparation" data-meeting-preparation><header><h2>例会准备</h2><span className="meeting-readiness" data-complete={!gaps.length}>{gaps.length?`${gaps.length} 项待补充`:'数据已齐全'}</span></header>
 {picking&&<section className="weekly-paper" data-meeting-candidates><header><h2>选择本期候选</h2><button type="button" className="business-action-secondary" onClick={()=>changed({...live.current,promotionSelections:candidates.map(p=>p.key)})}>全选推广帖</button></header><div className="weekly-table-wrap"><table className="weekly-table"><thead><tr><th>纳入</th><th>帖子</th><th>类型／阶段</th><th>区间</th></tr></thead><tbody>{candidates.filter(p=>filtered(p.contentName)).map(p=><tr key={p.key}><td><input type="checkbox" aria-label={`纳入 ${p.contentName}`} checked={draft.promotionSelections?.includes(p.key)??false} onChange={e=>select(p.key,e.target.checked)}/></td><td>{p.contentName} V{p.versionNumber}</td><td>{p.label}</td><td>{p.startedOn}—{p.endedOn}</td></tr>)}{!candidates.length&&<tr><td colSpan={4}>本期暂无推广帖候选</td></tr>}</tbody></table></div>{material.promotions.some(p=>p.kind==='supplement')&&<details className="weekly-source"><summary>其他历史阶段</summary>{material.promotions.filter(p=>p.kind==='supplement').map(p=><label key={p.key}><input type="checkbox" checked={draft.promotionSelections?.includes(p.key)??false} onChange={e=>select(p.key,e.target.checked)}/>{p.contentName} · {p.label}</label>)}</details>}<p className="weekly-required-note">非推广帖应全部补齐，或明确不复盘<span>本期待处理 {material.pending.length} 项</span></p><div className="weekly-inline-actions"><span>已选推广帖 {draft.promotionSelections?.length??0} 项</span><button type="button" className="business-action-primary" onClick={()=>{changed({...live.current,candidatesConfirmed:true});setPicking(false)}}>确认纳入</button></div></section>}
 {gaps.length?<div className="meeting-gap-list">{gaps.map(gap=><div className="meeting-gap" key={gap.key}><div><strong>{gap.name} <small>V{gap.version}</small></strong><span>{gap.kind}</span><details><summary>{gap.dates.length} 个待处理日期 · {gap.dates[0]}</summary><p>{gap.dates.join('、')}</p></details></div><a className="business-action-secondary" href={gap.href} target="_blank" rel="noopener noreferrer">前往补充 ↗</a></div>)}</div>:<p className="hint">本次涉及的已开放数据已完成登记。</p>}
 {!!Object.keys(initial.nonPromotionInputs??{}).length&&<details className="weekly-source"><summary>原草稿中的未提交数据</summary>{Object.entries(initial.nonPromotionInputs??{}).map(([key,value])=><div key={key}><strong>{material.pending.find(p=>p.key===key)?.contentName??key}</strong><p>数据截止 {value.recordedThrough} · 点击率 {value.clickRate}% · 3秒阅读率 {value.threeSecondReadRate}%</p><p>{value.conclusion}</p></div>)}</details>}
 {!entered&&<div className="weekly-inline-actions"><span>截止 {material.periodEnd}</span><button type="button" className="business-action-primary" disabled={!!gaps.length||busy||!draft.candidatesConfirmed||picking} onClick={()=>setEntered(true)}>进入例会</button></div>}
 </section>}
 {entered&&<> <WeeklyMeetingPresentation snapshot={{schemaVersion:4,meeting,finalizationStage:'pre',draft,generated:{summary:material.summary,promotions:[],nonPromotions:[]}}} fullEditing versionDraft onChange={changed} effectiveOn={effectiveOn} promotionSection={<>
{!picking&&<section id="weekly-promotion" aria-label="推广帖阶段复盘"><header className="weekly-section-heading"><h2>推广帖阶段复盘</h2><button type="button" className="business-action-secondary" onClick={()=>{setEntered(false);setPicking(true)}}>调整候选</button></header><PromotionCards postReferences={postReferences} rows={material.promotions.filter(p=>draft.promotionSelections?.includes(p.key))} inputs={draft.promotionInputs} query={query} onInput={promotionInput} decisions={draft.promotionDecisions} onDecision={(id,value)=>changed({...live.current,promotionDecisions:{...live.current.promotionDecisions,[id]:value}})} effectiveOn={effectiveOn} onConfirm={promotionConfirmed}/>{!draft.promotionSelections?.length&&<p className="weekly-empty">本次未纳入推广帖</p>}</section>}</>} nonPromotionSection={<>{!picking&&<section id="weekly-non" aria-label="非推广帖复盘"><header className="weekly-section-heading"><h2>非推广帖复盘</h2></header><NonPromotionCards postReferences={postReferences} noteIds={noteIds} rows={material.nonPromotions.filter(p=>selectedNon.includes(p.key))} context={material.nonPromotionContext} readonly/>{!!material.excludedNonPromotions?.length&&<details className="weekly-source"><summary>本期不复盘（{material.excludedNonPromotions.length} 项）</summary>{material.excludedNonPromotions.map(n=><p key={n.key}>{n.contentName} · {n.checkpointType==='day_7'?'首轮':'二轮'} · {n.reason}</p>)}</details>}{!material.pending.length&&!selectedNon.length&&<p className="weekly-empty">本期无待处理非推广节点</p>}</section>}</>}/></>}

 </fieldset><footer className="weekly-report-actions"><output role={failure?'alert':'status'} aria-live={failure?'assertive':'polite'} data-error={failure||undefined}>{message}</output>{failure&&problem&&<button type="button" className="business-action-secondary" onClick={()=>focusProblem(problem)}>前往处理</button>}<button type="button" className="business-action-secondary" disabled={busy||!hasChanges} onClick={()=>void save('save',true)}>{busy?'保存中…':'保存草稿'}</button>{draft.finalizationStage!=='post'&&<button type="button" className="business-action-secondary" disabled={busy||!!gaps.length||!entered} onClick={()=>void save('finalize_pre')}>会前定稿 V{meeting.status==='completed'?meeting.currentVersionNumber+1:0}</button>}{meeting.status==='completed'&&<button type="button" className="business-action-primary" disabled={busy||!!gaps.length||!entered} onClick={()=>void save('finalize_post')}>会后定稿 V{meeting.currentVersionNumber+1}</button>}</footer></form>
}
