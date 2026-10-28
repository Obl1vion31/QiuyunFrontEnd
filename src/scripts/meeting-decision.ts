import {refreshPromotionSchedule} from './promotion-timeline';
import {businessConfirm} from './business-dialog';
import {preparePromotionEditor,registerPromotionEditor} from './promotion-editor-lifecycle';

type ArrangementDraft={id:string;record:string;schedule:string;trigger:HTMLButtonElement;form:HTMLFormElement;target:string;reason:string;expected:string;version:number;requestKey:string;busy:boolean;saved:boolean;closing?:Promise<boolean>};
let active:ArrangementDraft|undefined;
let opening=false;
let replaying=false;
const changed=(draft:ArrangementDraft)=>!draft.saved&&!!(draft.target||draft.reason);
const unsaved=()=>{document.documentElement.dataset.unsaved=String(!!document.querySelector('form[data-dirty=true]'));};
function findTrigger(draft:ArrangementDraft){
 if(draft.trigger.isConnected)return draft.trigger;
 const matches=[...document.querySelectorAll<HTMLButtonElement>('[data-meeting-change]')].filter(node=>node.dataset.decisionId===draft.id);
 return matches[0];
}
function position(draft:ArrangementDraft){
 const trigger=findTrigger(draft);if(!trigger)return;draft.trigger=trigger;
 const rect=trigger.getBoundingClientRect(),width=Math.min(340,innerWidth-24),height=draft.form.getBoundingClientRect().height;
 draft.form.style.left=`${Math.max(12,Math.min(rect.right-width,innerWidth-width-12))}px`;
 const below=rect.bottom+8;
 draft.form.style.top=`${Math.max(12,Math.min(below+height<=innerHeight-12?below:rect.top-height-8,innerHeight-height-12))}px`;
 trigger.setAttribute('aria-expanded','true');
}
function sync(draft:ArrangementDraft){
 draft.form.dataset.dirty=String(changed(draft));draft.form.classList.toggle('is-saved',draft.saved);
 for(const field of draft.form.querySelectorAll<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>('input,select,textarea'))field.disabled=draft.busy||draft.saved;
 const submit=draft.form.querySelector<HTMLButtonElement>('[data-save-meeting-change]')!;
 submit.disabled=draft.busy||draft.saved;submit.textContent=draft.saved?'已修改':draft.busy?'正在保存…':'保存修改';
 draft.form.querySelector<HTMLButtonElement>('[data-meeting-again]')!.hidden=!draft.saved;
 for(const button of draft.form.querySelectorAll<HTMLButtonElement>('[data-meeting-close],[data-meeting-again]'))button.disabled=draft.busy;
 unsaved();
}
async function finishClose(draft:ArrangementDraft,focus=true){
 if(!matchMedia('(prefers-reduced-motion:reduce)').matches)await draft.form.animate([{opacity:1,transform:'translateY(0)'},{opacity:0,transform:'translateY(4px)'}],{duration:220,easing:'ease',fill:'both'}).finished.catch(()=>{});
 const trigger=findTrigger(draft);draft.form.remove();document.dispatchEvent(new Event('business:editing-scope-change'));trigger?.setAttribute('aria-expanded','false');
 if(active===draft)active=undefined;
 unsaved();if(focus)trigger?.focus({preventScroll:true});
}
export async function dismissMeetingDecision(focus=true):Promise<boolean>{
 const draft=active;if(!draft)return true;if(draft.busy)return false;if(draft.closing)return draft.closing;
 draft.closing=(async()=>{
  if(changed(draft)&&!await businessConfirm('安排修改尚未保存，是否放弃？',{title:'未保存的安排',confirmLabel:'放弃修改',cancelLabel:'继续编辑'}))return false;
  await finishClose(draft,focus);return true;
 })();const accepted=await draft.closing;draft.closing=undefined;return accepted;
}
registerPromotionEditor('meeting',()=>dismissMeetingDecision(false));
export async function guardMeetingDecisionSubmission(forms:HTMLFormElement[]){
 const draft=active;if(!draft||!forms.some(form=>form.dataset.pendingRecord===draft.record))return true;
 if(draft.saved)return !draft.busy;
 if(!changed(draft)&&!draft.busy)return true;
 draft.form.querySelector<HTMLOutputElement>('output')!.textContent='请先保存或取消安排修改。';position(draft);draft.form.querySelector<HTMLSelectElement>('select')!.focus({preventScroll:true});return false;
}
async function refresh(draft:ArrangementDraft){
 await refreshPromotionSchedule(draft.schedule);
 const trigger=findTrigger(draft);if(trigger){draft.trigger=trigger;draft.expected=trigger.dataset.expectedTarget!;draft.version=Number(trigger.dataset.expectedVersion);}
 position(draft);
}
async function open(trigger:HTMLButtonElement){
 if(opening||trigger.closest<HTMLFormElement>('[data-metric-form]')?.querySelector<HTMLButtonElement>('[type=submit]')?.disabled)return;
 opening=true;
 try{
  if(active&&active.id===trigger.dataset.decisionId){active.trigger.setAttribute('aria-expanded','false');active.trigger=trigger;position(active);active.form.querySelector<HTMLElement>('select:not(:disabled),[data-meeting-close]')?.focus({preventScroll:true});return;}
  if(!await dismissMeetingDecision(false)||!await preparePromotionEditor('meeting'))return;
  const form=document.createElement('form');form.className='business-form review-state-bubble review-arrangement-bubble';form.dataset.meetingChangeForm=trigger.dataset.decisionId;form.dataset.collaborationResource=`schedule:${trigger.dataset.schedule}`;form.dataset.collaborationLabel=trigger.closest<HTMLElement>('[data-collaboration-resource]')?.dataset.collaborationLabel??'次日安排';form.setAttribute('role','dialog');form.setAttribute('aria-label','修改次日安排');
  form.innerHTML='<header><strong>修改次日安排</strong><button type="button" class="review-state-close" data-meeting-close aria-label="关闭安排修改">×</button></header><div class="review-bubble-body"><div class="review-state-before"><span>原安排</span><strong data-original-arrangement></strong></div><div class="review-state-before"><span>生效日期</span><time data-arrangement-date></time></div><label>新安排<select name="targetStatus" data-meeting-target aria-label="新安排"><option value="">请选择新安排</option></select></label><label>修改理由<textarea name="reason" data-meeting-reason aria-label="修改理由" rows="2" maxlength="500"></textarea></label><output role="status" data-state-message></output><button type="button" class="business-action-secondary" data-meeting-refresh hidden>重新读取</button></div><footer><button type="button" class="business-action-secondary" data-meeting-close>取消</button><button type="button" class="business-action-secondary" data-meeting-again hidden>再次修改</button><button type="submit" class="business-action-primary" data-save-meeting-change>保存修改</button></footer>';
  const select=form.querySelector<HTMLSelectElement>('select')!,reason=form.querySelector<HTMLTextAreaElement>('textarea')!,out=form.querySelector<HTMLOutputElement>('output')!,retry=form.querySelector<HTMLButtonElement>('[data-meeting-refresh]')!;
  for(const option of JSON.parse(trigger.dataset.meetingOptions!) as Array<{value:string;label:string}>)select.add(new Option(option.label,option.value));
  form.querySelector('[data-original-arrangement]')!.textContent=trigger.parentElement!.querySelector('[data-meeting-result]')!.textContent;
  const date=form.querySelector<HTMLTimeElement>('time')!;date.textContent=trigger.dataset.effectiveOn!;date.dateTime=trigger.dataset.effectiveOn!;
  const draft:ArrangementDraft={id:trigger.dataset.decisionId!,record:trigger.closest<HTMLElement>('[data-pending-record]')!.dataset.pendingRecord!,schedule:trigger.dataset.schedule!,trigger,form,target:'',reason:'',expected:trigger.dataset.expectedTarget!,version:Number(trigger.dataset.expectedVersion),requestKey:crypto.randomUUID(),busy:false,saved:false};
  active=draft;document.body.append(form);sync(draft);position(draft);
  if(!matchMedia('(prefers-reduced-motion:reduce)').matches)form.animate([{opacity:0,transform:'translateY(4px)'},{opacity:1,transform:'translateY(0)'}],{duration:220,easing:'ease'});
  select.focus({preventScroll:true});
  form.querySelectorAll('[data-meeting-close]').forEach(button=>button.addEventListener('click',()=>void dismissMeetingDecision()));
  const edit=()=>{draft.target=select.value;draft.reason=reason.value;draft.requestKey=crypto.randomUUID();out.textContent='';sync(draft);position(draft);};form.addEventListener('input',edit);form.addEventListener('change',edit);
  form.querySelector('[data-meeting-again]')!.addEventListener('click',()=>{draft.saved=false;draft.target='';draft.reason='';draft.requestKey=crypto.randomUUID();select.value='';reason.value='';out.textContent='';form.querySelector('footer [data-meeting-close]')!.textContent='取消';form.querySelector('[data-original-arrangement]')!.textContent=draft.trigger.parentElement!.querySelector('[data-meeting-result]')!.textContent;sync(draft);select.focus({preventScroll:true});});
  retry.addEventListener('click',async()=>{if(draft.busy)return;draft.busy=true;sync(draft);retry.disabled=true;try{await refresh(draft);retry.hidden=true;out.textContent='安排已修改';}catch{out.textContent='已保存，列表更新失败，请重试读取。';}finally{draft.busy=false;retry.disabled=false;sync(draft);}});
  form.addEventListener('submit',async event=>{
   event.preventDefault();if(draft.busy||draft.saved)return;
   if(!reason.value.trim()){out.textContent='请填写修改理由。';reason.focus({preventScroll:true});position(draft);return;}
   if(!select.value){out.textContent='请选择新安排。';select.focus({preventScroll:true});position(draft);return;}
   draft.busy=true;sync(draft);out.textContent='正在保存…';
   try{
    const response=await fetch('/api/meeting-decisions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:draft.id,expectedTargetStatus:draft.expected,expectedVersionNumber:draft.version,targetStatus:draft.target,reason:draft.reason.trim(),requestKey:draft.requestKey})});
    let result:{message?:string};try{result=await response.json();}catch{throw new Error('服务暂时不可用，输入已保留，请重试。');}
    if(!response.ok)throw new Error(result.message??'保存失败，输入已保留。');
    draft.saved=true;sync(draft);out.textContent='安排已修改';form.querySelector('footer [data-meeting-close]')!.textContent='关闭';
    try{await refresh(draft);}catch{retry.hidden=false;out.textContent='已保存，列表更新失败，请重试读取。';}
   }catch(error){out.textContent=error instanceof TypeError?'连接失败，输入已保留。':error instanceof Error?error.message:'保存失败，输入已保留。';}
   finally{draft.busy=false;sync(draft);position(draft);}
  });
  form.addEventListener('keydown',event=>{if(event.key!=='Tab')return;event.stopPropagation();const nodes=[...form.querySelectorAll<HTMLElement>('button:not(:disabled),select:not(:disabled),textarea:not(:disabled)')].filter(node=>node.getClientRects().length);if(event.shiftKey&&document.activeElement===nodes[0]){event.preventDefault();nodes.at(-1)?.focus();}else if(!event.shiftKey&&document.activeElement===nodes.at(-1)){event.preventDefault();nodes[0]?.focus();}});
 }finally{opening=false;}
}
// 在目标动作之前完成确认与退出，取消时不打开另一条记录或关闭 Inspector。
document.addEventListener('pointerdown',event=>{if(active&&changed(active)&&!active.form.contains(event.target as Node)&&!(event.target as Element).closest('[data-business-popover]')&&!document.querySelector('dialog[open]'))event.preventDefault();},true);
document.addEventListener('click',event=>{
 if(replaying||document.querySelector('dialog[open]'))return;
 const target=event.target as Element,trigger=target.closest<HTMLButtonElement>('[data-meeting-change]');
 if(trigger){event.preventDefault();event.stopImmediatePropagation();void open(trigger);return;}
 if(!active||active.form.contains(target)||target.closest('a[target=_blank],[data-business-popover]'))return;
 const submit=target.closest<HTMLButtonElement>('[data-save-all],form[data-metric-form] button[type=submit]');
 if(submit&&(changed(active)||active.busy)){
  event.preventDefault();event.stopImmediatePropagation();
  void guardMeetingDecisionSubmission(submit.hasAttribute('data-save-all')?[...document.querySelectorAll<HTMLFormElement>('#daily-table [data-review-container=ready] [data-metric-form]')]:[submit.closest<HTMLFormElement>('form')!]);return;
 }
 event.preventDefault();event.stopImmediatePropagation();
 if(active.closing)return;
 void dismissMeetingDecision(false).then(accepted=>{if(!accepted)return;const control=target.closest<HTMLElement>('a,button,input,textarea,select,summary,[data-inspector-key]');if(control){replaying=true;control.focus({preventScroll:true});control.click();replaying=false;}});
},true);
window.addEventListener('keydown',event=>{if(event.key==='Escape'&&active&&!document.querySelector('dialog[open],[data-popover-panel]:popover-open')){event.preventDefault();event.stopImmediatePropagation();void dismissMeetingDecision();}},{capture:true});
for(const event of ['resize','scroll'])window.addEventListener(event,()=>{if(active&&!active.closing)position(active);},true);
document.addEventListener('business:promotion-fragment-updated',()=>{if(active&&!active.closing)position(active);});
document.addEventListener('business:navigation-discard',()=>{if(active)void finishClose(active,false);});
document.addEventListener('astro:before-swap',()=>{active?.form.remove();active=undefined;});
