import {businessConfirm} from './business-dialog';
import {refreshPromotionSchedule,randomRequestKey} from './promotion-timeline';
import {openStateBubble} from './promotion-daily-form';
import {preparePromotionEditor,registerPromotionEditor} from './promotion-editor-lifecycle';
import {promotionNextOptions} from '../db/promotion-successors.mjs';
import {nextDateKey} from '../db/promotion-rules.mjs';

const metricNames=['spend','platformOpenCount','actualOpenCount','platformLeadCount','actualLeadCount'];
const controls=(form:HTMLFormElement)=>[...form.querySelectorAll<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>('input[name],select[name],textarea[name]')];
const values=(form:HTMLFormElement)=>Object.fromEntries(controls(form).map(field=>[field.name,field.value]));
const unsaved=()=>{document.documentElement.dataset.unsaved=String(!!document.querySelector('form[data-dirty=true]'));};
let reasonEditor:{close:()=>void;position:()=>void}|undefined;
registerPromotionEditor('saved-next',async()=>{reasonEditor?.close();return true;});
async function askReason(anchor:HTMLElement,date:string,before:string,after:string,draft:string,onInput:(text:string)=>void):Promise<string|null>{
 if(!await preparePromotionEditor('saved-next'))return null;
 reasonEditor?.close();
 return new Promise(resolve=>{
  const bubble=document.createElement('form');bubble.className='business-form review-state-bubble';bubble.dataset.savedReason='';bubble.setAttribute('aria-label','更正次日安排');
  bubble.innerHTML='<header><strong>更正次日安排</strong><button type="button" class="review-state-close" aria-label="关闭原因气泡">×</button></header><div class="review-bubble-body"><p></p><label>更正原因<textarea name="reason" rows="2" maxlength="2000" required></textarea></label></div><footer><button type="button" class="business-action-secondary">返回编辑</button><button type="submit" class="business-action-primary">确认保存</button></footer>';
  bubble.querySelector('p')!.textContent=`${date}：${before} → ${after}`;const input=bubble.querySelector('textarea')!;input.value=draft;
  let ended=false;const finish=(value:string|null)=>{if(ended)return;ended=true;onInput(input.value);bubble.remove();reasonEditor=undefined;anchor.focus({preventScroll:true});resolve(value);};
  const position=()=>{const rect=anchor.getBoundingClientRect(),width=Math.min(340,innerWidth-24);bubble.style.width=width+'px';bubble.style.left=Math.max(12,Math.min(rect.right-width,innerWidth-width-12))+'px';bubble.style.top=Math.max(12,Math.min(rect.bottom+8,innerHeight-bubble.getBoundingClientRect().height-12))+'px';};
  reasonEditor={close:()=>finish(null),position};document.body.append(bubble);position();input.focus({preventScroll:true});
  bubble.querySelectorAll<HTMLButtonElement>('button[type=button]').forEach(button=>button.addEventListener('click',()=>finish(null)));
  input.addEventListener('input',()=>onInput(input.value));bubble.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();finish(null);}});
  bubble.addEventListener('submit',event=>{event.preventDefault();if(bubble.reportValidity())finish(input.value.trim());});
 });
}
window.addEventListener('resize',()=>reasonEditor?.position());window.addEventListener('scroll',()=>reasonEditor?.position(),true);
document.addEventListener('astro:before-swap',()=>reasonEditor?.close());

