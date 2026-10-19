/** 生命周期只在首次进入对应视图时呈现；局部保存与读取详情不重播。 */
const enteredViews=new Set<string>();
const active=new Map<HTMLDetailsElement,()=>void>();
const reduced=()=>matchMedia('(prefers-reduced-motion:reduce)').matches;
function initialize(enter=false){
 document.querySelectorAll<HTMLDetailsElement>('details[data-promotion-data]:not([data-disclosure-ready])').forEach(details=>{
  const summary=details.querySelector<HTMLElement>(':scope>summary')!,body=details.querySelector<HTMLElement>(':scope>.promotion-expanded-data')!;
  if(!summary||!body)return;
  details.dataset.disclosureReady='true';
  let target=details.open,revision=0,animations:Animation[]=[];
  const reset=()=>{body.style.removeProperty('height');body.style.removeProperty('overflow');body.style.removeProperty('opacity');body.inert=false;delete details.dataset.collapsing;};
  const finish=()=>{revision++;animations.forEach(animation=>animation.cancel());animations=[];details.open=target;reset();active.delete(details);};
  summary.addEventListener('click',event=>{
   event.preventDefault();
   // 已经展开的 SSR／刷新节点仍以真实 open 为准；连续点击则反转当前目标。
   if(!active.has(details))target=details.open;
   target=!target;
   const token=++revision,from=details.open?body.getBoundingClientRect().height:0,opacity=details.open?Number(getComputedStyle(body).opacity):0,padding=details.open?getComputedStyle(body).paddingTop:'0px';
   animations.forEach(animation=>animation.cancel());animations=[];reset();
   if(reduced()){details.open=target;active.delete(details);return;}
   details.open=true;
   const to=target?body.getBoundingClientRect().height:0,toPadding=target?getComputedStyle(body).paddingTop:'0px';
   body.style.overflow='hidden';body.inert=!target;
   if(!target){details.dataset.collapsing='true';if(body.contains(document.activeElement))summary.focus({preventScroll:true});}
   const options={duration:220,easing:'cubic-bezier(.2,.8,.2,1)',fill:'both' as FillMode};
   animations=[body.animate([{height:`${from}px`,paddingTop:padding,opacity},{height:`${to}px`,paddingTop:toPadding,opacity:target?1:0}],options)];
   active.set(details,finish);
   Promise.all(animations.map(animation=>animation.finished.catch(()=>{}))).then(()=>{if(token===revision)finish();});
  });
 });
 if(!enter)return;
 const view=new URL(location.href).searchParams.get('view')==='history'?'history':'daily';
 if(enteredViews.has(view))return;
 const fills=[...document.querySelectorAll<HTMLElement>('.life-fill')].filter(node=>{const box=node.getBoundingClientRect();return box.width>0&&box.top<innerHeight&&box.bottom>0;});
 if(!fills.length)return;
 enteredViews.add(view);
 if(!reduced())fills.forEach(fill=>fill.animate([{transform:'scaleX(0)'},{transform:'scaleX(1)'}],{duration:320,easing:'cubic-bezier(.2,.8,.2,1)'}));
}
initialize(true);
document.addEventListener('astro:page-load',()=>initialize(true));
document.addEventListener('business:promotion-fragment-updated',()=>initialize());
document.addEventListener('astro:before-swap',()=>{for(const finish of active.values())finish();});
matchMedia('(prefers-reduced-motion:reduce)').addEventListener('change',event=>{if(event.matches)for(const finish of active.values())finish();});
