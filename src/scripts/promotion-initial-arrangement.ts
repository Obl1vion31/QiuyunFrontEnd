import {businessConfirm} from './business-dialog';
import {preparePromotionEditor,registerPromotionEditor} from './promotion-editor-lifecycle';
let active:HTMLFormElement|undefined,closing:Promise<boolean>|undefined;
let deadline:HTMLElement|undefined;
const triggerFor=(form:HTMLFormElement)=>form.closest('[data-initial-row]')?.querySelector<HTMLButtonElement>('[data-initial-toggle]');
const unsaved=()=>{document.documentElement.dataset.unsaved=String(!!document.querySelector('form[data-dirty=true]'));};
function positionPanel(panel:HTMLElement,trigger:HTMLElement,width:number){
 const anchor=trigger.getBoundingClientRect();width=Math.min(width,innerWidth-24);panel.style.width=width+'px';
 const height=panel.getBoundingClientRect().height,below=anchor.bottom+8;
 panel.style.left=Math.max(12,Math.min(anchor.left,innerWidth-width-12))+'px';
 panel.style.top=Math.max(12,Math.min(below+height<=innerHeight-12?below:anchor.top-height-8,innerHeight-height-12))+'px';
}
function position(){
 if(active?.isConnected&&!active.hidden){const trigger=triggerFor(active);if(trigger)positionPanel(active,trigger,340);}
 if(deadline?.isConnected&&!deadline.hidden){const trigger=deadline.closest('form')?.querySelector<HTMLElement>('[data-deadline-trigger]');if(trigger)positionPanel(deadline,trigger,280);}
}
function closeDeadline(focus=true){
 if(!deadline)return;const panel=deadline,trigger=panel.closest('form')?.querySelector<HTMLButtonElement>('[data-deadline-trigger]');
 if(panel.matches(':popover-open'))panel.hidePopover();panel.hidden=true;trigger?.setAttribute('aria-expanded','false');deadline=undefined;if(focus)trigger?.focus({preventScroll:true});
}
async function openDeadline(form:HTMLFormElement){
 const panel=form.querySelector<HTMLElement>('[data-deadline-panel]')!;
 if(deadline===panel){closeDeadline();return;}
 if(!await preparePromotionEditor('initial')||!await dismiss())return;
 closeDeadline(false);deadline=panel;panel.hidden=false;panel.showPopover();form.querySelector('[data-deadline-trigger]')?.setAttribute('aria-expanded','true');position();panel.querySelector<HTMLInputElement>('input')?.focus({preventScroll:true});
}
async function dismiss(discard=true):Promise<boolean>{
 if(!active)return true;if(discard&&active.dataset.saving==='true')return false;if(closing)return closing;
 const form=active;
 closing=(async()=>{
  if(discard&&form.dataset.dirty==='true'&&!await businessConfirm('安排修改尚未保存，是否放弃？'))return false;
  if(form.matches(':popover-open'))form.hidePopover();form.hidden=true;triggerFor(form)?.setAttribute('aria-expanded','false');
  if(discard){form.reset();delete form.dataset.dirty;form.dispatchEvent(new Event('change'));}
  active=undefined;unsaved();triggerFor(form)?.focus({preventScroll:true});return true;
 })();try{return await closing;}finally{closing=undefined;}
}
async function open(form:HTMLFormElement){
 if(form.closest('[data-initial-row]')?.querySelector('form[data-saving=true]'))return;
 closeDeadline(false);if(active===form){await dismiss();return;}
 if(!await preparePromotionEditor('initial')||!await dismiss())return;
 active=form;form.hidden=false;form.showPopover();triggerFor(form)?.setAttribute('aria-expanded','true');position();form.querySelector<HTMLSelectElement>('select')?.focus({preventScroll:true});
}
/** 灰行安排独立保存；指标单行／批量提交前先处理未保存安排。 */
export function guardInitialArrangementSubmission(){
 const dirty=document.querySelector<HTMLFormElement>('#daily-table [data-initial-row] form[data-dirty=true]');
 if(!dirty)return true;
 if(dirty.hasAttribute('data-initial-panel')){if(active!==dirty)void open(dirty);dirty.querySelector('output')!.textContent='请先保存或取消安排修改，再保存指标。';}
 else {dirty.querySelector('output')!.textContent='请先保存或取消这条安排修改，再保存指标。';dirty.querySelector<HTMLElement>('select')?.focus({preventScroll:true});}
 dirty.closest('[data-review-record]')?.scrollIntoView({block:'nearest'});return false;
}
registerPromotionEditor('initial',async()=>{closeDeadline(false);return dismiss();});
function initialize(){
 document.querySelectorAll<HTMLElement>('[data-initial-row]:not([data-initial-ready])').forEach(row=>{
  row.dataset.initialReady='true';
  const next=row.querySelector<HTMLFormElement>('.review-initial-next'),cancel=next?.querySelector<HTMLButtonElement>('[data-cancel-plan]');
  if(next&&cancel){
   const trigger=next.querySelector<HTMLButtonElement>('[data-deadline-trigger]')!,date=next.querySelector<HTMLInputElement>('[name=waitingThrough]')!;
   const sync=()=>{const waiting=(next.elements.namedItem('nextDecision') as HTMLSelectElement).value==='wait_continue';trigger.hidden=!waiting;trigger.dataset.deadlineSet=String(!!date.value);trigger.title=date.value?`待定至 ${date.value}（含当天）`:'不设截止日则持续待定';trigger.setAttribute('aria-label',date.value?`修改待定截止日 ${date.value}`:'设置待定截止日');cancel.hidden=next.dataset.dirty!=='true';if(!waiting&&deadline?.closest('form')===next)closeDeadline(false);};
   next.addEventListener('input',()=>{queueMicrotask(sync);});next.addEventListener('change',()=>{queueMicrotask(sync);});
   cancel.addEventListener('click',()=>{closeDeadline(false);next.reset();delete next.dataset.dirty;next.querySelector('output')!.textContent='';next.dispatchEvent(new Event('change'));sync();unsaved();next.querySelector<HTMLSelectElement>('select')?.focus({preventScroll:true});});
   trigger.addEventListener('click',()=>void openDeadline(next));
   next.querySelectorAll('[data-deadline-close]').forEach(button=>button.addEventListener('click',()=>closeDeadline()));
   next.querySelector('[data-deadline-clear]')?.addEventListener('click',()=>{date.value='';date.dispatchEvent(new Event('input',{bubbles:true}));date.focus({preventScroll:true});});
   date.addEventListener('invalid',event=>{if(!deadline){event.preventDefault();void openDeadline(next);}});
   next.addEventListener('business:timeline-saved',()=>closeDeadline(false));sync();
  }
  const form=row.querySelector<HTMLFormElement>('[data-initial-panel]')!;
  row.querySelector<HTMLButtonElement>('[data-initial-toggle]')!.addEventListener('click',()=>void open(form));
  form.querySelectorAll('[data-initial-close]').forEach(button=>button.addEventListener('click',()=>void dismiss()));
  form.addEventListener('change',()=>requestAnimationFrame(position));
  form.addEventListener('business:timeline-saved',()=>void dismiss(false));
 });
}
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&deadline&&!document.querySelector('dialog[open]')){event.preventDefault();event.stopImmediatePropagation();closeDeadline();return;}if(event.key==='Escape'&&active&&!document.querySelector('dialog[open]')){event.preventDefault();event.stopImmediatePropagation();void dismiss();}},true);
document.addEventListener('pointerdown',event=>{if(deadline&&!deadline.contains(event.target as Node)&&!deadline.closest('form')?.querySelector('[data-deadline-trigger]')?.contains(event.target as Node))closeDeadline(false);if(active&&!closing&&!active.contains(event.target as Node)&&!triggerFor(active)?.contains(event.target as Node)&&!document.querySelector('dialog[open]'))void dismiss();});
window.addEventListener('scroll',position,true);window.addEventListener('resize',position);window.visualViewport?.addEventListener('resize',position);
document.addEventListener('astro:before-swap',()=>{closeDeadline(false);active=undefined;});
document.addEventListener('business:promotion-fragment-updated',initialize);document.addEventListener('astro:page-load',initialize);initialize();
