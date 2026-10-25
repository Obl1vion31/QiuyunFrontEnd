import {useRef,useState} from 'react';
import WeeklyMeetingPresentation from './WeeklyMeetingPresentation';
import {discussionFromDraft} from '../db/meeting-discussion-values';
import {meetingFinalizationIssue} from '../db/meeting-finalization';
import type {WeeklyMeetingDraft} from '../db/schema';
import type {WeeklyPostReference} from '../db/meeting-note-ids';
import '../styles/meeting-weekly.css';
export default function BusinessMeetingDiscussion({snapshot,draft:initial,sourceVersionId,meeting,postReferences}:{snapshot:any;draft:WeeklyMeetingDraft;sourceVersionId:string;meeting:{id:string;updatedAt:string;currentVersionNumber:number};postReferences:Record<string,WeeklyPostReference>}){
 const [draft,setDraft]=useState(initial),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState(false);
 const live=useRef(draft),stamp=useRef(meeting.updatedAt),writing=useRef(false),revision=useRef(0);
 const changed=(next:WeeklyMeetingDraft)=>{revision.current++;live.current=next;setDraft(next);document.documentElement.dataset.unsaved='true';};
 const save=async(finalize=false)=>{
  if(writing.current)return;
  const issue=finalize?meetingFinalizationIssue(live.current,'post',[]):undefined;
  if(issue){setError(true);setMessage(issue.message);return;}
  if(finalize&&!await window.businessConfirm('会后定稿将保存本次讨论结论，并从明天执行安排。',{title:`会后定稿 V${meeting.currentVersionNumber+1}`,confirmLabel:'确认定稿',cancelLabel:'继续讨论'}))return;
  writing.current=true;setBusy(true);setError(false);setMessage('');const submitted=revision.current;
  try{
   const values=discussionFromDraft(live.current);
   values.promotionInputs=Object.fromEntries(Object.entries(values.promotionInputs).filter(([key])=>snapshot.generated.promotions.some((c:any)=>c.key===key)));
   values.promotionDecisions=Object.fromEntries(Object.entries(values.promotionDecisions).filter(([key])=>snapshot.generated.promotions.some((c:any)=>c.campaignId===key&&!c.testCycleEndedOn)));
   const response=await fetch(`/api/meeting-reviews/${meeting.id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:finalize?'finalize_discussion':'save_discussion',sourceVersionId,expectedUpdatedAt:stamp.current,discussion:values})});
   const result=await response.json().catch(()=>null);
   if(!response.ok)throw new Error(result?.message||`保存失败（${response.status}），输入已保留。`);
   stamp.current=result.updatedAt;
   if(finalize){document.documentElement.dataset.unsaved='false';location.assign(`?meeting=${meeting.id}&version=${result.versionNumber}`);return;}
   if(revision.current===submitted){document.documentElement.dataset.unsaved='false';setMessage('讨论稿已保存，安排尚未生效。');}else setMessage('已保存提交时的内容，后续修改仍待保存。');
  }catch(e){setError(true);setMessage(e instanceof Error?e.message:'连接失败，输入已保留。');}finally{writing.current=false;setBusy(false);}
 };
 return <div className="weekly-discussion-host business-form"><WeeklyMeetingPresentation snapshot={{...snapshot,draft}} postReferences={postReferences} discussion onChange={changed}/><footer className="weekly-report-actions"><output role={error?'alert':'status'} data-error={error||undefined}>{message||'会中讨论 · 指标已冻结'}</output><button type="button" className="business-action-secondary" disabled={busy} onClick={()=>void save()}>{busy?'保存中…':'保存讨论稿'}</button><button type="button" className="business-action-primary" disabled={busy} onClick={()=>void save(true)}>会后定稿 V{meeting.currentVersionNumber+1}</button></footer></div>;
}
