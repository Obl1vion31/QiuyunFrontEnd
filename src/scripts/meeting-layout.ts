let cleanup:(()=>void)|undefined;
function initialize(){
 cleanup?.();const host=document.querySelector<HTMLElement>('.weekly-report,.weekly-frozen');if(!host)return;
 let frame=0;
 const equal=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{const cards=[...host.querySelectorAll<HTMLElement>('.weekly-stage-card')].filter(n=>n.getClientRects().length);for(const card of cards)card.style.minHeight='';const height=Math.ceil(Math.max(0,...cards.map(card=>card.getBoundingClientRect().height)));for(const card of cards)card.style.minHeight=height+'px';});};
 const observer=new MutationObserver(equal);observer.observe(host,{childList:true,subtree:true,attributes:true,attributeFilter:['open','hidden']});
 window.addEventListener('resize',equal);void document.fonts.ready.then(equal);equal();
 cleanup=()=>{observer.disconnect();window.removeEventListener('resize',equal);cancelAnimationFrame(frame);};
}
document.addEventListener('astro:page-load',initialize);
document.addEventListener('astro:before-swap',()=>cleanup?.());
initialize();
