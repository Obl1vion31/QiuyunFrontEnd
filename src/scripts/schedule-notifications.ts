/** 跨页保留一份提醒；复用排期SSR、合并恢复事件，后台暂停一分钟计时器。 */
import type {teamScheduleNotifications} from '../db/schedule-workflow';
type Notifications=Awaited<ReturnType<typeof teamScheduleNotifications>>;
const interval=60_000,pages=new WeakSet<Element>();
let busy=false,invalidated=false,lastRead=Number.NEGATIVE_INFINITY,generation=0,timer:number|undefined;
const panel=()=>document.querySelector<HTMLElement>('[data-schedule-notifications]');

function render(data:Notifications){
 const target=panel();if(!target)return;
 document.querySelectorAll<HTMLElement>('[data-schedule-count]').forEach(node=>{node.textContent=String(data[node.dataset.scheduleCount as 'overdue'|'missingReasons'|'pendingApprovals']??0);});
 const status=target.querySelector('[data-schedule-notification-status]');if(status)status.textContent='';
 target.querySelector<HTMLElement>('[data-schedule-notification-error]')!.hidden=true;
 target.setAttribute('aria-busy','false');
 document.querySelector('[data-schedule-count=overdue]')?.closest('a')?.setAttribute('aria-label',`尚未登记 ${data.overdue} 篇`);
 const link=document.querySelector<HTMLElement>('[data-module-id="schedule"]');
 if(link){let badge=link.querySelector<HTMLElement>('[data-mobile-overdue-count]');if(!badge){badge=document.createElement('b');badge.dataset.mobileOverdueCount='';link.append(badge);}badge.hidden=!data.overdue;badge.textContent=String(data.overdue);badge.setAttribute('aria-label',`${data.overdue} 篇尚未登记`);}
 document.dispatchEvent(new CustomEvent('business:notifications-updated',{detail:data}));
}
function arm(){
 clearTimeout(timer);timer=undefined;
 if(document.hidden||!panel())return;
 timer=window.setTimeout(()=>void refresh(),Math.max(1,interval-(performance.now()-lastRead)));
}
async function refresh(){
 if(busy||document.hidden||!panel())return;
 invalidated=false;busy=true;lastRead=performance.now();clearTimeout(timer);
 const target=panel()!,current=generation;target.setAttribute('aria-busy','true');
 try{
  const response=await fetch('/api/business-notifications',{headers:{Accept:'application/json'},cache:'no-store'});
  if(!response.ok)throw new Error('notification-unavailable');
  const data:Notifications=await response.json();
  // 新页面已提供更新的SSR结果时，不让迟到的旧请求覆盖它。
  if(target.isConnected&&current===generation)render(data);
 }catch{
  if(target.isConnected&&current===generation){const status=target.querySelector('[data-schedule-notification-status]');if(status)status.textContent='提醒暂不可用，稍后重试';target.querySelector<HTMLElement>('[data-schedule-notification-error]')!.hidden=false;}
 }finally{
  busy=false;if(target.isConnected)target.setAttribute('aria-busy','false');
  if(invalidated&&!document.hidden&&panel())void refresh();else arm();
 }
}
function loadPage(){
 const frame=document.querySelector('.business-console-frame');
 if(!frame||pages.has(frame))return;
 pages.add(frame);
 const snapshot=document.querySelector<HTMLScriptElement>('[data-schedule-notification-snapshot]');
 if(snapshot){
  generation++;render(JSON.parse(snapshot.textContent!));lastRead=performance.now();
  if(invalidated)void refresh();else arm();
 }else void refresh();
}
document.addEventListener('astro:page-load',loadPage);
document.addEventListener('visibilitychange',()=>{if(document.hidden){clearTimeout(timer);timer=undefined;}else void refresh();});
document.addEventListener('business:workflow-updated',()=>{invalidated=true;void refresh();});
window.addEventListener('focus',()=>void refresh());
loadPage();
