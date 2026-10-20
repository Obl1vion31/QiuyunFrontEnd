import './business-data-motion';
/** 成对展开／收起，不改写条形比例或复盘事实。 */
const active=new Map<HTMLDetailsElement,()=>void>();
const reduced=()=>matchMedia('(prefers-reduced-motion:reduce)').matches;
function initialize(){
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
}

initialize();
document.addEventListener('astro:page-load',initialize);
document.addEventListener('business:promotion-fragment-updated',()=>initialize());
document.addEventListener('astro:before-swap',()=>{for(const finish of active.values())finish();});
matchMedia('(prefers-reduced-motion:reduce)').addEventListener('change',event=>{if(event.matches)for(const finish of active.values())finish();});
