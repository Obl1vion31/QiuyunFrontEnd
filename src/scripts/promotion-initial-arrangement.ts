import {businessConfirm} from './business-dialog';
import {preparePromotionEditor,registerPromotionEditor} from './promotion-editor-lifecycle';
let active:HTMLFormElement|undefined,closing:Promise<boolean>|undefined;
const triggerFor=(form:HTMLFormElement)=>form.closest('[data-initial-row]')?.querySelector<HTMLButtonElement>('[data-initial-toggle]');
const unsaved=()=>{document.documentElement.dataset.unsaved=String(!!document.querySelector('form[data-dirty=true]'));};
function position(){
 if(!active?.isConnected||active.hidden)return;
 const anchor=triggerFor(active)?.getBoundingClientRect();if(!anchor)return;
 const width=Math.min(340,innerWidth-24);active.style.width=width+'px';
 const height=active.getBoundingClientRect().height,below=anchor.bottom+8;
 active.style.left=Math.max(12,Math.min(anchor.left,innerWidth-width-12))+'px';
 active.style.top=Math.max(12,Math.min(below+height<=innerHeight-12?below:anchor.top-height-8,innerHeight-height-12))+'px';
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
 if(active===form){await dismiss();return;}
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
registerPromotionEditor('initial',()=>dismiss());
function initialize(){
 document.querySelectorAll<HTMLElement>('[data-initial-row]:not([data-initial-ready])').forEach(row=>{
  row.dataset.initialReady='true';const next=row.querySelector<HTMLFormElement>('.review-initial-next'),cancel=next?.querySelector<HTMLButtonElement>('[data-cancel-plan]');if(next&&cancel){next.addEventListener('input',()=>{cancel.hidden=false;});cancel.addEventListener('click',()=>{next.reset();delete next.dataset.dirty;next.dispatchEvent(new Event('change'));cancel.hidden=true;unsaved();});}const form=row.querySelector<HTMLFormElement>('[data-initial-panel]')!;
  row.querySelector<HTMLButtonElement>('[data-initial-toggle]')!.addEventListener('click',()=>void open(form));
  form.querySelectorAll('[data-initial-close]').forEach(button=>button.addEventListener('click',()=>void dismiss()));
  form.addEventListener('change',()=>requestAnimationFrame(position));
  form.addEventListener('business:timeline-saved',()=>void dismiss(false));
 });
}
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&active&&!document.querySelector('dialog[open]')){event.preventDefault();event.stopImmediatePropagation();void dismiss();}},true);
document.addEventListener('pointerdown',event=>{if(active&&!closing&&!active.contains(event.target as Node)&&!triggerFor(active)?.contains(event.target as Node)&&!document.querySelector('dialog[open]'))void dismiss();});
window.addEventListener('scroll',position,true);window.addEventListener('resize',position);window.visualViewport?.addEventListener('resize',position);
document.addEventListener('astro:before-swap',()=>{active=undefined;});
document.addEventListener('business:promotion-fragment-updated',initialize);document.addEventListener('astro:page-load',initialize);initialize();
