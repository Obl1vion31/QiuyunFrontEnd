/** 展示区按真实导航进入播放；表单、筛选与本地数据刷新保持稳定。 */
const reduced=matchMedia('(prefers-reduced-motion:reduce)');
let currentView='',observer:IntersectionObserver|null=null,generation=0;
const animations=new Set<Animation>();
const viewKey=()=>{
 const url=new URL(location.href),view=url.searchParams.get('view');
 if(url.pathname==='/business/daily-promotion-review')return view==='history'?'promotion-history':view==='stage'?'promotion-stage':'promotion-daily';
 if(url.pathname==='/business/non-promotion-review'&&view==='history')return 'nonpromotion-history';
 return '';
};
function stop(){generation++;observer?.disconnect();observer=null;for(const animation of animations)animation.cancel();animations.clear();}
function enter(){
 const view=viewKey(),changed=view!==currentView;currentView=view;
 if(!changed||!view||reduced.matches)return;
 const token=++generation;
 // 导航交换后的实际画面已可见，再开始呈现，避免动画在旧页面之下播完。
 requestAnimationFrame(()=>requestAnimationFrame(()=>{
  if(token!==generation||reduced.matches)return;
  const targets=[...document.querySelectorAll<HTMLElement>(view==='nonpromotion-history'?'[data-nonpromotion-results] [data-result-metric]':'.life-color-track')];
  let visibleIndex=0;
  const play=(target:HTMLElement)=>{
   const lifecycle=target.classList.contains('life-color-track');
   const delay=lifecycle?Math.min(visibleIndex++*40,120):0;
   const nodes=lifecycle?[...target.querySelectorAll<HTMLElement>('.life-fill')]:[target];
   if(lifecycle){
    // Keep a faint, correctly proportioned track present from the first frame.
    const base=target.cloneNode(true) as HTMLElement;base.classList.add('life-base-track');base.classList.remove('life-color-track');base.setAttribute('aria-hidden','true');target.before(base);
    const cleanup=()=>base.remove();
    const animation=target.animate([{clipPath:'inset(0 100% 0 0)'},{clipPath:'inset(0 0 0 0)'}],{duration:480,delay,easing:'cubic-bezier(.16,1,.3,1)',fill:'backwards'});
    animations.add(animation);animation.finished.catch(()=>{}).finally(()=>{animations.delete(animation);cleanup();});
   }else for(const node of nodes){const animation=node.animate([{opacity:.65,transform:'translateY(3px)'},{opacity:1,transform:'none'}],{duration:240,easing:'cubic-bezier(.2,.8,.2,1)'});animations.add(animation);animation.finished.catch(()=>{}).finally(()=>animations.delete(animation));}
  };
  observer=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){observer?.unobserve(entry.target);play(entry.target as HTMLElement);}},{threshold:.15});
  for(const target of targets){const box=target.getBoundingClientRect();if(box.width>0&&box.top<innerHeight&&box.bottom>0)play(target);else observer.observe(target);}
 }));
}
if(document.readyState!=='loading')enter();
document.addEventListener('astro:page-load',enter);
document.addEventListener('astro:before-swap',stop);
reduced.addEventListener('change',()=>{if(reduced.matches)stop();});
