import {navigate} from 'astro:transitions/client';
import {useEffect,useRef,useState} from 'react';
import WeeklyMeetingPresentation from './WeeklyMeetingPresentation';
import {discussionFromDraft,meetingDiscussionKey} from '../db/meeting-discussion-values';
import {meetingFinalizationIssue} from '../db/meeting-finalization';
import type {WeeklyMeetingDraft} from '../db/schema';
import type {WeeklyPostReference} from '../db/meeting-note-ids';
import '../styles/meeting-weekly.css';
export default function BusinessMeetingDiscussion({snapshot,draft:initial,sourceVersionId,draftVersionId,targetVersionNumber,versionDraft=false,meeting,postReferences,canEdit=true,effectiveOn,expired:initialExpired=false,rollback,sealedTextOnly=false,canConfirmPlan=true}:{sealedTextOnly?:boolean;canConfirmPlan?:boolean;snapshot:any;draft:WeeklyMeetingDraft;sourceVersionId:string;draftVersionId?:string;targetVersionNumber:number;versionDraft?:boolean;meeting:{id:string;updatedAt:string;currentVersionNumber:number};postReferences:Record<string,WeeklyPostReference>;canEdit?:boolean;effectiveOn:string;expired?:boolean;rollback?:{allowed:boolean;versions:number[];arrangements:number;reason?:string}}){
 const [draft,setDraft]=useState(initial),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState(false),[editing,setEditing]=useState(false),[expired,setExpired]=useState(initialExpired),[backgroundSaving,setBackgroundSaving]=useState(false),[saveTick,setSaveTick]=useState(0);
 const live=useRef(draft),writing=useRef(false),activeDraftId=useRef(draftVersionId);
 const workingDraft=versionDraft||!!activeDraftId.current;
 const baseline=useRef(initial),stamp=useRef(meeting.updatedAt),host=useRef<HTMLDivElement>(null);
 const baselineKey=meetingDiscussionKey(baseline.current),hasChanges=meetingDiscussionKey(draft)!==baselineKey;
 useEffect(()=>{document.dispatchEvent(new Event('business:editing-scope-change'));},[editing]);
 const changed=(next:WeeklyMeetingDraft)=>{live.current=next;setDraft(next);setError(false);setMessage('');document.documentElement.dataset.unsaved=String(meetingDiscussionKey(next)!==baselineKey);};
 useEffect(()=>{
  const reclaim=(event:Event)=>(event as CustomEvent).detail.waitUntil((async()=>{
   const response=await fetch(`/api/meeting-reviews/${meeting.id}`,{cache:'no-store'});const result=await response.json();if(!response.ok)throw new Error(result.message);
   if(result.meeting.updatedAt!==stamp.current){
    if(meetingDiscussionKey(live.current)!==meetingDiscussionKey(baseline.current))throw new Error('会议已有新的保存内容，当前输入已保留。请核对后重新打开会议。');
    baseline.current=result.meeting.draftSnapshot;live.current=baseline.current;stamp.current=result.meeting.updatedAt;setDraft(baseline.current);
   }
  })());
  host.current!.addEventListener('business:edit-reclaimed',reclaim);
  const controls=document.querySelector('[data-meeting-mode]');
  const switchMode=async(event:Event)=>{
   const target=event.target as HTMLInputElement;if(target.type!=='radio')return;
   const next=target.value==='edit';
   if(writing.current||next&&!canEdit){target.checked=false;return;}
   if(!next&&document.documentElement.dataset.unsaved==='true'&&!await window.businessConfirm('未保存的修改将被放弃。',{title:'退出编辑',confirmLabel:'放弃修改',cancelLabel:'继续编辑'})){(controls?.querySelector('[value="edit"]') as HTMLInputElement).checked=true;return;}
   if(!next){live.current=baseline.current;setDraft(baseline.current);document.documentElement.dataset.unsaved='false';}
   setEditing(next);setMessage('');
  };
  controls?.addEventListener('change',switchMode);
  const update=()=>setExpired(!snapshot.generated.monthly&&Date.now()>=Date.parse(effectiveOn+'T00:00:00+08:00'));
  const timer=setInterval(update,1000);update();
  if((versionDraft||new URL(location.href).searchParams.get('mode')==='edit')&&canEdit){setEditing(true);const radio=controls?.querySelector('[value="edit"]') as HTMLInputElement;if(radio)radio.checked=true;}
  return ()=>{host.current?.removeEventListener('business:edit-reclaimed',reclaim);controls?.removeEventListener('change',switchMode);clearInterval(timer);};
 },[]);
 const save=async(stage?:'pre'|'post',background=false)=>{
  if(host.current?.dataset.staleWrite==='true'){setError(true);setMessage('会议已更新，请刷新页面后继续。当前输入尚未保存。');return false;}
  if(writing.current)return false;
  const modified=meetingDiscussionKey(live.current)!==baselineKey;
  if(!modified&&(!stage||!workingDraft&&!(stage==='post'&&snapshot.finalizationStage==='pre'))){setMessage('尚无实际修改');return;}
  if(stage&&!sealedTextOnly){const issue=meetingFinalizationIssue(live.current,stage,[],snapshot.generated.monthly?.layoutVersion===2||!!live.current.monthlyRefreshFingerprint);if(issue){setError(true);setMessage(issue.message);if(issue.target.kind==='conclusion'){const label=({situation:'衡量情况',strategy:'本期具体动作',coreConclusion:'核心结论',nextAction:'下一步行动'})[issue.target.field];(document.querySelector(`button[aria-label="修改${label}"]`) as HTMLButtonElement)?.click();}return;}}
  writing.current=true;setError(false);setMessage('');
  try{
   if(sealedTextOnly){
    setBusy(true);const current=live.current;
    const response=await fetch('/api/meeting-reviews/'+meeting.id,{method:'PATCH',headers:{'Content-Type':'application/json','X-Business-Feedback':'local'},body:JSON.stringify({action:'revise_sealed_text',sourceVersionId,expectedUpdatedAt:stamp.current,coreConclusion:current.coreConclusion,nextAction:current.nextAction})});
    const result=await response.json();if(!response.ok)throw new Error(result.message);
    document.documentElement.dataset.unsaved='false';const top=window.scrollY;await navigate('?meeting='+meeting.id+'&version='+result.versionNumber,{history:'replace'});window.scrollTo({top,behavior:'instant'});return true;
   }
   if(stage||!activeDraftId.current){
    const title=stage?`${stage==='post'&&snapshot.generated.monthly?'确认预排期':(stage==='pre'?'会前':'会后')+'定稿'} V${targetVersionNumber}`:`建立 V${targetVersionNumber} 草稿`;
    const detail=stage==='pre'?'将冻结本版会前材料，拟议安排尚未生效。':stage==='post'?(snapshot.generated.monthly?'将确认本版预排期，员工随后在排期页落实并提交管理员核对；核对完成前月例会尚未最终封存。':expired?'将冻结本次文字修订；既有安排及生效日期保持不变。':'将冻结本版会后材料，并按既有生效日期执行安排。'):`将建立 V${targetVersionNumber} 草稿，原 V${snapshot.versionNumber} 保留；草稿不会执行安排和事项。`;
    if(!await window.businessConfirm(detail,{title,confirmLabel:stage?(stage==='post'&&snapshot.generated.monthly?'确认预排期':`确认${stage==='pre'?'会前':'会后'}定稿`):'确认保存草稿',cancelLabel:'继续编辑'}))return;
   }
   if(background)setBackgroundSaving(true);else setBusy(true);
   const savingDraft=live.current,values=discussionFromDraft(savingDraft);
   values.promotionInputs=Object.fromEntries(Object.entries(values.promotionInputs).filter(([key])=>snapshot.generated.promotions.some((c:any)=>c.key===key)));
   values.promotionDecisions=Object.fromEntries(Object.entries(values.promotionDecisions).filter(([key])=>snapshot.generated.promotions.some((c:any)=>c.campaignId===key&&!c.testCycleEndedOn)));
   const response=await fetch(`/api/meeting-reviews/${meeting.id}`,{method:'PATCH',headers:{'Content-Type':'application/json','X-Business-Feedback':'local'},body:JSON.stringify({action:stage?'finalize_version_draft':'save_version_draft',stage,sourceVersionId,draftVersionId:activeDraftId.current,expectedUpdatedAt:stamp.current,discussion:values})});
   const result=await response.json().catch(()=>null);
   if(!response.ok)throw new Error(result?.message||`保存失败（${response.status}），输入已保留。`);
   if(background){activeDraftId.current=result.versionId;baseline.current=savingDraft;stamp.current=result.updatedAt;document.documentElement.dataset.unsaved=String(meetingDiscussionKey(live.current)!==meetingDiscussionKey(savingDraft));setMessage('草稿已保存');if(meetingDiscussionKey(live.current)!==meetingDiscussionKey(savingDraft))setSaveTick(v=>v+1);return true;}document.documentElement.dataset.unsaved='false';location.assign(stage?`?meeting=${meeting.id}&version=${result.versionNumber}`:'/business/meeting-review');
  }catch(e){setError(true);setMessage(e instanceof Error?e.message:'连接失败，输入已保留。');return false;}finally{writing.current=false;setBusy(false);setBackgroundSaving(false);}
 };
 useEffect(()=>{if(sealedTextOnly||!activeDraftId.current||snapshot.generated.monthly?.layoutVersion!==2||!hasChanges||!editing)return;const timer=setTimeout(()=>void save(undefined,true),1000);return()=>clearTimeout(timer);},[draft,editing,saveTick]);
 const restore=async()=>{
  if(!rollback?.allowed||expired||writing.current)return;
  if(!await window.businessConfirm(`将从 V${snapshot.versionNumber??''} 恢复材料；V${rollback.versions.join('、V')} 将失效，并撤销 ${rollback.arrangements} 项未生效安排。恢复后必须重新确认并会后定稿。`,{title:'确认回溯历史版本',confirmLabel:'确认回溯',cancelLabel:'取消'}))return;
  writing.current=true;setBusy(true);setError(false);
  try{const res=await fetch(`/api/meeting-reviews/${meeting.id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'rollback_version',sourceVersionId,expectedUpdatedAt:stamp.current,confirmed:true})}),result=await res.json();if(!res.ok)throw new Error(result.message||'回溯失败');location.assign(`?meeting=${meeting.id}&version=${result.versionNumber}&mode=edit`);}catch(e){setError(true);setMessage(e instanceof Error?e.message:'回溯失败，请重试');}finally{writing.current=false;setBusy(false);setBackgroundSaving(false);}
 };
 const rollbackControl=rollback&&<div className="weekly-rollback"><span title={expired?'已过可编辑时间':rollback.reason}><button type="button" className="business-action-secondary" disabled={busy||expired||!rollback.allowed} onClick={()=>void restore()}>回溯到此版本</button></span><small>{expired?'已过可编辑时间':rollback.reason??'回溯后需重新会后定稿'}</small><output role={error?'alert':'status'}>{message}</output></div>;
 return <div ref={host} className="weekly-discussion-host business-form" data-collaboration-resource={`meeting:${meeting.id}`} data-collaboration-label={snapshot.meeting?.name??'例会'} data-collaboration-active={String(editing&&canEdit)}>{!canEdit&&rollbackControl}<fieldset className="weekly-fields" disabled={busy}><WeeklyMeetingPresentation snapshot={{...snapshot,draft}} versionDraft={versionDraft} postReferences={postReferences} discussion={editing&&canEdit} sealedTextOnly={sealedTextOnly} arrangementsLocked={expired} effectiveOn={effectiveOn} onChange={changed} onPlanConfirm={async next=>{changed(next);return (await save(undefined,true))===true;}}/></fieldset>{editing&&canEdit&&sealedTextOnly?<footer className="weekly-report-actions"><output role={error?'alert':'status'}>{message||'仅修订核心结论与下一步行动'}</output><button type="button" className="business-action-primary" disabled={busy||!hasChanges} onClick={()=>void save()}>{busy?'保存中…':'保存文字修订'}</button></footer>:editing&&canEdit?<footer className="weekly-report-actions"><output role={error?'alert':'status'} data-error={error||undefined}>{message||`V${targetVersionNumber} · ${hasChanges?'有未保存修改':versionDraft?'草稿已保存':'尚无实际修改'} · 指标已冻结`}</output><button type="button" className="business-action-secondary" disabled={busy||backgroundSaving||!hasChanges} onClick={()=>void save()}>{busy?'保存中…':'保存草稿'}</button>{snapshot.finalizationStage==='pre'&&<button type="button" className="business-action-secondary" disabled={busy||backgroundSaving||!hasChanges&&!workingDraft} onClick={()=>void save('pre')}>会前定稿 V{targetVersionNumber}</button>}<button type="button" className="business-action-primary" disabled={!canConfirmPlan||busy||backgroundSaving||!hasChanges&&!workingDraft&&snapshot.finalizationStage!=='pre'||snapshot.finalizationStage==='pre'&&expired&&!snapshot.generated.monthly} title={snapshot.finalizationStage==='pre'&&expired&&!snapshot.generated.monthly?'已过可编辑时间':undefined} onClick={()=>void save('post')}>{snapshot.generated.monthly?'确认预排期':'会后定稿'} V{targetVersionNumber}</button></footer>:null}</div>;
}
