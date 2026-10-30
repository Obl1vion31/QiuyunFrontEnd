import {guardInitialArrangementSubmission} from './promotion-initial-arrangement';
import {openNoteId} from './promotion-note-id';
import {guardMeetingDecisionSubmission} from './meeting-decision';
import {preparePromotionEditor,registerPromotionEditor} from './promotion-editor-lifecycle';
import {readBusiness} from './business-read';
import {businessConfirm} from './business-dialog';
import {randomRequestKey,refreshPromotionSchedule} from './promotion-timeline';
import {promotionActualLabels,promotionSuccessorOptions} from '../db/promotion-successors.mjs';

type Values=Record<string,string>;
type Draft={values:Values;dirty:boolean;busy:boolean;message:string;requestKey:string;views:Set<HTMLFormElement>;success?:boolean;decisionBeforeTerminal?:string};
const documents=new WeakMap<Document,Map<string,Draft>>();
const fields=(form:HTMLFormElement)=>[...form.querySelectorAll<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>('input[name],select[name],textarea[name]')];
const values=(form:HTMLFormElement):Values=>Object.fromEntries(fields(form).map(field=>[field.name,field.value]));
const formKey=(form:HTMLFormElement)=>form.dataset.pendingRecord!;
const metricNames=['spend','platformOpenCount','actualOpenCount','platformLeadCount','actualLeadCount'];
const cost=(spend:number,count:number)=>count>0?`¥${(spend/count).toFixed(2)}`:'—';
type StateDraft={key:string;form:HTMLFormElement;owner:HTMLFormElement;trigger:HTMLButtonElement;original:string;target:string;reason:string;saved:boolean;busy:boolean;requestKey:string};
const stateDrafts=new Map<string,StateDraft>();
const setUnsaved=()=>{document.documentElement.dataset.unsaved=String(!!document.querySelector('form[data-dirty=true]'));};
const label=(status:string)=>promotionActualLabels[status]??status;
const statusOptions=(owner:HTMLFormElement):Array<{value:string;label:string}>=>owner.dataset.statusEditOptions?JSON.parse(owner.dataset.statusEditOptions):promotionSuccessorOptions(owner.dataset.actualStatus!);
function positionBubble(state:StateDraft){
 const bubble=state.form,rect=state.trigger.getBoundingClientRect(),width=Math.min(340,innerWidth-24),height=bubble.getBoundingClientRect().height;
 let left=rect.right+12,top=rect.top-12;
 if(left+width>innerWidth-12)left=rect.left-width-12;
 if(left<12){left=Math.max(12,Math.min(rect.left,innerWidth-width-12));top=rect.bottom+10;}
 top=Math.max(12,Math.min(top,innerHeight-height-12));
 bubble.style.left=`${left}px`;bubble.style.top=`${top}px`;
}
function hideBubble(state:StateDraft){state.form.hidden=true;state.trigger.setAttribute('aria-expanded','false');if(state.trigger.disabled)state.owner.querySelector<HTMLInputElement>('[name=spend]')?.focus({preventScroll:true});else state.trigger.focus({preventScroll:true});}
function updateBubble(state:StateDraft){
 const preview=state.form.querySelector<HTMLElement>('[data-state-preview]')!;
 preview.replaceChildren();
 const before=document.createElement('span');before.textContent=`${label(state.original)} → ${state.target?label(state.target):'请选择更新状态'}`;
 const status=document.createElement('small');status.textContent=state.saved?'已保存':'未保存';preview.append(before,status);
 state.form.dataset.dirty=String(!state.saved&&!!(state.target||state.reason));
 state.form.classList.toggle('is-saved',state.saved);
 for(const field of fields(state.form))field.disabled=state.saved||state.busy;
 const again=state.form.querySelector<HTMLButtonElement>('[data-state-again]');if(again){again.hidden=!(state.saved&&statusOptions(state.owner).length);again.disabled=state.busy;}const cancel=state.form.querySelector<HTMLButtonElement>('[data-state-cancel]');if(cancel)cancel.textContent=state.saved?'关闭':'取消';
 const button=state.form.querySelector<HTMLButtonElement>('[type=submit]')!;button.disabled=state.saved||state.busy;button.textContent=state.saved?'已保存':state.busy?'正在保存…':'保存变更';
 const caption=state.trigger.querySelector<HTMLElement>('[data-state-caption]');if(caption)caption.textContent=state.saved?'修改':state.target||state.reason?'未保存':'修改';
 setUnsaved();
}
async function openStateBubble(owner:HTMLFormElement){
 if(!await preparePromotionEditor('state'))return;
 const key=formKey(owner),trigger=owner.querySelector<HTMLButtonElement>('[data-toggle-day-state]')!;
 for(const state of stateDrafts.values())if(state.key!==key&&!state.form.hidden&&!await dismissStateBubble(state))return;
 let state=stateDrafts.get(key);
 if(state?.saved){state.form.remove();stateDrafts.delete(key);state=undefined;}
 if(state){state.owner=owner;state.trigger=trigger;if(!state.form.hidden){await dismissStateBubble(state);return;}state.form.hidden=false;trigger.setAttribute('aria-expanded',String(!state.form.hidden));if(!state.form.hidden){positionBubble(state);state.form.querySelector<HTMLSelectElement>('select')?.focus({preventScroll:true});}return;}
 const form=document.createElement('form');form.dataset.collaborationResource=`schedule:${owner.dataset.scheduleId}`;form.dataset.collaborationLabel=owner.dataset.collaborationLabel??'当日状态';form.className='business-form review-state-bubble';form.dataset.dayStateForm=key;form.setAttribute('aria-label','修改当日状态');
 const header=document.createElement('header'),heading=document.createElement('strong'),close=document.createElement('button');heading.textContent='修改当日状态';close.type='button';close.className='review-state-close';close.setAttribute('aria-label','关闭状态气泡');close.textContent='×';header.append(heading,close);
 const body=document.createElement('div');body.className='review-bubble-body';
 const original=owner.dataset.actualStatus!,before=document.createElement('div');before.className='review-state-before';const beforeCaption=document.createElement('span'),beforeValue=document.createElement('strong');beforeCaption.textContent='原状态';beforeValue.textContent=label(original);before.append(beforeCaption,beforeValue);
 const targetLabel=document.createElement('label');targetLabel.textContent='实际状态';const select=document.createElement('select');select.name='targetStatus';select.required=true;select.setAttribute('aria-label','实际状态');select.add(new Option('请选择更新状态',''));for(const option of statusOptions(owner))select.add(new Option(option.label,option.value));targetLabel.append(select);
 const reasonLabel=document.createElement('label');reasonLabel.textContent='跟进原因';const reason=document.createElement('textarea');reason.name='reason';reason.required=true;reason.maxLength=2000;reason.rows=2;reason.setAttribute('aria-label','跟进原因');reasonLabel.append(reason);
 const preview=document.createElement('div');preview.className='review-state-preview';preview.dataset.statePreview='';
 const message=document.createElement('p');message.dataset.stateMessage='';message.setAttribute('role','status');body.append(before,targetLabel,reasonLabel,preview,message);
 const footer=document.createElement('footer'),cancel=document.createElement('button'),submit=document.createElement('button');cancel.type='button';cancel.dataset.stateCancel='';cancel.className='business-action-secondary';cancel.textContent='取消';submit.type='submit';submit.className='business-action-primary';submit.textContent='保存变更';const again=document.createElement('button');again.type='button';again.className='business-action-secondary';again.dataset.stateAgain='';again.textContent='再次修改';again.hidden=true;footer.append(cancel,again,submit);form.append(header,body,footer);document.body.append(form);
 const current:StateDraft={key,form,owner,trigger,original,target:'',reason:'',saved:false,busy:false,requestKey:randomRequestKey()};stateDrafts.set(key,current);
 again.addEventListener('click',()=>{const owner=current.owner;current.form.remove();stateDrafts.delete(key);openStateBubble(owner);});
 close.addEventListener('click',()=>void dismissStateBubble(current));
 cancel.addEventListener('click',()=>void dismissStateBubble(current));
 form.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();void dismissStateBubble(current);}});
 const changed=()=>{current.target=select.value;current.reason=reason.value;message.textContent='';updateBubble(current);};form.addEventListener('input',changed);form.addEventListener('change',changed);
 form.addEventListener('submit',async event=>{
  event.preventDefault();if(current.busy||current.saved||!form.reportValidity())return;current.busy=true;updateBubble(current);message.textContent='正在保存…';
  const payload={scheduleId:current.owner.dataset.scheduleId,reviewDate:(current.owner.elements.namedItem('metricDate') as HTMLInputElement).value,action:'status',targetStatus:current.target,reason:current.reason,requestKey:current.requestKey,fingerprint:current.owner.dataset.fingerprint,confirmImpact:false};
  const send=()=>fetch('/api/promotion-timeline',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  try{let response=await send(),result=await response.json();if(result.confirmationRequired&&await businessConfirm(result.message??'该更正会影响后续已保存记录，确认继续？',{title:'确认历史影响',confirmLabel:'确认更正'})){payload.confirmImpact=true;response=await send();result=await response.json();}
   if(!response.ok){message.textContent=result.message??'保存失败，输入已保留。';return;}
   current.saved=true;message.textContent='变更已保存';form.dataset.dirty='false';updateBubble(current);
   // 指标草稿留在原节点；状态与合法的次日选项由新服务端片段同步。
   const owner=current.owner;
   await refreshPromotionSchedule(String(payload.scheduleId));current.owner=(owner.isConnected?owner:document.querySelector<HTMLFormElement>(`#daily-table [data-metric-form][data-pending-record="${CSS.escape(key)}"]`))??owner;
   current.trigger=current.owner.querySelector<HTMLButtonElement>('[data-toggle-day-state]')??trigger;current.trigger.setAttribute('aria-expanded','true');positionBubble(current);
  }catch{message.textContent=current.saved?'状态已保存，列表更新失败，可关闭后重试刷新。':'连接失败，输入已保留。';}finally{current.busy=false;updateBubble(current);}
 });updateBubble(current);trigger.setAttribute('aria-expanded','true');positionBubble(current);select.focus({preventScroll:true});
}
async function dismissStateBubble(state:StateDraft){
 if(state.busy)return false;
 if(!state.saved&&(state.target||state.reason)&&!await businessConfirm('当日状态修改尚未保存，是否放弃？'))return false;
 if(!state.saved){state.target='';state.reason='';updateBubble(state);}hideBubble(state);state.form.remove();stateDrafts.delete(state.key);setUnsaved();return true;
}
registerPromotionEditor('state',async()=>{for(const state of stateDrafts.values())if(!state.form.hidden&&!await dismissStateBubble(state))return false;return true;});
window.addEventListener('keydown',event=>{if(event.key!=='Escape'||document.querySelector('dialog[open],[data-popover-panel]:popover-open'))return;const state=[...stateDrafts.values()].find(state=>!state.form.hidden);if(!state)return;event.preventDefault();event.stopImmediatePropagation();void dismissStateBubble(state);},{capture:true});
window.addEventListener('resize',()=>{for(const state of stateDrafts.values())if(!state.form.hidden)positionBubble(state);});
window.addEventListener('scroll',()=>{for(const state of stateDrafts.values())if(!state.form.hidden)positionBubble(state);},true);
document.addEventListener('astro:before-swap',()=>{for(const state of stateDrafts.values())state.form.remove();stateDrafts.clear();});
function initialize(){
 const drafts=documents.get(document)??new Map<string,Draft>();documents.set(document,drafts);
 const render=(form:HTMLFormElement,draft:Draft)=>{
  for(const field of fields(form))if(field.name in draft.values&&field.value!==draft.values[field.name])field.value=draft.values[field.name];
  const complete=metricNames.every(name=>draft.values[name]!==''&&draft.values[name]!=null&&Number.isFinite(Number(draft.values[name])));
  form.querySelector<HTMLOutputElement>('[data-open-cost]')!.textContent=complete?cost(Number(draft.values.spend),Number(draft.values.actualOpenCount)):'—';
  form.querySelector<HTMLOutputElement>('[data-lead-cost]')!.textContent=complete?cost(Number(draft.values.spend),Number(draft.values.actualLeadCount)):'—';
  const button=form.querySelector<HTMLButtonElement>('[type=submit]')!;button.disabled=draft.busy||button.hasAttribute('data-lock-disabled');button.textContent=draft.success?'已完成':draft.busy?'正在保存…':'完成复盘';button.toggleAttribute('data-success',!!draft.success);
  form.querySelector<HTMLElement>('[data-form-message]')!.textContent=draft.message;
  for(const field of fields(form))if(field.type!=='hidden')field.disabled=draft.busy||field.hasAttribute('data-lock-disabled');for(const trigger of form.querySelectorAll<HTMLButtonElement>('[data-note-id-trigger]'))trigger.disabled=draft.busy||trigger.hasAttribute('data-lock-disabled');const stateTrigger=form.querySelector<HTMLButtonElement>('[data-toggle-day-state]');if(stateTrigger)stateTrigger.disabled=draft.busy||stateTrigger.hasAttribute('data-lock-disabled')||!statusOptions(form).length;
  const note=draft.values.platformNoteId??'',stored=!!form.dataset.noteId;
  const reference=form.querySelector<HTMLElement>('[data-reference-note-id]');if(reference)reference.textContent=note||'未填写';
  const copy=form.querySelector<HTMLButtonElement>('[data-copy-note-id]');if(copy)copy.hidden=!note;
  const edit=form.querySelector<HTMLButtonElement>('[data-note-id-trigger]');if(edit)edit.textContent=note?'修改':'补填 ID';
  const status=form.querySelector<HTMLElement>('[data-reference-note-status]');if(status)status.textContent=note&&!stored?'待保存':'';
  form.dataset.dirty=String(draft.dirty);
 };
 const sync=(draft:Draft)=>{for(const form of draft.views){if(!form.isConnected){draft.views.delete(form);continue;}render(form,draft);}};
 const bind=(form:HTMLFormElement)=>{
  if(form.dataset.dailyReady)return;form.dataset.dailyReady='true';
  const key=formKey(form);let draft=drafts.get(key);
  if(!draft){draft={values:values(form),dirty:form.dataset.dirty==='true',busy:false,message:'',requestKey:randomRequestKey(),views:new Set()};drafts.set(key,draft);}else{
   for(const field of form.querySelectorAll<HTMLInputElement>('input[type=hidden][name]'))if(field.name!=='platformNoteId'||field.value||!draft.values.platformNoteId)draft.values[field.name]=field.value;
   const decision=form.querySelector<HTMLSelectElement>('[data-review-decision]');if(decision&&!Array.from(decision.options).some(option=>option.value===draft!.values.reviewDecision))draft.values.reviewDecision='';
  }
  const state=draft;state.views.add(form);render(form,state);
  form.querySelector<HTMLButtonElement>('[data-note-id-trigger]')?.addEventListener('click',()=>openNoteId(form));
  form.addEventListener('business:note-id-draft',event=>{const {contentId,value}=(event as CustomEvent).detail;for(const d of drafts.values())if([...d.views].some(v=>v.dataset.contentId===contentId)){d.values.platformNoteId=value;d.dirty=true;d.message='';sync(d);}setUnsaved();});
  form.querySelector<HTMLButtonElement>('[data-toggle-day-state]')?.addEventListener('click',()=>openStateBubble(form));
  const changed=()=>{state.values=values(form);state.dirty=true;state.message='';document.documentElement.dataset.unsaved='true';sync(state);};
  form.addEventListener('input',changed);form.addEventListener('change',changed);
  form.addEventListener('business:metric-context-updated',()=>{
   const previousStatus=state.values.actualStatusSnapshot,previousDecision=state.values.reviewDecision;
   if(!state.dirty&&metricNames.every(name=>state.values[name]===''))for(const name of metricNames)state.values[name]=(form.elements.namedItem(name) as HTMLInputElement).value;
   for(const field of form.querySelectorAll<HTMLInputElement>('input[type=hidden][name]'))if(field.name!=='platformNoteId'||field.value||!state.values.platformNoteId)state.values[field.name]=field.value;
   const decision=form.querySelector<HTMLSelectElement>('[data-review-decision]');
   if(decision){const wanted=['test_discarded','formal_discarded','ended'].includes(previousStatus)?state.decisionBeforeTerminal??'':previousDecision;state.values.reviewDecision=Array.from(decision.options).some(option=>option.value===wanted)?wanted:form.dataset.actualStatus==='test_pending'?'wait_continue':'';if(!state.values.reviewDecision&&previousDecision)state.message='当日状态已更新，请重新选择次日安排。';}
   else {if(!['test_discarded','formal_discarded','ended'].includes(previousStatus))state.decisionBeforeTerminal=previousDecision;state.values.reviewDecision=(form.elements.namedItem('reviewDecision') as HTMLInputElement).value;}
   sync(state);
  });
  form.addEventListener('submit',async event=>{
   event.preventDefault();if(state.busy||!guardInitialArrangementSubmission()||!await guardMeetingDecisionSubmission([form]))return;
   const pending=stateDrafts.get(key);if(pending&&!pending.saved&&(pending.target||pending.reason)){state.message='请先保存或取消当日状态变更。';sync(state);pending.form.hidden=false;positionBubble(pending);return;}
   const note=form.querySelector<HTMLInputElement>('[data-note-id-required]');
   if(note&&!/^[0-9a-fA-F]{24}$/.test(note.value.trim())){
    state.message='请先补填笔记 ID，数值已保留。';sync(state);openNoteId(form);return;
   }
   if(!form.reportValidity())return;
   state.busy=true;state.message='正在保存…';sync(state);
   try{
    const data=new FormData();for(const [name,value]of Object.entries(state.values))data.set(name,value);data.set('requestKey',state.requestKey);data.set('fingerprint',form.dataset.fingerprint??'');
    const response=await fetch('/api/promotion-daily',{method:'POST',body:data,headers:{Accept:'application/json'}});
    const result=await response.json();if(!response.ok){state.message=result.message??'保存失败，请重试。';return;}
    state.dirty=false;state.success=true;state.message='复盘已完成';sync(state);
    // 成功态短暂留在操作位置，随后只合并相关活动的队列。
    await new Promise(resolve=>setTimeout(resolve,matchMedia('(prefers-reduced-motion:reduce)').matches?0:320));
    try{await refreshPromotionSchedule(form.dataset.scheduleId!);}catch{state.message='保存已成功，列表更新失败，请刷新页面查看。';return;}
    drafts.delete(key);pending?.form.remove();stateDrafts.delete(key);
    setUnsaved();
   }catch{state.message='无法连接服务，请稍后重试。';}finally{state.busy=false;sync(state);}
  });
 };
 document.querySelectorAll<HTMLFormElement>('[data-metric-form]').forEach(bind);

 const batch=document.querySelector<HTMLButtonElement>('[data-save-all]');
 if(batch&&!batch.dataset.batchReady){batch.dataset.batchReady='true';batch.addEventListener('click',async()=>{
  const forms=[...document.querySelectorAll<HTMLFormElement>('#daily-table [data-review-container="ready"] [data-metric-form]')];
  if(!forms.length||forms.some(form=>drafts.get(formKey(form))?.busy))return;
  let invalid=false;
  if(!guardInitialArrangementSubmission()||!await guardMeetingDecisionSubmission(forms))return;
  for(const form of forms){const draft=drafts.get(formKey(form))!;const state=stateDrafts.get(formKey(form));
   if(state&&!state.saved&&(state.target||state.reason)){draft.message='请先保存或取消当日状态变更。';sync(draft);if(!invalid){state.form.hidden=false;positionBubble(state);}invalid=true;continue;}
   const note=draft.values.platformNoteId??'';
   if(!/^[0-9a-f]{24}$/i.test(note.trim())){draft.message='请补填笔记 ID。';sync(draft);if(!invalid){form.scrollIntoView({block:'nearest'});openNoteId(form);}invalid=true;continue;}
   if(!form.checkValidity()){draft.message='请完整填写本行指标和次日安排。';sync(draft);if(!invalid){form.scrollIntoView({block:'nearest'});form.reportValidity();}invalid=true;}
  }
  if(invalid)return;
  const rows=forms.map(form=>({...drafts.get(formKey(form))!.values,requestKey:drafts.get(formKey(form))!.requestKey,fingerprint:form.dataset.fingerprint}));
  batch.disabled=true;batch.textContent='正在保存…';for(const form of forms){const draft=drafts.get(formKey(form))!;draft.busy=true;draft.message='正在整批保存…';sync(draft);}
  let saved=false;
  try{const response=await fetch('/api/promotion-daily/batch',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({rows})});const result=await response.json();
   if(!response.ok){for(const form of forms){const draft=drafts.get(formKey(form))!;draft.message=result.key&&result.key!==formKey(form)?'整批未保存，输入已保留。':result.message??'整批未保存，输入已保留。';sync(draft);}const invalid=forms.find(form=>formKey(form)===result.key)??forms[0];invalid.scrollIntoView({block:'nearest'});if(String(result.message).includes('ID'))openNoteId(invalid,result.message);else invalid.querySelector<HTMLInputElement>('[name=spend]')?.focus({preventScroll:true});return;}
   saved=true;for(const form of forms){const draft=drafts.get(formKey(form))!;draft.dirty=false;draft.success=true;draft.message='复盘已完成';sync(draft);}
   batch.textContent='全部已保存';
   await new Promise(resolve=>setTimeout(resolve,matchMedia('(prefers-reduced-motion:reduce)').matches?0:320));
   const host=document.querySelector<HTMLElement>('[data-promotion-pending-body]')!;
   const fresh=await readBusiness(host,async task=>{const res=await fetch(location.href,{cache:'no-store',signal:task.signal});if(!res.ok)throw new Error('列表更新失败');return new DOMParser().parseFromString(await res.text(),'text/html');});
   if(fresh)for(const id of new Set(forms.map(form=>form.dataset.scheduleId!)))await refreshPromotionSchedule(id,fresh);
   for(const form of forms){const key=formKey(form);drafts.delete(key);stateDrafts.get(key)?.form.remove();stateDrafts.delete(key);}
   setUnsaved();
  }catch{for(const form of forms){const draft=drafts.get(formKey(form));if(draft){draft.message=saved?'保存已成功，列表更新失败，请刷新查看。':'连接失败，整批输入已保留，可重试。';sync(draft);}}}
  finally{for(const form of forms){const draft=drafts.get(formKey(form));if(draft){draft.busy=false;sync(draft);}}const count=document.querySelectorAll('#daily-table [data-review-container="ready"] [data-metric-form]').length;batch.disabled=!count;batch.textContent=`一键保存 (${count})`;}
 });}
 if(batch&&![...drafts.values()].some(d=>d.busy)){const count=document.querySelectorAll('#daily-table [data-review-container="ready"] [data-metric-form]').length;batch.textContent=`一键保存 (${count})`;batch.disabled=!count;}

 for(const form of document.querySelectorAll<HTMLFormElement>('[data-metric-form]:not([data-reclaim-ready])')){
  form.dataset.reclaimReady='true';
  form.addEventListener('business:edit-reclaimed',event=>(event as CustomEvent).detail.waitUntil((async()=>{
   if(form.dataset.dirty==='true')return;
   await refreshPromotionSchedule(form.dataset.scheduleId!);
  })()));
 }
 // 内容列依据实际字体测量，同时限制最大宽度，所有行使用相同锚点。
 const host=document.querySelector<HTMLElement>('[data-promotion-pending-body]');
 const measureNames=()=>{if(host?.isConnected){const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');if(ctx){let width=112;for(const name of host.querySelectorAll<HTMLElement>('.review-entry-identity strong')){ctx.font=getComputedStyle(name).font;width=Math.max(width,Math.ceil(ctx.measureText(name.textContent??'').width)+16);}host.style.setProperty('--review-name-width',`${Math.min(176,Math.max(112,host.clientWidth-1112),width)}px`);}}};measureNames();void document.fonts.ready.then(measureNames);if(host&&!host.dataset.nameMeasureReady){host.dataset.nameMeasureReady='true';const observer=new ResizeObserver(measureNames);observer.observe(host);document.addEventListener('astro:before-swap',()=>observer.disconnect(),{once:true});}
 document.querySelectorAll<HTMLFormElement>('[data-history-mode-form]:not([data-ready])').forEach(form=>{form.dataset.ready='true';form.addEventListener('change',()=>form.requestSubmit());});
}

document.addEventListener('astro:page-load',initialize);
document.addEventListener('business:promotion-fragment-updated',initialize);

// 真正离开视图时清理草稿；局部刷新与详情选择不会触发页面交换。
document.addEventListener('astro:before-swap',()=>documents.delete(document));

function focusRequestedReview(){const id=new URL(location.href).searchParams.get('focus');if(!id)return;const row=document.querySelector<HTMLElement>(`#daily-table [data-schedule-id="${CSS.escape(id)}"]`);if(row){row.scrollIntoView({block:'center'});row.querySelector<HTMLInputElement>('input:not([type=hidden]):not(:disabled)')?.focus({preventScroll:true});}}
document.addEventListener('astro:page-load',focusRequestedReview);focusRequestedReview();