function initialize(){
 for(const form of document.querySelectorAll<HTMLFormElement>('[data-saved-review]:not([data-saved-ready])')){
  form.dataset.savedReady='true';
  const baseline=values(form),status=form.querySelector<HTMLElement>('[data-saved-status]')!,output=form.querySelector<HTMLElement>('[data-form-message]')!;
  const again=form.querySelector<HTMLButtonElement>('[data-continue-review]')!,submit=form.querySelector<HTMLButtonElement>('[data-save-saved]')!,cancel=form.querySelector<HTMLButtonElement>('[data-cancel-saved]')!;
  const day=form.elements.namedItem('dayStatus') as HTMLInputElement,reason=form.elements.namedItem('reason') as HTMLInputElement,dayTrigger=form.querySelector<HTMLButtonElement>('[data-toggle-day-state]')!;
  let busy=false,awaitingReason=false,saved=false,stale=false,requestKey=randomRequestKey(),reasonDraft='';
  const cost=()=>{for(const [selector,count]of [['[data-open-cost]','actualOpenCount'],['[data-lead-cost]','actualLeadCount']]){const n=Number((form.elements.namedItem(count) as HTMLInputElement).value),spend=Number((form.elements.namedItem('spend') as HTMLInputElement).value);form.querySelector<HTMLOutputElement>(selector)!.value=n>0?`¥${(spend/n).toFixed(2)}`:'—';}};
  const nextChoices=(wanted:string)=>{
   if(form.querySelector('[data-meeting-change]'))return;
   let select=form.elements.namedItem('reviewDecision') as HTMLInputElement|HTMLSelectElement;
   if(!(select instanceof HTMLSelectElement)){const replacement=document.createElement('select');replacement.name='reviewDecision';replacement.dataset.reviewDecision='';replacement.setAttribute('aria-label','次日安排');select.replaceWith(replacement);select=replacement;form.querySelector('.review-no-next')?.remove();}
   const options=promotionNextOptions(day.value);select.replaceChildren();if(options.length){select.add(new Option('请选择',''));for(const o of options)select.add(new Option(o.label,o.value));}else select.add(new Option('无需后续动作',day.value));
   select.value=[...select.options].some(o=>o.value===wanted)?wanted:options.length?'':day.value;select.required=true;
  };
  const changed=()=>{const current=values(form);form.dataset.dirty=String(form.dataset.editing==='true'&&(metricNames.some(name=>current[name]===''||Number(current[name])!==Number(baseline[name]))||current.dayStatus!==baseline.dayStatus||current.reviewDecision!==baseline.reviewDecision));cost();unsaved();};
  const render=()=>{
   const editing=form.dataset.editing==='true';
   for(const field of controls(form)){if(field.type==='hidden')continue;field.disabled=!editing||busy;if(field instanceof HTMLInputElement)field.tabIndex=editing&&!busy?0:-1;}
   for(const button of form.querySelectorAll<HTMLButtonElement>('[data-meeting-change]'))button.disabled=!editing||busy;
   dayTrigger.disabled=!editing||busy||!JSON.parse(form.dataset.statusEditOptions??'[]').length;
   again.hidden=editing;again.disabled=busy;submit.hidden=!editing;submit.disabled=busy;cancel.hidden=!editing;cancel.disabled=busy;
   status.textContent=busy&&!awaitingReason?'正在保存…':editing?'编辑中':'已保存';changed();
  };
  again.addEventListener('click',()=>{if(busy)return;saved=false;output.textContent='';form.dataset.editing='true';render();form.querySelector<HTMLInputElement>('[name=spend]')!.focus({preventScroll:true});});
  dayTrigger.addEventListener('click',()=>void openStateBubble(form));
  form.addEventListener('business:saved-context-updated',event=>{
   const source=(event as CustomEvent).detail.form as HTMLFormElement,currentDecision=(form.elements.namedItem('reviewDecision') as HTMLSelectElement).value;
   for(const key of ['actualStatus','currentStage','statusEditOptions','defaultZero'])form.dataset[key]=source.dataset[key];
   form.className=source.className;
   const fresh=values(source);for(const key of ['dayStatus','actualStatusSnapshot','dailyStatus','stageTypeSnapshot']){baseline[key]=fresh[key];(form.elements.namedItem(key) as HTMLInputElement).value=fresh[key];}
   baseline.reviewDecision=fresh.reviewDecision;nextChoices(currentDecision);if(!(form.elements.namedItem('reviewDecision') as HTMLInputElement).value)output.textContent='当日状态已更新，请重新选择次日安排。';
   dayTrigger.replaceChildren(...[...source.querySelector('[data-toggle-day-state]')!.childNodes].map(n=>n.cloneNode(true)));render();
  });
  cancel.addEventListener('click',async()=>{
   if(busy||!await preparePromotionEditor('saved-next')||form.dataset.dirty==='true'&&!await businessConfirm('每日复盘修改尚未保存，是否放弃？'))return;
   day.value=baseline.dayStatus;nextChoices(baseline.reviewDecision);for(const field of controls(form))if(field.name in baseline)field.value=baseline[field.name];form.dataset.editing='false';output.textContent='';render();
   if(stale)try{await refreshPromotionSchedule(form.dataset.scheduleId!);}catch{output.textContent='重新读取失败，请刷新后重试。';}else again.focus({preventScroll:true});
  });
  form.addEventListener('change',()=>{requestKey=randomRequestKey();output.textContent='';render();});form.addEventListener('input',()=>{requestKey=randomRequestKey();output.textContent='';changed();});
  form.addEventListener('submit',async event=>{
   event.preventDefault();if(busy||saved||!form.reportValidity()||!await preparePromotionEditor('saved-next'))return;
   if(form.dataset.dirty!=='true'){form.dataset.editing='false';render();again.focus();return;}
   const current=values(form),nextChanged=current.reviewDecision!==baseline.reviewDecision;
   busy=true;awaitingReason=nextChanged;render();output.textContent='';
   try{
    if(nextChanged){const select=form.elements.namedItem('reviewDecision') as HTMLSelectElement,before=promotionNextOptions(day.value).find(o=>o.value===baseline.reviewDecision)?.label??baseline.reviewDecision;const answer=await askReason(submit,nextDateKey(current.metricDate),before,select.selectedOptions[0]?.textContent??current.reviewDecision,reasonDraft,text=>reasonDraft=text);if(answer===null)return;reason.value=answer;}
    awaitingReason=false;render();const payload=values(form);Object.assign(payload,{requestKey,fingerprint:form.dataset.fingerprint??'',changeDayStatus:'true',dailyWorkspace:'true'});
    const send=()=>{const data=new FormData();for(const [name,value]of Object.entries(payload))data.set(name,value);return fetch('/api/promotion-daily/'+form.dataset.savedReview,{method:'PATCH',headers:{Accept:'application/json'},body:data});};
    let response=await send(),result=await response.json();
    if(result.contextRequired){if(!await businessConfirm(result.message,{title:'确认每日复盘更正',confirmLabel:'确认更正'})){output.textContent='已取消更正，输入已保留。';return;}Object.assign(payload,{confirmDayContext:'true',contextFingerprint:result.contextFingerprint});response=await send();result=await response.json();}
    if(!response.ok){stale=result.code==='STALE_WRITE';output.textContent=result.message??'保存失败，输入已保留，请重试。';return;}
    saved=true;form.dataset.editing='false';form.dataset.dirty='false';busy=false;render();unsaved();
    try{await refreshPromotionSchedule(form.dataset.scheduleId!);document.querySelector<HTMLFormElement>(`[data-saved-review="${CSS.escape(form.dataset.savedReview!)}"]`)?.querySelector<HTMLButtonElement>('[data-continue-review]')?.focus({preventScroll:true});}
    catch{output.textContent='已保存，结果读取失败。';again.disabled=true;const retry=document.createElement('button');retry.type='button';retry.className='business-action-secondary';retry.textContent='重新读取';output.append(retry);retry.addEventListener('click',async()=>{retry.disabled=true;try{await refreshPromotionSchedule(form.dataset.scheduleId!);}catch{retry.disabled=false;}});}
   }catch{output.textContent='连接失败，输入已保留，请重试。';}
   finally{busy=false;awaitingReason=false;if(form.isConnected){render();if(saved)again.disabled=true;}}
  });render();
 }
}
document.addEventListener('astro:page-load',initialize);document.addEventListener('business:promotion-fragment-updated',initialize);
