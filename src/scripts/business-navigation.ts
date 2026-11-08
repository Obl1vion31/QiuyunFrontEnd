import type {TransitionBeforePreparationEvent,TransitionBeforeSwapEvent} from 'astro:transitions/client';

type Pending={signal:AbortSignal;timer:number;messageTimer:number;shown:boolean;swapped:boolean;workspace:HTMLElement;busy:string|null;label:string};
let pending:Pending|undefined;
let arrival:Animation|undefined;
const reduced=matchMedia('(prefers-reduced-motion:reduce)');
const feedback=()=>document.querySelector<HTMLElement>('[data-navigation-loading]');
function position(){
  if(!pending?.shown)return;
  const loading=feedback(),workspace=pending.workspace;
  if(!loading)return;
  const bounds=workspace.getBoundingClientRect(),toolbar=workspace.querySelector('.business-toolbar')?.getBoundingClientRect();
  loading.style.left=`${bounds.left}px`;loading.style.width=`${bounds.width}px`;loading.style.top=`${Math.max(0,(toolbar?.bottom??0)-1)}px`;
}
function clear(){
  const previous=pending;pending=undefined;
  if(previous){
    clearTimeout(previous.timer);clearTimeout(previous.messageTimer);
    if(previous.busy===null)previous.workspace.removeAttribute('aria-busy');else previous.workspace.setAttribute('aria-busy',previous.busy);
  }
  const loading=feedback();if(loading)loading.hidden=true;
  delete document.documentElement.dataset.businessNavigation;
}
function show(state:Pending){
  if(pending!==state||state.signal.aborted)return;
  const loading=feedback();if(!loading)return;
  // Glass sidebars establish a fixed-position containing block; measure the real workspace independently.
  document.body.append(loading);state.shown=true;position();
  const message=loading.querySelector<HTMLElement>('[data-navigation-wait]')!;
  message.textContent=`正在打开${state.label}…`;message.hidden=true;
  loading.querySelector('[data-navigation-announcement]')!.textContent=`正在打开${state.label}`;
  loading.hidden=false;state.workspace.setAttribute('aria-busy','true');document.documentElement.dataset.businessNavigation='loading';
}
document.addEventListener('astro:before-preparation',event=>{
  const transition=event as TransitionBeforePreparationEvent,continueLoading=pending?.shown;
  clear();arrival?.cancel();arrival=undefined;
  if(transition.formData||transition.to.origin!==location.origin||!(transition.to.pathname.startsWith('/business/')||transition.to.pathname==='/organization'))return;
  const workspace=document.querySelector<HTMLElement>('.business-console-workspace');if(!workspace)return;
  const link=[...document.querySelectorAll<HTMLAnchorElement>('[data-module-href]')].find(link=>new URL(link.dataset.moduleHref!,location.origin).pathname===transition.to.pathname);
  const state:Pending={signal:transition.signal,timer:0,messageTimer:0,shown:false,swapped:false,workspace,busy:workspace.getAttribute('aria-busy'),label:link?.querySelector('strong')?.textContent?.trim()||'页面'};
  pending=state;document.documentElement.dataset.businessNavigation='preparing';
  if(continueLoading)show(state);else state.timer=window.setTimeout(()=>show(state),120);
  state.messageTimer=window.setTimeout(()=>{if(pending===state&&state.shown){const message=feedback()?.querySelector<HTMLElement>('[data-navigation-wait]');if(message)message.hidden=false;}},1200);
  // An abort may be immediately replaced by another navigation; avoid flashing the line off between them.
  transition.signal.addEventListener('abort',()=>requestAnimationFrame(()=>{if(pending===state)clear();}),{once:true});
  const loader=transition.loader;
  transition.loader=async()=>{
    try{await loader();if(pending===state&&!state.signal.aborted){if(!state.shown)clearTimeout(state.timer);if(transition.defaultPrevented)clear();}}
    catch(error){if(pending===state&&!state.signal.aborted)clear();throw error;}
  };
});
document.addEventListener('astro:before-swap',event=>{
  const transition=event as TransitionBeforeSwapEvent;
  if(!pending||transition.signal!==pending.signal)return;
  if(!transition.newDocument.querySelector('.business-console-workspace')){clear();return;}
  pending.swapped=true;
  // Native snapshots also overlap on fast history reads; A always hands off in place.
  // Skipping a native snapshot intentionally rejects ready.
  void transition.viewTransition.ready.catch(error=>{if(error?.name!=='AbortError')throw error;});
  transition.viewTransition.skipTransition();
});
document.addEventListener('astro:page-load',()=>{
  if(pending&&!pending.swapped)return;
  const shown=pending?.shown;clear();
  const content=document.querySelector<HTMLElement>('.business-console-workspace .business-console-content');
  if(shown&&content&&!reduced.matches)arrival=content.animate([{opacity:.65},{opacity:1}],{duration:180,easing:'cubic-bezier(.16,1,.3,1)'});
});
addEventListener('resize',position,{passive:true});
addEventListener('scroll',position,{passive:true});
addEventListener('pagehide',()=>{clear();arrival?.cancel();});
reduced.addEventListener('change',()=>{if(reduced.matches)arrival?.cancel();});
