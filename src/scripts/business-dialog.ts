import { navigate } from 'astro:transitions/client';

export type ConfirmOptions = { title?:string; confirmLabel?:string; cancelLabel?:string };
declare global { interface Window { businessConfirm:typeof businessConfirm; businessDateTime:(value:Date|string)=>string;__businessHistoryPop?:(event:PopStateEvent)=>boolean } }
let pending: Promise<boolean> | undefined;
/** 同一时刻只显示一次确认；取消不会改变调用方的输入和选择。 */
export function businessConfirm(message:string, options:ConfirmOptions = {}):Promise<boolean> {
  if (pending) return Promise.resolve(false);
  const source=document.activeElement as HTMLElement|null;
  const dialog=document.querySelector<HTMLDialogElement>('[data-business-confirm]')!;
  dialog.querySelector('[data-confirm-title]')!.textContent=options.title??'未保存的修改';
  dialog.querySelector('[data-confirm-message]')!.textContent=message;
  const cancel=dialog.querySelector<HTMLButtonElement>('[data-confirm-cancel]')!;
  const accept=dialog.querySelector<HTMLButtonElement>('[data-confirm-accept]')!;
  cancel.textContent=options.cancelLabel??'继续编辑'; accept.textContent=options.confirmLabel??'放弃修改';
  pending=new Promise<boolean>(resolve=>{
    const finish=async(value:boolean)=>{
      dialog.removeEventListener('cancel',onCancel);cancel.onclick=null;accept.onclick=null;
      await closeBusinessDialog(dialog);pending=undefined;
      if(source?.isConnected)source.focus({preventScroll:true});resolve(value);
    };
    const onCancel=(event:Event)=>{event.preventDefault();void finish(false);};
    dialog.addEventListener('cancel',onCancel);cancel.onclick=()=>void finish(false);accept.onclick=()=>void finish(true);
    dialog.showModal();cancel.focus({preventScroll:true});
  });
  return pending;
}
window.businessConfirm=businessConfirm;
// 给本地选择与 Astro 导航共用的历史条目编号，取消后回到原条目，不裁掉前进历史。
let historyPosition=Number(history.state?.businessPosition??0);
let historyLocation=new URL(location.href);
const pushHistory=history.pushState.bind(history),replaceHistory=history.replaceState.bind(history);
replaceHistory({...history.state,businessPosition:historyPosition},'');
history.pushState=(state,unused,url)=>{historyPosition++;pushHistory({...state,businessPosition:historyPosition},unused,url);historyLocation=new URL(location.href);};
history.replaceState=(state,unused,url)=>{replaceHistory({...state,businessPosition:historyPosition},unused,url);historyLocation=new URL(location.href);};
let restoringHistory=false;
window.__businessHistoryPop=event=>{
  const destination=new URL(location.href),position=Number(event.state?.businessPosition);
  if(restoringHistory){restoringHistory=false;event.stopImmediatePropagation();return true;}
  const pane=document.querySelector<HTMLElement>('[data-inspector-ready=true]');
  const localOnly=()=>{
    if(!pane?.dataset.inspectorParameter)return false;
    const previous=new URL(historyLocation),next=new URL(destination);
    for(const key of pane.dataset.inspectorLocalParameters?.split(',').filter(Boolean)??[]){previous.searchParams.delete(key);next.searchParams.delete(key);}
    return previous.href===next.href;
  };
  if(document.documentElement.dataset.unsaved!=='true'||localOnly()){
    if(Number.isFinite(position))historyPosition=position;historyLocation=destination;return false;
  }
  event.stopImmediatePropagation();
  const distance=historyPosition-position;
  if(Number.isFinite(distance)&&distance!==0){
    restoringHistory=true;history.go(distance);
    // history.go 异步恢复地址；确认完成前不触发页面或详情切换。
    void businessConfirm('有尚未保存的修改，是否放弃？').then(accepted=>{
      if(!accepted)return;document.documentElement.dataset.unsaved='false';if(pane)pane.dataset.dirty='false';history.go(-distance);
    });
  }else{
    pushHistory({...history.state,businessPosition:historyPosition},'',historyLocation);
    void businessConfirm('有尚未保存的修改，是否放弃？').then(accepted=>{if(accepted){document.documentElement.dataset.unsaved='false';if(pane)pane.dataset.dirty='false';void navigate(destination.href,{history:'replace'});}});
  }
  return true;
};
document.addEventListener('astro:page-load',()=>{historyLocation=new URL(location.href);historyPosition=Number(history.state?.businessPosition??historyPosition);});
const closing=new WeakMap<HTMLDialogElement,Promise<void>>();
const natives=new WeakMap<HTMLDialogElement,(value?:string)=>void>();
export function closeBusinessDialog(dialog:HTMLDialogElement,value?:string):Promise<void> {
  if(!dialog.open)return Promise.resolve();
  const current=closing.get(dialog);if(current)return current;
  dialog.dataset.closing='true';
  const task=Promise.resolve().then(async()=>{
    if(!matchMedia('(prefers-reduced-motion:reduce)').matches){
      const side=dialog.classList.contains('business-form-sheet');
      const animation=dialog.animate([{opacity:1,transform:'none'},{opacity:0,transform:side?'translateX(28px)':'translateY(8px)'}],{duration:220,easing:'cubic-bezier(.2,.8,.2,1)',fill:'forwards'});
      await animation.finished.catch(()=>{});(natives.get(dialog)??HTMLDialogElement.prototype.close.bind(dialog))(value);animation.cancel();
    } else (natives.get(dialog)??HTMLDialogElement.prototype.close.bind(dialog))(value);
    delete dialog.dataset.closing;closing.delete(dialog);
  });closing.set(dialog,task);return task;
}
function initialize(){
  document.querySelectorAll<HTMLDialogElement>('dialog.business-form-sheet,dialog.business-form-dialog').forEach(dialog=>{
    if(natives.has(dialog))return;
    natives.set(dialog,dialog.close.bind(dialog));dialog.close=(value?:string)=>{void closeBusinessDialog(dialog,value);};
  });
}
initialize();document.addEventListener('astro:page-load',initialize);
// 非 Inspector 表单也使用同一站内离开保护；浏览器刷新只使用原生 beforeunload。
document.addEventListener('click',async event=>{
  if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.altKey||event.shiftKey)return;
  if(document.documentElement.dataset.unsaved!=='true'||document.querySelector('[data-inspector][data-dirty=true]'))return;
  const link=(event.target as Element).closest<HTMLAnchorElement>('a[href]');
  if(!link||link.target==='_blank'||link.hasAttribute('download'))return;
  event.preventDefault();event.stopImmediatePropagation();
  if(await businessConfirm('有尚未保存的修改，是否放弃？')){document.documentElement.dataset.unsaved='false';void navigate(link.href);}
},true);
document.addEventListener('submit',async event=>{
  const form=event.target;
  if(!(form instanceof HTMLFormElement)||form.getAttribute('method')?.toLowerCase()!=='get'||document.documentElement.dataset.unsaved!=='true'||document.querySelector('[data-inspector][data-dirty=true]'))return;
  event.preventDefault();event.stopImmediatePropagation();
  if(await businessConfirm('有尚未保存的修改，是否放弃？')){document.documentElement.dataset.unsaved='false';form.requestSubmit();}
},true);
window.addEventListener('beforeunload',event=>{if(document.documentElement.dataset.unsaved==='true')event.preventDefault();});
