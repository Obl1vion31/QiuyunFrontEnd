/** 展示区只在真实进入时播放；表单、筛选及局部保存不重播已发生历程。 */
const reduced=matchMedia('(prefers-reduced-motion:reduce)');
let currentView='',observer:IntersectionObserver|null=null,generation=0;
const animations=new Set<Animation>();
const waiting=new Set<HTMLElement>();
let resumeVisible:((target:HTMLElement)=>void)|undefined;
const viewKey=()=>{
 const url=new URL(location.href),view=url.searchParams.get('view');
 if(url.pathname==='/business/daily-promotion-review')return view==='history'?'promotion-history':view==='stage'?'promotion-stage':'promotion-daily';
 if(url.pathname==='/business/non-promotion-review'&&view==='history')return 'nonpromotion-history';
 return '';
};
function remember(animation:Animation){animations.add(animation);animation.finished.catch(()=>{}).finally(()=>animations.delete(animation));}
function stop(){generation++;observer?.disconnect();observer=null;waiting.clear();resumeVisible=undefined;for(const animation of animations)animation.cancel();animations.clear();}
function enter(){
 const view=viewKey(),changed=view!==currentView;currentView=view;
 if(!changed||!view||reduced.matches)return;
 const token=++generation;
 requestAnimationFrame(()=>requestAnimationFrame(()=>{
  if(token!==generation||reduced.matches||view!==viewKey())return;
  const lifecycle=view!=='nonpromotion-history';
  const targets=[...document.querySelectorAll<HTMLElement>(lifecycle?'.promotion-stage-nodes':'[data-nonpromotion-results] [data-result-metric]')];
  const play=(target:HTMLElement)=>{
   if(token!==generation||reduced.matches||view!==viewKey()||!target.isConnected)return;if(document.visibilityState!=='visible'){waiting.add(target);return;}waiting.delete(target);
   if(!lifecycle){remember(target.animate([{opacity:.45,transform:'translateY(3px)'},{opacity:1,transform:'none'}],{duration:240,easing:'cubic-bezier(.2,.8,.2,1)'}));return;}
   const nodes=[...target.querySelectorAll<HTMLElement>('[data-stage-node]')],connectors=[...target.querySelectorAll<HTMLElement>('[data-stage-connector]')];
   const step=nodes.length>1?360/(nodes.length-1):0;
   nodes.forEach((node,index)=>remember(node.animate([{opacity:0,transform:'translateX(-4px)'},{opacity:1,transform:'none'}],{duration:160,delay:index*step,easing:'cubic-bezier(.2,.8,.2,1)',fill:'backwards'})));
   connectors.forEach((connector,index)=>remember(connector.animate([{opacity:0,transform:'scaleX(0)'},{opacity:1,transform:'scaleX(1)'}],{duration:120,delay:index*step+100,easing:'ease-out',fill:'backwards'})));
   const current=target.querySelector<HTMLElement>('.is-current>i');if(current)remember(current.animate([{boxShadow:'0 0 0 0 transparent'},{boxShadow:'0 0 0 5px var(--node-soft)',offset:.5},{boxShadow:'0 0 0 0 transparent'}],{duration:160,delay:nodes.length>1?440:160,easing:'ease-out'}));
   if(target.scrollWidth>target.clientWidth)target.scrollLeft=target.scrollWidth-target.clientWidth;
  };
  resumeVisible=play;
  observer=new IntersectionObserver(entries=>{
   if(token!==generation||reduced.matches||view!==viewKey())return;
   for(const entry of entries)if(entry.isIntersecting){observer?.unobserve(entry.target);play(entry.target as HTMLElement);}
  },{threshold:.15});
  for(const target of targets){const box=target.getBoundingClientRect();if(box.width>0&&box.top<innerHeight&&box.bottom>0)play(target);else observer.observe(target);}
 }));
}
if(document.readyState!=='loading')enter();
document.addEventListener('astro:page-load',enter);
document.addEventListener('astro:before-swap',stop);
reduced.addEventListener('change',()=>{if(reduced.matches)stop();});

document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')for(const target of [...waiting]){const rect=target.getBoundingClientRect();if(rect.bottom>0&&rect.top<innerHeight)resumeVisible?.(target);else observer?.observe(target);}});
