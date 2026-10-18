import {getInspector} from './business-inspector';
function initialize(){
 const pane=document.querySelector<HTMLElement>('[data-schedule-approval-inspector]');
 if(pane&&!pane.dataset.approvalReady){pane.dataset.approvalReady='true';const first=document.querySelector<HTMLElement>('[data-approval-item]');if(first&&!new URL(location.href).searchParams.has('request'))getInspector(pane).open(first.dataset.approvalItem!,first);}
}
document.addEventListener('submit',async event=>{
 const form=event.target as HTMLFormElement;if(!form.matches('[data-schedule-approval]'))return;
 event.preventDefault();const action=(event as SubmitEvent).submitter?.getAttribute('value');if(!action)return;
 const output=form.querySelector<HTMLOutputElement>('output')!,reason=String(new FormData(form).get('reason')??'').trim();
 if(action==='reject'&&!reason){output.textContent='请填写驳回说明。';return;}
 const buttons=[...form.querySelectorAll<HTMLButtonElement>('button')];buttons.forEach(button=>button.disabled=true);output.textContent='正在审核…';
 try{const legacy=form.dataset.scheduleApproval!.includes('/change-requests/');const response=await fetch(form.dataset.scheduleApproval!,{method:'PATCH',headers:legacy?{}:{'Content-Type':'application/json'},body:legacy?new URLSearchParams({action,reason}):JSON.stringify({action,reason})});const result=await response.json();
  if(!response.ok&&result.status!=='obsolete'){output.textContent=result.message??'审核失败，请刷新后核对。';return;}
  output.textContent=result.status==='obsolete'?`已失效：${result.message}`:result.status==='rejected'?'已驳回':result.status==='approved'?'已通过':action==='approve'?'已通过':'已驳回';form.querySelector('.business-action-group')?.setAttribute('hidden','');
  const pane=form.closest<HTMLElement>('[data-inspector]');if(pane)getInspector(pane).setClean();
  const heading=pane?.querySelector('header p');if(heading)heading.textContent=output.textContent;
  const template=document.querySelector<HTMLTemplateElement>(`template[data-inspector-template="${CSS.escape(form.dataset.approvalKey??'')}"]`);
  if(template){template.content.querySelector('form')?.replaceWith(form.cloneNode(true));const status=template.content.querySelector('header p');if(status)status.textContent=output.textContent;}
  const item=document.querySelector<HTMLElement>(`[data-approval-item="${CSS.escape(form.dataset.approvalKey??'')}"]`);if(item){item.dataset.processed='true';const status=item.querySelector('[data-approval-item-status]');if(status)status.textContent=output.textContent;}
  const count=document.querySelector('[data-approval-queue-count]');if(count)count.textContent=String(document.querySelectorAll('[data-approval-item]:not([data-processed])').length);
  document.dispatchEvent(new CustomEvent('business:workflow-updated'));document.dispatchEvent(new CustomEvent('business:schedule-approval-decided',{detail:{id:form.dataset.scheduleId}}));
 }catch{output.textContent='连接失败，输入已保留。';}finally{buttons.forEach(button=>button.disabled=false);}
},true);
document.addEventListener('astro:page-load',initialize);
