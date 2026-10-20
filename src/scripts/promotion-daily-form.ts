import {getInspector} from './business-inspector';
import {randomRequestKey,refreshPromotionSchedule} from './promotion-timeline';

type Values=Record<string,string>;
type Draft={values:Values;dirty:boolean;busy:boolean;message:string;requestKey:string;views:Set<HTMLFormElement>};
const documents=new WeakMap<Document,Map<string,Draft>>();
const fields=(form:HTMLFormElement)=>[...form.querySelectorAll<HTMLInputElement|HTMLSelectElement>('input[name],select[name]')];
const values=(form:HTMLFormElement):Values=>Object.fromEntries(fields(form).map(field=>[field.name,field.value]));
const formKey=(form:HTMLFormElement)=>`${form.dataset.scheduleId}:${(form.elements.namedItem('metricDate') as HTMLInputElement).value}`;
const cost=(spend:number,count:number)=>count>0?`¥${(spend/count).toFixed(2)}`:'—';
function initialize(){
 const pane=document.querySelector<HTMLElement>('[data-promotion-inspector][data-inspector-overlay]');
 const drafts=documents.get(document)??new Map<string,Draft>();documents.set(document,drafts);
 const render=(form:HTMLFormElement,draft:Draft)=>{
  for(const field of fields(form))if(field.name in draft.values)field.value=draft.values[field.name];
  const paused=draft.values.dayAction==='pause';
  for(const name of ['spend','platformOpenCount','actualOpenCount','platformLeadCount','actualLeadCount','platformNoteId','reviewDecision']){const field=form.elements.namedItem(name) as HTMLInputElement|null;if(field){field.disabled=paused;field.required=!paused;}}
  for(const selector of ['[data-active-fields]','[data-active-costs]','[data-active-id]','[data-active-decision]']){const node=form.querySelector<HTMLElement>(selector);if(node)node.hidden=paused;}
  const empty=form.querySelector<HTMLElement>('[data-paused-note-id]');if(empty)empty.hidden=!paused;
  const pause=form.querySelector<HTMLElement>('[data-pause-fields]')!;pause.hidden=!paused;
  pause.querySelectorAll<HTMLInputElement>('input').forEach(field=>{field.disabled=!paused;field.required=paused;});
  const label=form.querySelector<HTMLElement>('[data-day-status]')!;label.textContent=paused?'当日暂停（待保存）':label.dataset.defaultLabel!;label.classList.toggle('is-draft',paused);
  form.querySelector<HTMLOutputElement>('[data-open-cost]')!.textContent=cost(Number(draft.values.spend),Number(draft.values.actualOpenCount));
  form.querySelector<HTMLOutputElement>('[data-lead-cost]')!.textContent=cost(Number(draft.values.spend),Number(draft.values.actualLeadCount));
  const button=form.querySelector<HTMLButtonElement>('[type=submit]')!;button.disabled=draft.busy;button.textContent=paused?'保存当日暂停':'完成复盘';
  form.querySelector<HTMLElement>('[data-form-message]')!.textContent=draft.message;
  form.dataset.dirty=String(draft.dirty);
 };
 const sync=(draft:Draft)=>{for(const form of draft.views){if(!form.isConnected){draft.views.delete(form);continue;}render(form,draft);}};
 const bind=(form:HTMLFormElement)=>{
  if(form.dataset.dailyReady)return;form.dataset.dailyReady='true';
  const key=formKey(form);let draft=drafts.get(key);
  if(!draft){draft={values:values(form),dirty:false,busy:false,message:'',requestKey:randomRequestKey(),views:new Set()};drafts.set(key,draft);}
  const state=draft;state.views.add(form);render(form,state);
  const editor=form.querySelector<HTMLElement>('[data-day-editor]')!,trigger=form.querySelector<HTMLButtonElement>('[data-toggle-day-state]')!;
  trigger.addEventListener('click',()=>{editor.hidden=!editor.hidden;trigger.setAttribute('aria-expanded',String(!editor.hidden));if(!editor.hidden)editor.querySelector('select')?.focus({preventScroll:true});});
  editor.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();editor.hidden=true;trigger.setAttribute('aria-expanded','false');trigger.focus({preventScroll:true});}});
  const changed=()=>{state.values=values(form);state.dirty=true;state.message='';document.documentElement.dataset.unsaved='true';sync(state);};
  form.addEventListener('input',changed);form.addEventListener('change',changed);
  form.addEventListener('submit',async event=>{
   event.preventDefault();if(state.busy)return;
   const paused=state.values.dayAction==='pause';
   const note=form.querySelector<HTMLInputElement>('[data-note-id-required]');
   if(note&&!paused&&!/^[0-9a-fA-F]{24}$/.test(note.value.trim())){state.message='笔记 ID 必须是 24 位十六进制字符。';sync(state);note.focus();return;}
   state.busy=true;state.message='正在保存…';sync(state);
   try{
    const data=new FormData(form),response=await fetch(paused?'/api/promotion-timeline':'/api/promotion-daily',{method:'POST',body:paused?JSON.stringify({scheduleId:form.dataset.scheduleId,reviewDate:data.get('metricDate'),action:'pause',waitingThrough:data.get('pauseThrough'),reason:data.get('pauseReason'),requestKey:state.requestKey,fingerprint:form.dataset.fingerprint}):data,headers:paused?{'Content-Type':'application/json'}:{Accept:'application/json'}});
    const result=await response.json();if(!response.ok){state.message=result.message??'保存失败，请重试。';return;}
    state.dirty=false;state.message='';sync(state);
    const controller=pane?getInspector(pane):null,wasPending=controller?.selected?.startsWith(`review:${form.dataset.scheduleId}:`);
    if(wasPending)controller!.setClean();
    try{await refreshPromotionSchedule(form.dataset.scheduleId!);}catch{state.message='保存已成功，列表刷新失败，请刷新页面查看。';return;}
    drafts.delete(key);
    if(wasPending&&pane){controller!.setClean();if(result.id&&!paused)controller!.open(result.id,null,true);else {const template=document.querySelector<HTMLTemplateElement>(`template[data-history-schedule="${CSS.escape(form.dataset.scheduleId!)}"]`);if(template)controller!.open(template.dataset.inspectorTemplate!,null,true);}}
    document.documentElement.dataset.unsaved=String(!!document.querySelector('form[data-dirty=true]'));
   }catch{state.message='无法连接服务，请稍后重试。';}finally{state.busy=false;sync(state);}
  });
 };
 document.querySelectorAll<HTMLFormElement>('[data-metric-form]').forEach(bind);
 document.querySelectorAll<HTMLFormElement>('[data-history-mode-form]:not([data-ready])').forEach(form=>{form.dataset.ready='true';form.addEventListener('change',()=>form.requestSubmit());});
 if(!pane)return;
 // 公共模板负责开合，业务适配器仅提供同一草稿的另一份视图。
 document.querySelectorAll<HTMLAnchorElement>('#daily-table [data-pending-inspector]').forEach(link=>{
  const source=document.querySelector<HTMLTemplateElement>(`template[data-history-schedule="${CSS.escape(link.dataset.pendingInspector!)}"]`);if(!source)return;
  const key=new URL(link.href).searchParams.get('campaign')!;link.dataset.inspectorKey=key;
  document.querySelector<HTMLTemplateElement>(`template[data-inspector-template="${CSS.escape(key)}"]`)?.remove();
  const template=document.createElement('template');template.dataset.inspectorTemplate=key;template.dataset.pendingTemplate='';template.content.append(source.content.cloneNode(true));
  const detail=template.content.querySelector('.promotion-detail')!;
  detail.querySelector('.promotion-detail-meta:not(.promotion-references)')?.remove();
  const slot=document.createElement('section');slot.dataset.pendingReviewPane='';slot.dataset.sourceSchedule=link.dataset.pendingInspector!;slot.dataset.sourceRecord=key.slice('review:'.length);
  slot.setAttribute('aria-label','当前复盘');detail.querySelector('.promotion-references')!.after(slot);
  pane.parentElement!.append(template);
 });
 if(pane.dataset.pendingAdapter){const controller=getInspector(pane);if(controller.selected?.startsWith('review:')&&pane.dataset.dirty!=='true')controller.refresh();return;}pane.dataset.pendingAdapter='true';
 let restore:(()=>void)|undefined;
 const listeners=new AbortController();document.addEventListener('astro:before-swap',()=>listeners.abort(),{once:true});
 document.addEventListener('business:promotion-arrangement-saving',event=>{const {scheduleId}=(event as CustomEvent).detail;if(getInspector(pane).selected?.startsWith(`review:${scheduleId}:`))getInspector(pane).setClean();},{signal:listeners.signal});
 document.addEventListener('business:promotion-arrangement-saved',event=>{const {scheduleId}=(event as CustomEvent).detail;const controller=getInspector(pane);if(!controller.selected?.startsWith(`review:${scheduleId}:`))return;const template=document.querySelector<HTMLTemplateElement>(`template[data-history-schedule="${CSS.escape(scheduleId)}"]`);if(template){controller.setClean();controller.open(template.dataset.inspectorTemplate!,null,true);}},{signal:listeners.signal});
 getInspector(pane).configure({discard:()=>restore?.()});
 pane.addEventListener('business:inspector-render',()=>{
  restore=undefined;
  const slot=pane.querySelector<HTMLElement>('[data-pending-review-pane]');if(!slot)return;
  const source=document.querySelector<HTMLElement>(`#daily-table [data-pending-record="${CSS.escape(slot.dataset.sourceRecord!)}"]`);if(!source)return;
  const clone=source.cloneNode(true) as HTMLElement;
  for(const node of [clone,...clone.querySelectorAll<HTMLElement>('*')]){
   for(const attr of [...node.attributes])if(attr.name.endsWith('-ready')||attr.name==='data-dirty')node.removeAttribute(attr.name);
   if(node.id){const previous=node.id;node.id+='-inspector';clone.querySelectorAll<HTMLElement>(`[for="${CSS.escape(previous)}"],[aria-controls="${CSS.escape(previous)}"]`).forEach(label=>{if(label.hasAttribute('for'))label.setAttribute('for',node.id);else label.setAttribute('aria-controls',node.id);});}
  }
  clone.querySelector('.review-entry-identity')?.remove();
  clone.querySelector('.review-version')?.remove();
  slot.append(clone);
  if(clone instanceof HTMLFormElement){
   const draft=drafts.get(formKey(source as HTMLFormElement))!,snapshot={...draft.values},wasDirty=draft.dirty;
   bind(clone);restore=()=>{draft.values=snapshot;draft.dirty=wasDirty;draft.message='';sync(draft);};
  }else{
   // 安排表单委托原控制器提交，保留校验及历史影响保护。
   const originals=[...source.querySelectorAll<HTMLFormElement>('form')],copies=[...clone.querySelectorAll<HTMLFormElement>('form')];
   const snapshots=originals.map(form=>({form,values:values(form),start:form.querySelector<HTMLInputElement>('[data-edit-start]')?.value,dirty:form.dataset.dirty}));
   restore=()=>snapshots.forEach(snapshot=>{for(const field of fields(snapshot.form))field.value=snapshot.values[field.name]??'';const start=snapshot.form.querySelector<HTMLInputElement>('[data-edit-start]');if(start&&snapshot.start)start.value=snapshot.start;snapshot.form.dispatchEvent(new Event('change',{bubbles:true}));snapshot.form.dataset.dirty=snapshot.dirty??'false';});
   copies.forEach((copy,index)=>{copy.dataset.timelineMirror='';
    const original=originals[index];for(const field of fields(copy)){const live=original.elements.namedItem(field.name) as HTMLInputElement|null;if(live)field.value=live.value;}
    for(const type of ['input','change'])copy.addEventListener(type,()=>{fields(copy).forEach((field,fieldIndex)=>{const live=fields(original)[fieldIndex];if(live)live.value=field.value;});const actual=copy.querySelector<HTMLInputElement>('[data-edit-start]'),liveActual=original.querySelector<HTMLInputElement>('[data-edit-start]');if(actual&&liveActual)liveActual.value=actual.value;original.dispatchEvent(new Event(type,{bubbles:true}));});
    copy.addEventListener('submit',event=>{event.preventDefault();original.requestSubmit();});
    const observer=new MutationObserver(()=>{const output=copy.querySelector('output'),feedback=original.querySelector('output');if(output&&feedback)output.textContent=feedback.textContent;const button=copy.querySelector<HTMLButtonElement>('[type=submit]'),live=original.querySelector<HTMLButtonElement>('[type=submit]');if(button&&live)button.disabled=live.disabled;});observer.observe(original,{subtree:true,childList:true,attributes:true});
    pane.addEventListener('business:inspector-render',()=>observer.disconnect(),{once:true});
   });
   // 镜像模式复用条件字段与开合，不绑定第二份保存。
   document.dispatchEvent(new Event('business:promotion-mirror-ready'));

  }
 });
 document.dispatchEvent(new Event('business:inspector-refresh'));
 const requested=new URL(location.href).searchParams.get('campaign');if(requested?.startsWith('review:'))getInspector(pane).refresh();
}
document.addEventListener('astro:page-load',initialize);
document.addEventListener('business:promotion-fragment-updated',initialize);

// 真正离开视图时清理草稿；局部刷新与详情选择不会触发页面交换。
document.addEventListener('astro:before-swap',()=>documents.delete(document));
