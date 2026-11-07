import type {TransitionBeforePreparationEvent, TransitionBeforeSwapEvent} from 'astro:transitions/client';

// Only layout is described here. No page data, document reads or speculative API requests.
type Layout = 'review' | 'results' | 'calendar' | 'matrix' | 'daily' | 'records' | 'dashboard' | 'guide';
const destinations: Record<string, {title:string; layout:Layout; subtitle?:string}> = {
  '/business/annual-plan': {title:'总周期规划',layout:'matrix'},
  '/business/operations-schedule': {title:'排期管理',layout:'calendar'},
  '/business/daily-promotion-review': {title:'推广帖复盘',layout:'daily',subtitle:'每日数据 · 历史总览'},
  '/business/non-promotion-review': {title:'非推广复盘',layout:'review',subtitle:'同学科、同分类、同节点比较'},
  '/business/meeting-review': {title:'例会总览',layout:'records'},
  '/business/monthly-operations': {title:'月度运营',layout:'dashboard'},
  '/business/settings': {title:'系统设置',layout:'records'},
};
const bone = (width='68%', height=12) => `<span class="navigation-bone" style="--bone-width:${width};--bone-height:${height}px"></span>`;
const stack = () => `<div class="navigation-stack">${bone('min(220px,80%)')}${bone('104px',10)}</div>`;
function records(labels:string[], kind:string, count=8) {
  return `<section class="navigation-records navigation-records--${kind}"><div class="navigation-record-head">${labels.map(label=>`<span>${label}</span>`).join('')}</div>${Array.from({length:count},()=>`<div class="navigation-record-row">${labels.map((_,index)=>`<div>${index===1?stack():bone(index===0?'min(188px,85%)':index===labels.length-1?'88px':'64%',index===labels.length-1?34:12)}</div>`).join('')}</div>`).join('')}</section>`;
}
function filters(review=false, selected=false) {
  return `<div class="navigation-filters">${(review?['复盘方式','学科','帖子分类']:['','']).map((label,index)=>`<div><span>${label||bone('56px',10)}</span><div class="navigation-field">${review&&!selected?['常规复盘','全部学科','请先选择学科'][index]:bone('68%',10)}</div></div>`).join('')}</div>`;
}
function layoutFor(url:URL) {
  const destination = destinations[url.pathname];
  if (!destination) return null;
  let layout=destination.layout;
  if (url.pathname.endsWith('/non-promotion-review')&&url.searchParams.get('view')==='history') layout='results';
  if (url.pathname.endsWith('/operations-schedule')&&(url.searchParams.get('display')==='ledger'||['approvals','reasons'].includes(url.searchParams.get('status')??''))) layout='records';
  if (url.pathname.endsWith('/daily-promotion-review')&&url.searchParams.get('view')==='history') layout='records';
  if (url.pathname.endsWith('/settings')&&(url.searchParams.get('view')==='guide'||document.querySelector<HTMLElement>('[data-business-console-sidebar]')?.dataset.accountRole==='employee')) layout='guide';
  return {...destination,layout};
}
function markup(layout:Layout, url:URL) {
  if (layout==='review') return filters(true,Boolean(url.searchParams.get('subject')||url.searchParams.get('category')||url.searchParams.get('mode')&&url.searchParams.get('mode')!=='standard'))+records(['实验日期','帖子','节点','操作'],'review');
  if (layout==='results') return filters(true,true)+records(['帖子分类','轮次','样本','阅读量均值','点击率','3 秒阅读率','明细'],'results',6);
  if (layout==='records') return `<div class="navigation-section-title">${bone('132px',20)}${bone('88px',34)}</div>`+records(url.pathname.endsWith('/settings')?['账号','姓名','角色','状态','操作']:url.pathname.endsWith('/meeting-review')?['会议','时间','状态','操作']:['日期','帖子','状态','操作'],'general',7);
  if (layout==='daily') return `<div class="navigation-overview">${stack()}<div class="navigation-node-track">${Array.from({length:4},()=>bone('15%',24)).join('')}</div></div>`+records(['帖子','状态','消耗','曝光量','阅读量','3 秒阅读率','次日安排'],'daily',6);
  if (layout==='calendar'||layout==='matrix') {
    const calendar=layout==='calendar',columns=calendar?7:12;
    return `<div class="navigation-summary">${Array.from({length:calendar?7:4},()=>stack()).join('')}</div><section class="navigation-calendar ${calendar?'':'navigation-matrix'}"><div class="navigation-section-title">${bone('180px',20)}</div><div class="navigation-calendar-grid" style="--navigation-grid-columns:${columns}">${Array.from({length:columns*(calendar?6:7)},(_,index)=>`<div>${index<columns?bone('38%',10):''}</div>`).join('')}</div></section>`;
  }
  if (layout==='dashboard') return `${filters()}<div class="navigation-summary">${Array.from({length:6},()=>stack()).join('')}</div><div class="navigation-chart-pair">${Array.from({length:2},()=>`<section>${bone('160px',18)}<div class="navigation-chart">${Array.from({length:5},()=>bone('100%',10)).join('')}</div></section>`).join('')}</div>`;
  return `<div class="navigation-guide">${bone('132px',24)}${bone('min(720px,90%)')}<div class="navigation-guide-section">${bone('180px',18)}${records(['类型','使用要点'],'guide',4)}</div><div class="navigation-guide-section">${bone('160px',18)}${records(['规划分类','内容职能'],'guide',3)}</div></div>`;
}

