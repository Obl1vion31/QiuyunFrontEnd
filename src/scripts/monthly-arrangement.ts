import {businessConfirm} from './business-dialog';
import {businessDateTime} from './business-date';
function initialize(){
 const panel=document.querySelector<HTMLElement>('[data-arrangement-stage]');if(!panel||panel.dataset.ready)return;panel.dataset.ready='true';
 const editable=panel.dataset.arrangementStage==='editing'||panel.dataset.arrangementStage==='confirmed'||panel.dataset.arrangementStage==='review_pending'&&panel.dataset.arrangementRole==='admin';
 const pool=document.querySelector<HTMLElement>('[data-monthly-plan-pool]');
 const selectSource=(id:string)=>{if(pool){pool.dataset.selectedItem=id;delete pool.dataset.scheduleId;}document.dispatchEvent(new CustomEvent('business:monthly-link-source',{detail:{itemId:id}}));};
 for(const button of document.querySelectorAll<HTMLButtonElement>('[data-monthly-plan-source]')){
  button.addEventListener('click',()=>{if(button.disabled)return;selectSource(button.dataset.monthlyPlanSource!);for(const chip of document.querySelectorAll('[data-monthly-plan-source]'))chip.setAttribute('aria-pressed',String(chip===button));});
  button.addEventListener('dragstart',event=>{if(button.disabled)return;event.dataTransfer?.setData('application/x-qiuyun-plan',button.dataset.monthlyPlanSource!);});
 }
 if(!editable){
  for(const button of document.querySelectorAll<HTMLButtonElement>('[data-open-new],[data-calendar-new]')){button.disabled=true;button.title=panel.querySelector('p')?.textContent??'';}
 }
 const form=panel.querySelector<HTMLFormElement>('[data-arrangement-form]');
 form?.querySelector('[data-arrangement-refresh]')?.addEventListener('click',async()=>{
  if(form.dataset.busy)return;const output=form.querySelector<HTMLOutputElement>('[data-arrangement-message]')!;
  try{const response=await fetch('/api/monthly-plans/'+form.dataset.planId+'/arrangement'),result=await response.json();if(!response.ok)throw new Error(result.message);if(result.stage!==panel.dataset.arrangementStage)throw new Error('本月核对阶段已变化，请重新打开本月页面。当前说明已保留。');
   const body=panel.querySelector('tbody')!;body.replaceChildren();
   for(const row of result.rows){const tr=document.createElement('tr');for(const value of [Math.ceil(Number(new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',day:'2-digit'}).format(new Date(row.plannedAt)))/7),row.name+' · V'+row.versionNumber,row.subjectName+'／'+(row.categoryName??'未分类'),businessDateTime(row.plannedAt),row.actualAt?businessDateTime(row.actualAt):'尚未发布']){const td=document.createElement('td');td.textContent=String(value);tr.append(td);}body.append(tr);}
   form.dataset.fingerprint=result.fingerprint;panel.querySelector<HTMLDetailsElement>('[data-arrangement-details]')!.open=true;output.textContent='核对清单已更新，请查看后再提交。';
  }catch(error){output.textContent=(error as Error).message;}
 });
 form?.addEventListener('input',()=>{document.documentElement.dataset.unsaved='true';});
 form?.addEventListener('submit',async event=>{
  event.preventDefault();if(form.dataset.busy||!form.reportValidity())return;
  const action=(event.submitter as HTMLButtonElement)?.value;if(!action)return;
  const message=action==='submit'?'提交后，本月员工仅能登记实发，不能新增、取消或调整排期。请确认首轮排期已经排好。':action==='confirm'?'确认后，整场月例会及计划永久封存，不再允许修改。后续日常调整只记录在排期页。':'退回后，员工可以继续修改首轮排期，完成后需重新提交核对。';
  if(!await businessConfirm(message,{title:action==='confirm'?'核对通过并封存':action==='submit'?'提交首轮排期核对':'退回修改',confirmLabel:'确认',cancelLabel:'继续核对'}))return;
  const output=form.querySelector<HTMLOutputElement>('[data-arrangement-message]')!;const buttons=[...form.querySelectorAll<HTMLButtonElement>('button')];form.dataset.busy='true';buttons.forEach(b=>b.disabled=true);output.textContent='正在保存…';
  try{
   const response=await fetch('/api/monthly-plans/'+form.dataset.planId+'/arrangement',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,fingerprint:form.dataset.fingerprint,requestId:crypto.randomUUID(),reason:(form.elements.namedItem('reason') as HTMLInputElement).value})}),result=await response.json();
   if(!response.ok)throw new Error(result.message||'保存失败，请重试。');
   document.documentElement.dataset.unsaved='false';location.reload();
  }catch(error){output.textContent=(error as Error).message;}finally{delete form.dataset.busy;buttons.forEach(b=>b.disabled=false);}
 });
 if(editable)for(const card of document.querySelectorAll<HTMLElement>('.calendar-item[data-inspect-id]')){card.draggable=true;card.addEventListener('dragstart',event=>{event.dataTransfer?.setData('application/x-qiuyun-schedule',card.dataset.inspectId!);});}
 if(editable)for(const day of document.querySelectorAll<HTMLElement>('[data-calendar-day]')){
  day.addEventListener('dragover',event=>{if(event.dataTransfer?.types.some(type=>['application/x-qiuyun-schedule','application/x-qiuyun-plan'].includes(type)))event.preventDefault();});
  day.addEventListener('drop',event=>{const scheduleId=event.dataTransfer?.getData('application/x-qiuyun-schedule'),planItem=event.dataTransfer?.getData('application/x-qiuyun-plan');if(!scheduleId&&!planItem)return;event.preventDefault();if(planItem){selectSource(planItem);day.querySelector<HTMLButtonElement>('[data-calendar-new]')?.click();return;}document.dispatchEvent(new CustomEvent('business:monthly-schedule-switch',{detail:{scheduleId,date:day.dataset.calendarDay,cancel:()=>{}}}));});
 }
}
initialize();document.addEventListener('astro:page-load',initialize);
