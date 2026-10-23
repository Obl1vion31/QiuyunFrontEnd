import {refreshPromotionSchedule} from './promotion-timeline';
document.addEventListener('click',async e=>{
 const button=(e.target as Element).closest<HTMLButtonElement>('[data-save-meeting-change]');
 if(!button||button.disabled)return;
 const host=button.closest<HTMLElement>('[data-meeting-change]')!,out=host.querySelector('output')!;
 const reason=host.querySelector<HTMLTextAreaElement>('[data-meeting-reason]')!.value.trim();
 if(!reason){out.textContent='请填写修改理由。';return;}
 button.disabled=true;
 try{const response=await fetch('/api/meeting-decisions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:host.dataset.decisionId,expectedTargetStatus:host.dataset.expectedTarget,expectedVersionNumber:Number(host.dataset.expectedVersion),targetStatus:host.querySelector<HTMLSelectElement>('[data-meeting-target]')!.value,reason,requestKey:crypto.randomUUID()})});const result=await response.json();if(!response.ok)throw new Error(result.message);await refreshPromotionSchedule(host.dataset.schedule!);}
 catch(error){out.textContent=error instanceof Error?error.message:'保存失败，输入已保留。';}
 finally{button.disabled=false;}
});
