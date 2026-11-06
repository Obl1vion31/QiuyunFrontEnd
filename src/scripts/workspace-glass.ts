/** 视觉反馈只作用于标记区域，不拦截点击，不读写业务数据。 */
let dispose:(()=>void)|undefined;
function mount(){
 dispose?.();
 const root=document.querySelector<HTMLElement>('[data-glass-surface]');if(!root)return;
 const abort=new AbortController(),signal=abort.signal,motion=matchMedia('(prefers-reduced-motion: reduce)');
 const targets='[data-surface-press="directional"]';
 const animations=new Map<HTMLElement,Animation>(),pressed=new Set<HTMLElement>(),disclosures=new Map<HTMLDetailsElement,{animation:Animation;expanded:boolean}>();
 const identify=(target:EventTarget|null)=>target instanceof Element?target.closest<HTMLElement>(targets):null;
 const animate=(el:HTMLElement,frames:Keyframe[],options:KeyframeAnimationOptions)=>{animations.get(el)?.cancel();const a=el.animate(frames,{fill:'none',...options});animations.set(el,a);a.onfinish=()=>{if(animations.get(el)===a&&options.fill!=='forwards')animations.delete(el);};return a;};
 const release=(el:HTMLElement)=>{
  if(!pressed.delete(el))return;
  const current=getComputedStyle(el).transform;el.removeAttribute('data-surface-pressed');
  if(!el.isConnected){animations.get(el)?.cancel();animations.delete(el);return;}
  if(motion.matches){animations.get(el)?.cancel();animations.delete(el);return;}
  const start=Array.from(new DOMMatrix(current==='none'?undefined:current).toFloat64Array()),identity=Array.from(new DOMMatrix().toFloat64Array());
  const duration=380,zeta=.82,omega=25,wd=omega*Math.sqrt(1-zeta*zeta);
  const frames=Array.from({length:25},(_,i)=>{
   const t=i/24*duration/1000,d=i===24?0:Math.exp(-zeta*omega*t)*(Math.cos(wd*t)+zeta/Math.sqrt(1-zeta*zeta)*Math.sin(wd*t));
   return {transform:'matrix3d('+identity.map((v,k)=>v+(start[k]-v)*d).join(',')+')',offset:i/24};
  });
  animate(el,frames,{duration,easing:'linear'});
 };
 const down=(el:HTMLElement,x=.5,y=.5)=>{
  if(el.matches(':disabled,[aria-disabled=true]'))return;
  el.style.setProperty('--press-x',x*100+'%');el.style.setProperty('--press-y',y*100+'%');el.dataset.surfacePressed='';pressed.add(el);
  if(!motion.matches)animate(el,[{transform:getComputedStyle(el).transform},{transform:'perspective(700px) rotateX('+((.5-y)*2.4)+'deg) rotateY('+((x-.5)*2.4)+'deg) translateY(1px) scale(.986)'}],{duration:90,easing:'cubic-bezier(.2,.8,.2,1)',fill:'forwards'});
 };
 root.addEventListener('pointerdown',e=>{const el=identify(e.target);if(!el||e.button!==0||e.pointerType!=='mouse')return;const r=el.getBoundingClientRect();down(el,(e.clientX-r.left)/r.width,(e.clientY-r.top)/r.height);},{signal});
 root.addEventListener('pointerout',e=>{const el=identify(e.target);if(el&&(!(e.relatedTarget instanceof Node)||!el.contains(e.relatedTarget)))release(el);},{signal});
 window.addEventListener('pointerup',()=>[...pressed].forEach(release),{signal});
 window.addEventListener('pointercancel',()=>[...pressed].forEach(release),{signal});
 root.addEventListener('keydown',e=>{const el=identify(e.target);if(el&&!e.repeat&&(e.key==='Enter'||e.key===' '&&el.tagName==='BUTTON'))down(el);},{signal});
 root.addEventListener('keyup',()=>[...pressed].forEach(release),{signal});
 root.addEventListener('focusout',()=>[...pressed].forEach(release),{signal});
 window.addEventListener('blur',()=>[...pressed].forEach(release),{signal});
 document.addEventListener('visibilitychange',()=>{if(document.hidden)[...pressed].forEach(release);},{signal});
 // 只读来源保持原生details语义；业务分类展开仍由各页控制器负责。
 root.addEventListener('click',e=>{
  const summary=e.target instanceof Element?e.target.closest<HTMLElement>('.monthly-core .ps-disclosure>summary,[data-monthly-operations] .ps-disclosure>summary,.surface-resource-meta>summary'):null;
  if(!summary||motion.matches||e.target instanceof Element&&e.target.closest('a,button,input,select'))return;
  const detail=summary.parentElement as HTMLDetailsElement;if(!detail)return;e.preventDefault();
  const previous=disclosures.get(detail),expanded=!(previous?.expanded??detail.open),from=detail.getBoundingClientRect().height;
  previous?.animation.cancel();detail.open=true;detail.style.height='auto';
  const to=expanded?detail.getBoundingClientRect().height:summary.getBoundingClientRect().height;
  detail.dataset.motionActive='';detail.dataset.motionExpanded=String(expanded);
  const a=detail.animate([{height:from+'px'},{height:to+'px'}],{duration:220,easing:'cubic-bezier(.2,.8,.2,1)'});
  disclosures.set(detail,{animation:a,expanded});
  a.onfinish=()=>{if(disclosures.get(detail)?.animation!==a)return;detail.open=expanded;delete detail.dataset.motionActive;delete detail.dataset.motionExpanded;detail.style.removeProperty('height');disclosures.delete(detail);};
 },{signal});
 const reduce=()=>{if(motion.matches){[...pressed].forEach(release);animations.forEach(a=>a.cancel());animations.clear();disclosures.forEach((v,d)=>{v.animation.cancel();d.open=v.expanded;delete d.dataset.motionActive;delete d.dataset.motionExpanded;});disclosures.clear();}};
 motion.addEventListener('change',reduce,{signal});
 dispose=()=>{abort.abort();animations.forEach(a=>a.cancel());pressed.forEach(el=>el.removeAttribute('data-surface-pressed'));disclosures.forEach((v,d)=>{v.animation.cancel();d.open=v.expanded;delete d.dataset.motionActive;delete d.dataset.motionExpanded;});};
}
mount();document.addEventListener('astro:page-load',mount);document.addEventListener('astro:before-swap',()=>{dispose?.();dispose=undefined;});