type Pending = {signal:AbortSignal; to:URL; timer:number; messageTimer:number; shown:boolean; swapped:boolean; workspace:HTMLElement; inert:boolean; busy:string|null; focus:HTMLElement|null};
let pending:Pending|undefined;
let arrival:Animation|undefined;
const reduced=matchMedia('(prefers-reduced-motion:reduce)');
const overlay=()=>document.querySelector<HTMLElement>('[data-navigation-loading]');
function position() {
  const loading=overlay(),workspace=document.querySelector<HTMLElement>('.business-console-workspace');
  if (!loading||!workspace) return;
  const bounds=workspace.getBoundingClientRect();
  loading.style.left=`${bounds.left}px`; loading.style.width=`${bounds.width}px`;
}
function clear(restoreFocus=false) {
  const previous=pending; pending=undefined;
  if (previous) {
    clearTimeout(previous.timer); clearTimeout(previous.messageTimer);
    previous.workspace.inert=previous.inert;
    if(previous.busy===null)previous.workspace.removeAttribute('aria-busy');else previous.workspace.setAttribute('aria-busy',previous.busy);
    if(restoreFocus&&previous.focus?.isConnected&&document.activeElement===document.body)previous.focus.focus({preventScroll:true});
  }
  const loading=overlay(); if(loading){loading.hidden=true;loading.querySelector('[data-navigation-surface]')?.replaceChildren();}
  delete document.documentElement.dataset.businessNavigation;
}
function show(state:Pending) {
  if(pending!==state||state.signal.aborted)return;
  const loading=overlay(),target=layoutFor(state.to);if(!loading||!target)return;
  // Leave the glass/sidebar containing block so fixed geometry is always the workspace's.
  document.body.append(loading);
  loading.querySelector('[data-navigation-surface]')!.replaceChildren(loading.querySelector<HTMLTemplateElement>('[data-navigation-template]')!.content.cloneNode(true));
  loading.querySelector('[data-navigation-content]')!.innerHTML=markup(target.layout,state.to);
  loading.dataset.layout=target.layout;
  loading.querySelector('.business-toolbar__title strong')!.textContent=target.title;
  loading.querySelector('.business-toolbar__title small')!.textContent=target.subtitle??' ';
  const center=loading.querySelector('[data-navigation-center]')!;
  if(target.layout==='review'||target.layout==='results'){
    const view=state.to.searchParams.get('view')??'pending';
    for(const link of center.querySelectorAll<HTMLAnchorElement>('a')){const active=new URL(link.href).searchParams.get('view')===view;link.classList.toggle('active',active);if(active)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');}
  }else center.innerHTML=bone('168px',32);
  loading.querySelector('[data-navigation-announcement]')!.textContent=`正在打开${target.title}`;
  const message=loading.querySelector<HTMLElement>('[data-navigation-wait]')!;message.hidden=true;message.textContent=`正在打开${target.title}…`;
  position();loading.hidden=false;state.shown=true;state.workspace.inert=true;state.workspace.setAttribute('aria-busy','true');
  document.documentElement.dataset.businessNavigation='loading';
  state.messageTimer=window.setTimeout(()=>{if(pending===state)message.hidden=false;},1080);
}
document.addEventListener('astro:before-preparation',event=>{
  const transition=event as TransitionBeforePreparationEvent;
  const continueLoading=pending?.shown;
  clear();arrival?.cancel();arrival=undefined;
  if(transition.formData||transition.to.origin!==location.origin||!layoutFor(transition.to))return;
  const workspace=document.querySelector<HTMLElement>('.business-console-workspace');if(!workspace)return;
  const state:Pending={signal:transition.signal,to:transition.to,timer:0,messageTimer:0,shown:false,swapped:false,workspace,inert:workspace.inert,busy:workspace.getAttribute('aria-busy'),focus:document.activeElement instanceof HTMLElement?document.activeElement:null};
  pending=state;document.documentElement.dataset.businessNavigation='preparing';
  if(continueLoading)show(state);else state.timer=window.setTimeout(()=>show(state),120);
  // A replacement navigation is dispatched before the next paint. Keep its loading surface continuous.
  transition.signal.addEventListener('abort',()=>requestAnimationFrame(()=>{if(pending===state)clear(true);}),{once:true});
  const loader=transition.loader;
  transition.loader=async()=>{
    try{
      await loader();
      if(pending===state&&!state.signal.aborted){
        // Native transition snapshots can outlast a fast read; don't start loading after it is ready.
        if(!state.shown)clearTimeout(state.timer);
        if(transition.defaultPrevented)clear(true);
      }
    }
    catch(error){if(pending===state&&!state.signal.aborted)clear(true);throw error;}
  };
});
document.addEventListener('astro:before-swap',event=>{
  const transition=event as TransitionBeforeSwapEvent;
  if(!pending||transition.signal!==pending.signal)return;
  if(!transition.newDocument.querySelector('.business-console-workspace')){clear();return;}
  pending.swapped=true;
  if(pending.shown){
    // Skipping the browser snapshot intentionally rejects ready; keep unrelated failures visible.
    void transition.viewTransition.ready.catch(error=>{if(error?.name!=='AbortError')throw error;});
    transition.viewTransition.skipTransition();
  }
});
document.addEventListener('astro:page-load',()=>{
  if(pending&&!pending.swapped)return;
  const shown=pending?.shown;clear();
  const content=document.querySelector<HTMLElement>('.business-console-workspace .business-console-content');
  if(shown&&content&&!reduced.matches)arrival=content.animate([{opacity:.65},{opacity:1}],{duration:180,easing:'cubic-bezier(.2,.8,.2,1)'});
});
addEventListener('resize',position,{passive:true});
addEventListener('pagehide',()=>{clear();arrival?.cancel();});
reduced.addEventListener('change',()=>{if(reduced.matches)arrival?.cancel();});
