import {refreshPromotionSchedule} from './promotion-timeline';
import './promotion-disclosure';
import {readBusiness} from './business-read';
import {shanghaiDateKey} from '../db/promotion-rules.mjs';
let timer:ReturnType<typeof setTimeout>|undefined,refreshing=false;
let serverOffset=0,renderedDate='';
async function refreshBoundary(){
 const host=document.querySelector<HTMLElement>('[data-promotion-pending-body]');
 if(!host||refreshing)return;
 const estimated=Date.now()+serverOffset,deadline=new Date(`${renderedDate}T00:00:00+08:00`).getTime()+86400000;
 // SSR 到浏览器存在传输时间；临近午夜允许提前读取，但开放仍完全以服务端为准。
 if(shanghaiDateKey(new Date(estimated))===renderedDate&&estimated<deadline-2000&&!host.querySelector('[data-preserved-arrangement-draft]'))return;
 if(document.querySelector('.business-console-workspace[aria-busy=true]')){timer=setTimeout(()=>void refreshBoundary(),500);return;}
 refreshing=true;
 try{
  const fresh=await readBusiness(host,async read=>{const response=await fetch(location.href,{cache:'no-store',headers:{Accept:'text/html'},signal:read.signal});if(!response.ok)throw new Error('日期状态更新失败');return new DOMParser().parseFromString(await response.text(),'text/html');});if(!fresh)return;
  const ids=new Set([...document.querySelectorAll<HTMLElement>('[data-review-post]'),...fresh.querySelectorAll<HTMLElement>('[data-review-post]')].map(post=>post.dataset.reviewPost!));
  for(const id of ids)await refreshPromotionSchedule(id,fresh);
  host.querySelector('[data-date-refresh-error]')?.remove();initialize();
 }catch{
  if(!host.querySelector('[data-date-refresh-error]')){const button=document.createElement('button');button.type='button';button.dataset.dateRefreshError='';button.className='business-action-secondary';button.textContent='日期状态更新失败，点击重试';button.addEventListener('click',()=>void refreshBoundary());host.prepend(button);}
 }finally{refreshing=false;}
}
function initialize(){
 clearTimeout(timer);const host=document.querySelector<HTMLElement>('[data-promotion-pending-body]');if(!host)return;
 const serverTime=Date.parse(host.dataset.serverNow!);serverOffset=serverTime-Date.now();renderedDate=shanghaiDateKey(new Date(serverTime));
 const next=new Date(`${renderedDate}T00:00:00+08:00`).getTime()+86400000;
 timer=setTimeout(()=>void refreshBoundary(),Math.max(10,next-serverTime+100));
 host.querySelectorAll<HTMLButtonElement>('[data-copy-review-id]:not([data-copy-ready])').forEach(button=>{button.dataset.copyReady='true';button.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(button.dataset.copyReviewId!);button.textContent='笔记 ID · 已复制';setTimeout(()=>{if(button.isConnected)button.textContent='笔记 ID · 复制';},1600);}catch{button.textContent='复制失败，请在详情查看';}});});
}
document.addEventListener('astro:page-load',initialize);
document.addEventListener('business:promotion-fragment-updated',initialize);
document.addEventListener('astro:before-swap',()=>clearTimeout(timer));
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')void refreshBoundary();});
document.addEventListener('business:promotion-draft-restored',()=>void refreshBoundary());
window.addEventListener('focus',()=>void refreshBoundary());
initialize();
