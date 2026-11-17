import {businessConfirm} from './business-dialog';
import {getInspector} from './business-inspector';
import {trackFormChanges} from './form-changes';

/** 查看与更正在同一信息区域；保存仍由原业务适配器处理。 */
function initialize(){
 document.querySelectorAll<HTMLElement>('[data-note-identity]:not([data-note-ui-ready])').forEach(root=>{
  root.dataset.noteUiReady='true';
  const edit=root.querySelector<HTMLButtonElement>('[data-note-edit]'),form=root.querySelector<HTMLFormElement>('form'),pane=root.closest<HTMLElement>('[data-inspector]');
  root.querySelector<HTMLButtonElement>('[data-copy-id]')?.addEventListener('click',async event=>{
   const button=event.currentTarget as HTMLButtonElement;
   try{await navigator.clipboard.writeText(button.dataset.copyId!);button.textContent='已复制';}
   catch{button.textContent='复制失败';}
  });
  if(!edit||!form||!pane)return;
  const changes=trackFormChanges(form,()=>{if(changes.dirty)pane.dataset.dirty='true';else if(!pane.querySelector('form[data-dirty=true]'))getInspector(pane).setClean();});
  edit.addEventListener('click',()=>{
   const review=pane.querySelector<HTMLFormElement>('[data-review-form]:not([hidden])');
   if(review&&review.dataset.dirty==='true'){review.querySelector<HTMLElement>('input:not([type=hidden]),textarea')?.focus({preventScroll:true});return;}
   form.hidden=false;edit.hidden=true;edit.setAttribute('aria-expanded','true');
   form.dispatchEvent(new Event('business:note-edit'));
   form.querySelector<HTMLElement>('input[name=platformNoteId]')?.focus({preventScroll:true});
  });
  form.querySelector<HTMLButtonElement>('[data-note-cancel]')?.addEventListener('click',async()=>{
   if(form.querySelector('[type=submit]:disabled'))return;
   if(changes.dirty&&!await businessConfirm('有尚未保存的笔记 ID 更正，是否放弃？'))return;
   form.reset();changes.capture();form.hidden=true;edit.hidden=false;edit.setAttribute('aria-expanded','false');
   if(!pane.querySelector('form[data-dirty=true]'))getInspector(pane).setClean();
   const feedback=form.querySelector('output');if(feedback)feedback.textContent='';
   edit.focus({preventScroll:true});
  });
 });
}
document.addEventListener('astro:page-load',initialize);
document.addEventListener('business:inspector-render',initialize);
document.addEventListener('business:promotion-fragment-updated',initialize);
initialize();
