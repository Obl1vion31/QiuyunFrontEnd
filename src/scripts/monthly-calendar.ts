import {scheduleReasonRequired} from '../db/schedule-plan-policy';
import type {MonthlyCalendarView as MonthlyPlanView} from '../db/monthly-plan-links';
import {readBusiness} from './business-read';
import {weekOf} from '../db/monthly-plan-types';
function initialize(){
 const form=document.querySelector<HTMLFormElement>('#schedule-form'),data=document.querySelector('[data-monthly-calendar-plan]');if(!form||!data||form.dataset.monthlyInitialized)return;form.dataset.monthlyInitialized='true';
 let calendarPlan:MonthlyPlanView|null=JSON.parse(data.textContent||'null');let plan=calendarPlan,selected='',lastSource='',mode='',recordId='',openSequence=0,confirmedDay='',readError='',sourceTouched=false;
 let pool=document.querySelector<HTMLElement>('[data-monthly-plan-pool]'),section=form.querySelector<HTMLElement>('[data-monthly-schedule-fields]')!,source=section.querySelector<HTMLSelectElement>('[data-monthly-source]')!,description=section.querySelector<HTMLElement>('[data-monthly-source-description]')!,occupancy=section.querySelector<HTMLElement>('[data-monthly-occupancy]')!;
 const control=(name:string)=>form.elements.namedItem(name) as HTMLInputElement;
 const rows=JSON.parse(document.querySelector('[data-schedule-records]')?.textContent||'[]') as Array<{id:string;contentName:string;plannedPublishAt:string;subjectId:string;categoryId:string}>;
 const cancelSelection=(event:Event)=>{if(!pool||!(event.target as Element).closest('[data-monthly-cancel]'))return;selected='';delete pool.dataset.selectedItem;delete pool.dataset.scheduleId;pool.querySelector<HTMLElement>('[data-monthly-selection]')!.hidden=true;pool.querySelector<HTMLElement>('[data-monthly-cancel]')!.hidden=true;pool.querySelectorAll('[data-monthly-plan-source]').forEach(b=>b.setAttribute('aria-pressed','false'));document.querySelectorAll('[data-monthly-week-match]').forEach(n=>n.removeAttribute('data-monthly-week-match'));};document.addEventListener('click',cancelSelection);
 function updateSource(fill=false){const item=plan?.items.find(i=>i.id===source.value);control('monthlyPlanId').value=item?plan?.id??'':'';control('monthlyExpectedRevision').value=String(plan?.revision??'');control('monthlyPlanItemId').value=item?.id??'';
  const day=control('plannedPublishDate').value,cross=!!item&&!!day&&(day.slice(0,7)!==plan!.month||weekOf(day)!==item.week),additional=source.value==='addition';
  const sealed=plan?.arrangementStatus==='confirmed'||form!.dataset.reasonRequired==='true',changedDate=!!recordId&&control('plannedPublishAt').value!==rows.find(r=>r.id===recordId)?.plannedPublishAt;
  const related=item??plan?.items.find(i=>i.schedule?.id===recordId||i.scheduleId===recordId);
  const needsReason=scheduleReasonRequired(!!sealed,related?plan!.month:null,related?.week??null,day);
  const reasonField=section.closest("form")!.querySelector<HTMLElement>('[data-plan-change-reason]');
  const editCross=mode==='edit'&&changedDate&&!sealed&&!!needsReason;
  if(reasonField){reasonField.hidden=!editCross;control('planChangeReason').required=editCross;}
  control('changeReason').required=!!sealed;
  control('changeReason').closest<HTMLElement>('[data-schedule-change-reason]')!.hidden=!sealed;
  control('monthlyPlanReason').closest<HTMLElement>('.field')!.hidden=sealed||editCross||!(cross||control('monthlyPlanReason').value.trim());
  control('monthlyPlanReason').required=!sealed&&cross&&!editCross;
  description.textContent=readError||(item?(cross?'原定Week '+item.week+'，当前选择跨Week，请填写原因。':''):additional?'':'');
  if(fill&&item){control('subjectId').value=item.group.subjectId;control('subjectId').dispatchEvent(new Event('change',{bubbles:true}));control('categoryId').value=item.group.categoryId;control('categoryId').dispatchEvent(new Event('change',{bubbles:true}));}
  const sameDay=rows.filter(r=>r.id!==recordId&&r.plannedPublishAt.slice(0,10)===day);occupancy.textContent=sameDay.length?`当天已排 ${sameDay.length} 篇：${sameDay.map(r=>`${r.plannedPublishAt.slice(11,16)} ${r.contentName}`).join('；')}`:'';
 }
 const rebaseSource=()=>{if(!sourceTouched)form.dispatchEvent(new CustomEvent('business:form-rebase',{detail:{fields:['monthlyPlanId','monthlyPlanItemId']}}));};
 function populate(current:MonthlyPlanView|null,preserve=false){const previous=source.value,requestId=control('monthlyRequestId').value;plan=current;control('changeReason').required=plan?.arrangementStatus==='confirmed';section.hidden=!plan?.firstFinalizedAt||plan.arrangementStatus==='confirmed'||mode==='revision';for(const name of ['monthlyPlanId','monthlyPlanItemId','monthlyRequestId','monthlyExpectedRevision','monthlyPlanReason'])control(name).disabled=section.hidden;source.disabled=section.hidden;source.required=false;if(section.hidden){updateSource();rebaseSource();return;}
  control('monthlyRequestId').value=preserve&&requestId?requestId:crypto.randomUUID();source.replaceChildren(new Option('暂不关联，随首轮排期交管理员核对',''));source.required=false;
  const related=plan!.items.find(i=>i.schedule?.id===recordId||i.scheduleId===recordId);for(const item of plan!.items.filter(i=>!i.pending&&!plan!.linkGroups.some(g=>g.groupId===i.groupId&&g.week===i.week&&g.pending)&&(i.status==='unassigned'||i.status==='rejected'||i.id===related?.id)))source.add(new Option(`${item.group.name} · ${item.ordinal} · Week ${item.week} · ${item.addition?'追加名额':'原名额'}`,item.id));source.add(new Option('计划外新增','addition'));source.value=related?.id??(preserve?previous:mode==='new'?selected:'');source.disabled=!!related;lastSource=source.value;updateSource(!preserve&&mode==='new'&&!!source.value);rebaseSource();
 }
 const retry=section.querySelector<HTMLButtonElement>('[data-monthly-source-retry]')!;
 let sourceMonth='',sourceRequest:AbortController|undefined;
 const refreshMonth=async(force=false)=>{
  const month=control('plannedPublishDate').value.slice(0,7);if(mode==='revision'||!/^\d{4}-\d{2}$/.test(month)||!force&&month===sourceMonth)return;
  sourceMonth=month;const seq=++openSequence;sourceRequest?.abort();sourceRequest=new AbortController();retry.hidden=true;readError='';
  const query=mode==='new'?'month='+month:recordId?'schedule='+recordId:'month='+month;
  try{const result=await readBusiness(section,async read=>{const r=await fetch('/api/monthly-plans?'+query,{signal:read.signal}),result=await r.json();if(!r.ok)throw new Error(result.message);return result;},{signal:sourceRequest.signal,label:'正在读取计划来源…',isCurrent:()=>seq===openSequence});if(result)populate(result.plan,true);}
  catch{if(seq!==openSequence)return;section.hidden=false;readError='计划来源读取失败，当前输入已保留。';description.textContent=readError;retry.hidden=false;}
 };
 const ranged=(event:Event)=>{const detail=(event as CustomEvent).detail;calendarPlan=detail.plan;rows.splice(0,rows.length,...detail.rows);pool=document.querySelector<HTMLElement>('[data-monthly-plan-pool]');selected='';};
 document.addEventListener('business:schedule-range-updated',ranged);
 const updated=(event:Event)=>{calendarPlan=(event as CustomEvent).detail.plan;};
 const picked=(event:Event)=>{
  selected=(event as CustomEvent).detail.itemId;const item=calendarPlan?.items.find(i=>i.id===selected);if(!pool||!item)return;
  pool.dataset.selectedItem=selected;pool.dataset.scheduleId=item.kind==='new'?'':item.schedule?.id??item.scheduleId??'';
  pool.querySelectorAll<HTMLElement>('[data-monthly-plan-source]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.monthlyPlanSource===selected)));
  const hint=pool.querySelector<HTMLElement>('[data-monthly-selection]')!;hint.hidden=false;hint.textContent=`正在安排：${item.schedule?.name??item.group.name} · Week ${item.week}。请点击日历日期。`;
  pool.querySelector<HTMLElement>('[data-monthly-cancel]')!.hidden=false;
  document.querySelectorAll<HTMLElement>('[data-calendar-day]').forEach(day=>day.toggleAttribute('data-monthly-week-match',weekOf(day.dataset.calendarDay!)===item.week));
 };
 const sourceRequired=()=>{void refreshMonth(true);};
 document.addEventListener('business:monthly-plan-updated',updated);document.addEventListener('business:monthly-link-source',picked);form.addEventListener('business:monthly-source-required',sourceRequired);
 form.addEventListener('input',()=>{if(mode==='new')void refreshMonth();});
 const opened=(event:Event)=>{const detail=(event as CustomEvent).detail;delete form.dataset.reasonRequired;sourceTouched=false;mode=detail.mode;recordId=detail.record?.id??'';confirmedDay='';sourceMonth='';readError='';retry.hidden=true;++openSequence;sourceRequest?.abort();populate(calendarPlan);if(mode==='new'||recordId&&!plan?.items.some(i=>i.schedule?.id===recordId||i.scheduleId===recordId))void refreshMonth(true);};
 retry.addEventListener('click',()=>void refreshMonth(true));
 document.addEventListener('business:schedule-form-opened',opened);source.addEventListener('change',()=>{sourceTouched=true;const previous=lastSource;lastSource=source.value;const item=plan?.items.find(i=>i.id===source.value);if(mode==='new'&&item?.scheduleId){document.dispatchEvent(new CustomEvent('business:monthly-schedule-switch',{detail:{scheduleId:item.scheduleId,date:control('plannedPublishDate').value,cancel:()=>{source.value=previous;lastSource=previous;updateSource();}}}));return;}updateSource(true);form.dispatchEvent(new Event('input',{bubbles:true}));});form.addEventListener('input',()=>{updateSource();confirmedDay='';});
 const submit=async(event:SubmitEvent)=>{if(mode==='revision'||section.hidden)return;if(readError){event.preventDefault();event.stopImmediatePropagation();retry.focus();return;}if(!form.reportValidity()){event.preventDefault();event.stopImmediatePropagation();return;}const day=control('plannedPublishDate').value,sameDay=rows.filter(r=>r.id!==recordId&&r.plannedPublishAt.slice(0,10)===day);if(!sameDay.length||confirmedDay===day)return;event.preventDefault();event.stopImmediatePropagation();if(!await window.businessConfirm(`${day} 已安排 ${sameDay.length} 篇帖子。请核对当日安排后继续。`,{title:'同日已有帖子',confirmLabel:'确认继续安排',cancelLabel:'返回调整'}))return;confirmedDay=day;form.requestSubmit(event.submitter as HTMLButtonElement|null);};form.addEventListener('submit',submit,true);
 document.addEventListener('astro:before-swap',()=>{sourceRequest?.abort();document.removeEventListener('click',cancelSelection);document.removeEventListener('business:monthly-plan-updated',updated);document.removeEventListener('business:schedule-range-updated',ranged);document.removeEventListener('business:monthly-link-source',picked);form.removeEventListener('business:monthly-source-required',sourceRequired);document.removeEventListener('business:schedule-form-opened',opened);form.removeEventListener('submit',submit,true);},{once:true});
}
initialize();document.addEventListener('astro:page-load',initialize);
