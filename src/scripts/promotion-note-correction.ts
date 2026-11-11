import {businessConfirm} from './business-dialog';
import {getInspector} from './business-inspector';
import {trackFormChanges} from './form-changes';
import {readBusiness} from './business-read';
import {refreshPromotionSchedule,randomRequestKey} from './promotion-timeline';
import {noteIdPeriodsLabel} from '../db/note-identity-rules';

function initialize(){
 document.querySelectorAll<HTMLFormElement>('[data-note-identity-form]:not([data-note-ready])').forEach(form=>{
  form.dataset.noteReady='true';const pane=form.closest<HTMLElement>('[data-inspector]')!,message=form.querySelector<HTMLOutputElement>('[data-note-identity-message]')!,button=form.querySelector<HTMLButtonElement>('[type=submit]')!;
  const field=(name:string)=>form.elements.namedItem(name) as HTMLInputElement;
  let busy=false,saved=false,requestKey=randomRequestKey(),oldPeriods='';
  const changes=trackFormChanges(form,()=>{if(changes.dirty)pane.dataset.dirty='true';else if(!pane.querySelector('form[data-dirty=true]'))getInspector(pane).setClean();});
  form.addEventListener('input',()=>{if(!saved)requestKey=randomRequestKey();});
  const preview=async()=>{
   const q=new URLSearchParams({versionId:field('versionId').value,effectiveOn:field('effectiveOn').value});
   const result=await readBusiness(form,async read=>{const res=await fetch(form.action+'?'+q,{cache:'no-store',signal:read.signal});const body=await res.json();if(!res.ok)throw new Error(body.message);return body;});
   if(!result)return;field('expectedFingerprint').value=result.fingerprint;form.querySelector('[data-current-note-id]')!.textContent=result.platformNoteId??'未填写';oldPeriods=noteIdPeriodsLabel(result.periods);
  };
  form.closest('details')?.addEventListener('toggle',()=>{if(form.closest('details')?.open)void preview().catch(error=>{message.textContent=error.message??'读取失败，请重试。';});});
  const refresh=async()=>{
   const selected=pane.dataset.selectedId,top=pane.querySelector<HTMLElement>('[data-inspector-body]')?.scrollTop??0;
   await refreshPromotionSchedule(form.dataset.scheduleId!,undefined,true);
   if(pane.dataset.selectedId!==selected||pane.hidden)return;
   const next=pane.querySelector<HTMLFormElement>('[data-note-identity-form]');if(next?.closest('details'))next.closest('details')!.open=true;
   const feedback=next?.querySelector<HTMLOutputElement>('[data-note-identity-message]');if(feedback)feedback.textContent='笔记 ID 已更正。';
   next?.querySelector<HTMLElement>('[type=submit]')?.focus({preventScroll:true});
   const body=pane.querySelector<HTMLElement>('[data-inspector-body]');if(body)body.scrollTop=top;
  };
  form.addEventListener('submit',async event=>{
   event.preventDefault();if(busy)return;
   if(saved){busy=true;try{await refresh();}catch{message.textContent='已保存，展示更新失败。请重新读取。';}finally{busy=false;}return;}
   if(!form.reportValidity())return;
   busy=true;button.disabled=true;
   try{await preview();}catch(error){message.textContent=error instanceof Error?error.message:'读取更正范围失败，请重试。';busy=false;button.disabled=false;return;}
   const data=new FormData(form),value=String(data.get('platformNoteId')).trim().toLowerCase(),from=String(data.get('effectiveOn'));
   const range=data.get('scope')==='version'?'本版本全部阶段':`${from} 起（包含当天）及之后`;
   if(!await businessConfirm(`V${form.dataset.versionNumber} · ${range}\n原记录：${oldPeriods||form.querySelector('[data-current-note-id]')!.textContent}\n新 ID：${value}\n\n此范围内原有的后续 ID 切换将被替换，其他版本保持。`,{title:'确认笔记 ID 更正',confirmLabel:'确认更正',cancelLabel:'继续编辑'})){busy=false;button.disabled=false;return;}
   if(!form.isConnected){busy=false;button.disabled=false;return;}message.textContent='';
   data.set('platformNoteId',value);data.set('requestKey',requestKey);data.set('confirmed','true');
   try{
    const response=await fetch(form.action,{method:'POST',body:data,headers:{Accept:'application/json'}}),result=await response.json();
    if(!response.ok){message.textContent=result.message??'更正失败，输入已保留。';if(result.code==='NOTE_ID_CHANGED'){await preview();requestKey=randomRequestKey();}return;}
    saved=true;changes.capture();if(!pane.querySelector('form[data-dirty=true]'))getInspector(pane).setClean();
    try{await refresh();}catch{message.textContent='已保存，展示更新失败。请重新读取。';button.textContent='重新读取';for(const control of form.querySelectorAll<HTMLInputElement>('input:not([type=hidden])'))control.disabled=true;}
   }catch{message.textContent='连接失败，当前输入已保留，请重试。';}
   finally{busy=false;button.disabled=false;}
  });
 });
}
document.addEventListener('astro:page-load',initialize);document.addEventListener('business:inspector-render',initialize);document.addEventListener('business:promotion-fragment-updated',initialize);initialize();
