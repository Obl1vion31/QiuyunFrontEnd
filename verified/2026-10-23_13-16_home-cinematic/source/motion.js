/** 首屏停留/换位与 A 的滚动归位共享同一批真实封面，不拦截滚轮。 */
(()=>{
 const hero=document.querySelector('.hero'),frame=document.querySelector('.hero__frame'),scene=document.querySelector('.cover-scene');
 const cards=[...document.querySelectorAll('[data-cover]')],stages=[...document.querySelectorAll('[data-stage]')];
 const activeText=document.querySelector('[data-active-stage]'),controls=document.querySelector('.cover-controls'),toggle=document.querySelector('.cover-toggle');
 const preference=matchMedia('(prefers-reduced-motion: reduce)');
 const HOLD=2600,MOVE=1150,CYCLE=HOLD+MOVE;
 const clamp=n=>Math.max(0,Math.min(1,n)),smooth=n=>n*n*(3-2*n),ease=n=>n*n*n*(n*(n*6-15)+10),mix=(a,b,p)=>a+(b-a)*p;
 const offset=(i,phase)=>((i-3-phase+4)%8+8)%8-4;
 let request=0,last=0,elapsed=0,phase=0,heldPhase=0,wasScrolling=false,visible=true,paused=false,currentStage=-1,dirty=true,lastPhase=-1,lastProgress=-1;
 let order=cards.map((_,i)=>i);
 const pose=(i,p,width,height)=>{const d=offset(i,p),a=Math.abs(d),edge=(1-smooth(clamp((a-.9)/2.2)))**1.7;return{x:(.5+d*.165)*width,y:height*.70-Math.min(a,3.8)**2*6.2,scale:1.08-Math.min(a,3.8)*.105,rotate:-d*2.2,yaw:-d*10,opacity:edge};};
 const draw=(timestamp)=>{
  request=0;
  if(!visible||document.hidden){last=0;return;}
  const bounds=hero.getBoundingClientRect(),distance=Math.max(1,hero.offsetHeight-frame.offsetHeight);
  const reduced=preference.matches,p=reduced?0:clamp(-bounds.top/distance),scrolling=p>.0001;
  if(scrolling&&!wasScrolling){heldPhase=phase;order=cards.map((_,i)=>i).sort((a,b)=>offset(a,heldPhase)-offset(b,heldPhase));}
  if(!scrolling&&!paused&&!reduced){if(last&&!wasScrolling)elapsed+=Math.min(64,timestamp-last);const cycle=elapsed/CYCLE,part=elapsed%CYCLE;phase=Math.floor(cycle)+ease(clamp((part-HOLD)/MOVE));}
  if(!scrolling)heldPhase=phase;
  last=timestamp;wasScrolling=scrolling;
  const stage=reduced?0:Math.min(5,Math.floor(p*6));
  if(stage!==currentStage){stages.forEach((n,i)=>{n.toggleAttribute('aria-current',i===stage);if(i===stage)n.setAttribute('aria-current','step');n.classList.toggle('is-past',i<stage);});activeText.textContent=stages[stage].querySelector('strong').textContent;currentStage=stage;}
  controls.hidden=scrolling||reduced;
  const shownPhase=reduced?0:heldPhase,settle=reduced?0:smooth(clamp((p-.2)/.55));
  if(dirty||shownPhase!==lastPhase||p!==lastProgress){
   const width=scene.clientWidth,height=frame.offsetHeight;
   hero.style.setProperty('--progress',String(p));
   scene.style.setProperty('--edge-start',`${mix(19,0,settle)}%`);scene.style.setProperty('--edge-end',`${mix(81,100,settle)}%`);
   cards.forEach((card,i)=>{const start=pose(i,shownPhase,width,height),rank=order.indexOf(i);
    const finalScale=Math.max(116,Math.min(148,innerWidth*.1025))*.82/card.offsetWidth;
    const x=mix(start.x,(.065+rank*.1243)*width,settle),y=mix(start.y,.69*height,settle),scale=mix(start.scale,finalScale,settle),angle=mix(start.rotate,0,settle),yaw=mix(start.yaw,0,settle);
    card.style.transform=`translate3d(${(x-card.offsetWidth/2).toFixed(2)}px,${(y-card.offsetHeight/2).toFixed(2)}px,0) perspective(1100px) rotateY(${yaw.toFixed(2)}deg) rotate(${angle.toFixed(2)}deg) scale(${scale.toFixed(4)})`;
    card.style.opacity=mix(start.opacity,1,settle).toFixed(4);card.style.zIndex=String(Math.round(100-Math.abs(offset(i,shownPhase))*10));
   });
   hero.dataset.progress=p.toFixed(4);hero.dataset.phase=shownPhase.toFixed(5);hero.dataset.motionReady='true';lastPhase=shownPhase;lastProgress=p;dirty=false;
  }
  hero.dataset.playback=reduced?'reduced':scrolling?'scroll':paused?'paused':(elapsed%CYCLE<HOLD?'hold':'advance');
  if(!scrolling&&!paused&&!reduced)request=requestAnimationFrame(draw);
 };
 const update=()=>{dirty=true;if(visible&&!document.hidden&&!request)request=requestAnimationFrame(draw);};
 const observer=new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;last=0;if(visible)update();else if(request){cancelAnimationFrame(request);request=0;}},{rootMargin:'0px'});observer.observe(hero);
 toggle.addEventListener('click',()=>{paused=!paused;last=0;toggle.setAttribute('aria-pressed',String(paused));toggle.setAttribute('aria-label',paused?'播放封面轮播':'暂停封面轮播');toggle.querySelector('[data-toggle-label]').textContent=paused?'播放轮播':'暂停轮播';toggle.firstElementChild.textContent=paused?'▷':'Ⅱ';if(paused&&request){cancelAnimationFrame(request);request=0;}update();});
 addEventListener('scroll',update,{passive:true});addEventListener('resize',update);
 const visibility=()=>{last=0;if(document.hidden&&request){cancelAnimationFrame(request);request=0;}else update();};document.addEventListener('visibilitychange',visibility);
 preference.addEventListener('change',()=>{last=0;document.body.classList.toggle('motion-reduced',preference.matches);update();});document.body.classList.toggle('motion-reduced',preference.matches);
 cards.forEach(card=>{const img=card.querySelector('img');img.addEventListener('error',()=>card.classList.add('image-failed'));if(img.complete&&img.naturalWidth===0)card.classList.add('image-failed');});
 update();
 // 缓存返回时保留同一构图与监听，不能因 pagehide 永久停止滚动响应。
 addEventListener('pagehide',()=>{if(request)cancelAnimationFrame(request);request=0;last=0;});
 addEventListener('pageshow',()=>{last=0;update();});
})();
