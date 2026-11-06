import {businessConfirm} from './business-dialog';
import {businessDate,businessDateTime} from './business-date';
import {weekOf} from '../db/monthly-plan-types';
import {readBusiness} from './business-read';
function initialize(){
 const panel=document.querySelector<HTMLElement>('[data-arrangement-stage]');if(!panel||panel.dataset.ready)return;panel.dataset.ready='true';
 const editable=panel.dataset.arrangementStage!=='closed';
 if(!editable){
  for(const button of document.querySelectorAll<HTMLButtonElement>('[data-open-new],[data-calendar-new]')){button.disabled=true;button.title=panel.querySelector('.arrangement-heading>p')?.textContent??'';}
 }
 const form=panel.querySelector<HTMLFormElement>('[data-arrangement-form]');
 form?.querySelector('[data-arrangement-refresh]')?.addEventListener('click',async()=>{
  if(form.dataset.busy||form.dataset.reading)return;
  const output=form.querySelector<HTMLOutputElement>('[data-arrangement-message]')!,buttons=[...form.querySelectorAll<HTMLButtonElement>('button')];
  form.dataset.reading='true';buttons.forEach(b=>b.disabled=true);output.textContent='';delete output.dataset.error;
  try{
   const result=await readBusiness(panel.querySelector<HTMLElement>('.arrangement-review')!,async read=>{const response=await fetch('/api/monthly-plans/'+form.dataset.planId+'/arrangement',{signal:read.signal}),result=await response.json();if(!response.ok)throw new Error(result.message);return result;},{label:'正在读取核对清单…'});if(!result)return;
   if(result.stage!==panel.dataset.arrangementStage)throw new Error('本月核对阶段已变化，请重新打开本月页面。当前说明已保留。');
   const body=panel.querySelector('[data-arrangement-details] tbody')!;body.replaceChildren();
   for(const row of result.rows){const tr=document.createElement('tr');for(const value of ['Week '+weekOf(businessDate(row.plannedAt)),row.name+' · V'+row.versionNumber,row.subjectName+'／'+(row.categoryName??'未分类'),businessDateTime(row.plannedAt),row.actualAt?businessDateTime(row.actualAt):'尚未发布']){const td=document.createElement('td');td.textContent=String(value);tr.append(td);}body.append(tr);}
   panel.querySelectorAll('[data-arrangement-count]').forEach(n=>n.textContent=String(result.rows.length));
   panel.querySelectorAll('[data-arrangement-planned]').forEach(n=>n.textContent=String(result.preplanned));
   panel.querySelectorAll<HTMLElement>('[data-arrangement-week-count]').forEach(n=>n.textContent=String(result.rows.filter((row:{plannedAt:string})=>weekOf(businessDate(row.plannedAt))===Number(n.dataset.arrangementWeekCount)).length));
   form.dataset.fingerprint=result.fingerprint;form.querySelector<HTMLButtonElement>('[data-arrangement-refresh]')!.hidden=true;panel.querySelector<HTMLDetailsElement>('[data-arrangement-details]')!.open=true;output.textContent='核对清单已更新，请查看后再定稿。';
  }catch(error){output.textContent=(error as Error).message;output.dataset.error='true';}finally{delete form.dataset.reading;buttons.forEach(b=>b.disabled=false);}
 });
 form?.addEventListener('input',()=>{form.dataset.dirty='true';document.documentElement.dataset.unsaved='true';});
 form?.addEventListener('submit',async event=>{
  event.preventDefault();if(form.dataset.busy||form.dataset.reading)return;
  const action=(event.submitter as HTMLButtonElement)?.value;if(!action||action!=='draft'&&!form.reportValidity())return;
  if(action==='return'&&!(form.elements.namedItem('reason') as HTMLInputElement).value.trim()){const output=form.querySelector<HTMLOutputElement>('[data-arrangement-message]')!;output.textContent='请填写退回修改的原因。';output.dataset.error='true';(form.elements.namedItem('reason') as HTMLInputElement).focus();return;}
  const message=action==='submit'?'提交管理员核对，定稿前仍可继续编辑本月排期。':action==='confirm'?'确认后，整场月例会及计划永久封存，不再允许修改。后续日常调整只记录在排期页。':'退回后，员工可以继续修改首轮排期，完成后需重新提交核对。';
  if(action!=='draft'&&!await businessConfirm(message,{title:action==='confirm'?'定稿并封存':action==='submit'?'提交首轮排期核对':'退回修改',confirmLabel:'确认',cancelLabel:'继续核对'}))return;
  const output=form.querySelector<HTMLOutputElement>('[data-arrangement-message]')!;const buttons=[...form.querySelectorAll<HTMLButtonElement>('button')];form.dataset.busy='true';buttons.forEach(b=>b.disabled=true);delete output.dataset.error;output.textContent='正在保存…';const reason=(form.elements.namedItem('reason') as HTMLInputElement).value;
  try{
   const response=await fetch('/api/monthly-plans/'+form.dataset.planId+'/arrangement',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,fingerprint:form.dataset.fingerprint,requestId:crypto.randomUUID(),reason})}),result=await response.json();
   if(!response.ok){if(result.code==='ARRANGEMENT_CHANGED')form.querySelector<HTMLButtonElement>('[data-arrangement-refresh]')!.hidden=false;throw new Error(result.message||'保存失败，请重试。');}
   if(action==='draft'){output.textContent='草稿已保存，可以继续排期。';if((form.elements.namedItem('reason') as HTMLInputElement).value===reason){form.dataset.dirty='false';document.documentElement.dataset.unsaved=String(!!document.querySelector('form[data-dirty=true]'));}}else{document.documentElement.dataset.unsaved='false';location.reload();}
  }catch(error){output.textContent=(error as Error).message;output.dataset.error='true';}finally{delete form.dataset.busy;buttons.forEach(b=>b.disabled=false);}
 });
 function bindCalendar(){
 const pool=document.querySelector<HTMLElement>('[data-monthly-plan-pool]');
 const selectSource=(id:string)=>{if(pool){pool.dataset.selectedItem=id;delete pool.dataset.scheduleId;}document.dispatchEvent(new CustomEvent('business:monthly-link-source',{detail:{itemId:id}}));};
 for(const button of document.querySelectorAll<HTMLButtonElement>('[data-monthly-plan-source]')){
  if(button.dataset.arrangementBound)continue;button.dataset.arrangementBound='true';
  button.addEventListener('click',()=>{if(button.disabled)return;selectSource(button.dataset.monthlyPlanSource!);for(const chip of document.querySelectorAll('[data-monthly-plan-source]'))chip.setAttribute('aria-pressed',String(chip===button));});
  button.addEventListener('dragstart',event=>{if(button.disabled)return;event.dataTransfer?.setData('application/x-qiuyun-plan',button.dataset.monthlyPlanSource!);});
 }
 if(editable)for(const card of document.querySelectorAll<HTMLElement>('.calendar-item[data-inspect-id]')){if(card.dataset.arrangementBound)continue;card.dataset.arrangementBound='true';card.draggable=true;card.addEventListener('dragstart',event=>{event.dataTransfer?.setData('application/x-qiuyun-schedule',card.dataset.inspectId!);});}
 if(editable)for(const day of document.querySelectorAll<HTMLElement>('[data-calendar-day]')){
  if(day.dataset.arrangementBound)continue;day.dataset.arrangementBound='true';
  day.addEventListener('dragover',event=>{if(event.dataTransfer?.types.some(type=>['application/x-qiuyun-schedule','application/x-qiuyun-plan'].includes(type)))event.preventDefault();});
  day.addEventListener('drop',event=>{const scheduleId=event.dataTransfer?.getData('application/x-qiuyun-schedule'),planItem=event.dataTransfer?.getData('application/x-qiuyun-plan');if(!scheduleId&&!planItem)return;event.preventDefault();if(planItem){selectSource(planItem);day.querySelector<HTMLButtonElement>('[data-calendar-new]')?.click();return;}document.dispatchEvent(new CustomEvent('business:monthly-schedule-switch',{detail:{scheduleId,date:day.dataset.calendarDay,cancel:()=>{}}}));});
 }
 }
 bindCalendar();
 const refreshed=()=>bindCalendar();
 document.addEventListener('business:schedule-range-updated',refreshed);
 document.addEventListener('astro:before-swap',()=>document.removeEventListener('business:schedule-range-updated',refreshed),{once:true});

}
initialize();document.addEventListener('astro:page-load',initialize);
