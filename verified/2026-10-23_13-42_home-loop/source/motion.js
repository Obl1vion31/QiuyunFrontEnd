/** 同一连续相位：首屏停留换组，随 A 纵向进度展开，平带持续横向循环。 */
(()=>{
 const hero=document.querySelector('.hero'),frame=document.querySelector('.hero__frame'),scene=document.querySelector('.cover-scene');
 const cards=[...document.querySelectorAll('[data-cover]')],stages=[...document.querySelectorAll('[data-stage]')];
 const activeText=document.querySelector('[data-active-stage]'),controls=document.querySelector('.cover-controls'),toggle=document.querySelector('.cover-toggle');
 const preference=matchMedia('(prefers-reduced-motion: reduce)'),N=cards.length;
 const HOLD=2600,MOVE=1150,CYCLE=HOLD+MOVE,FLAT_RATE=.22;
 const clamp=n=>Math.max(0,Math.min(1,n)),smooth=n=>n*n*(3-2*n),ease=n=>n*n*n*(n*(n*6-15)+10),mix=(a,b,p)=>a+(b-a)*p;
 const offset=(i,phase)=>((i-3-phase+N/2)%N+N)%N-N/2;
 const idlePhase=t=>Math.floor(t/CYCLE)+ease(clamp((t%CYCLE-HOLD)/MOVE));
 let request=0,last=0,elapsed=0,phase=0,visible=true,paused=false,currentStage=-1,dirty=true,lastPhase=-1,lastProgress=-1;
 const draw=timestamp=>{
  request=0;if(!visible||document.hidden){last=0;return;}
  const bounds=hero.getBoundingClientRect(),distance=Math.max(1,hero.offsetHeight-frame.offsetHeight),reduced=preference.matches;
  const p=reduced?0:clamp(-bounds.top/distance),settle=reduced?0:smooth(clamp((p-.2)/.55));
  if(last&&!paused&&!reduced){const dt=Math.min(64,timestamp-last),before=idlePhase(elapsed);elapsed+=dt;phase+=mix(idlePhase(elapsed)-before,dt/1000*FLAT_RATE,settle);}
  last=timestamp;
  const stage=reduced?0:Math.min(5,Math.floor(p*6));
  if(stage!==currentStage){stages.forEach((n,i)=>{if(i===stage)n.setAttribute('aria-current','step');else n.removeAttribute('aria-current');n.classList.toggle('is-past',i<stage);});activeText.textContent=stages[stage].querySelector('strong').textContent;currentStage=stage;}
  controls.hidden=reduced;
  const shownPhase=reduced?0:phase;
  if(dirty||shownPhase!==lastPhase||p!==lastProgress){
   const width=scene.clientWidth,height=frame.offsetHeight;hero.style.setProperty('--progress',String(p));
   scene.style.setProperty('--edge-start',`${mix(19,3.5,settle)}%`);scene.style.setProperty('--edge-end',`${mix(81,96.5,settle)}%`);
   cards.forEach((card,i)=>{const d=offset(i,shownPhase),a=Math.abs(d),edge=(1-smooth(clamp((a-.9)/2.2)))**1.7;
    const finalScale=Math.max(116,Math.min(148,innerWidth*.1025))*.82/card.offsetWidth;
    const x=(.5+d*mix(.165,.125,settle))*width,y=mix(height*.70-Math.min(a,3.8)**2*6.2,height*.69,settle);
    const scale=mix(1.08-Math.min(a,3.8)*.105,finalScale,settle),angle=-d*2.2*(1-settle),yaw=-d*10*(1-settle);
    card.style.transform=`translate3d(${(x-card.offsetWidth/2).toFixed(3)}px,${(y-card.offsetHeight/2).toFixed(3)}px,0) perspective(1100px) rotateY(${yaw.toFixed(3)}deg) rotate(${angle.toFixed(3)}deg) scale(${scale.toFixed(5)})`;
    card.style.opacity=mix(edge,1,settle).toFixed(5);card.style.zIndex=String(Math.round(100-a*10));
   });
   hero.dataset.progress=p.toFixed(5);hero.dataset.phase=shownPhase.toFixed(6);hero.dataset.settle=settle.toFixed(5);hero.dataset.motionReady='true';lastPhase=shownPhase;lastProgress=p;dirty=false;
  }
  hero.dataset.playback=reduced?'reduced':paused?'paused':settle===1?'flat-loop':settle>0?'unfolding':elapsed%CYCLE<HOLD?'hold':'advance';
  if(!paused&&!reduced)request=requestAnimationFrame(draw);
 };
 const update=()=>{dirty=true;if(visible&&!document.hidden&&!request)request=requestAnimationFrame(draw);};
 // 只在封面所在首屏实际可见时运行，不因下方段落可见而继续消耗动画。
 const observer=new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;last=0;if(visible)update();else if(request){cancelAnimationFrame(request);request=0;}},{rootMargin:'0px'});observer.observe(frame);
 toggle.addEventListener('click',()=>{paused=!paused;last=0;toggle.setAttribute('aria-pressed',String(paused));toggle.setAttribute('aria-label',paused?'播放封面轮播':'暂停封面轮播');toggle.querySelector('[data-toggle-label]').textContent=paused?'播放轮播':'暂停轮播';toggle.firstElementChild.textContent=paused?'▷':'Ⅱ';if(paused&&request){cancelAnimationFrame(request);request=0;}update();});
 addEventListener('scroll',update,{passive:true});addEventListener('resize',update);
 const visibility=()=>{last=0;if(document.hidden&&request){cancelAnimationFrame(request);request=0;}else update();};document.addEventListener('visibilitychange',visibility);
 preference.addEventListener('change',()=>{last=0;document.body.classList.toggle('motion-reduced',preference.matches);update();});document.body.classList.toggle('motion-reduced',preference.matches);
 cards.forEach(card=>{const img=card.querySelector('img');img.addEventListener('error',()=>card.classList.add('image-failed'));if(img.complete&&img.naturalWidth===0)card.classList.add('image-failed');});
 update();addEventListener('pagehide',()=>{if(request)cancelAnimationFrame(request);request=0;last=0;});addEventListener('pageshow',()=>{last=0;update();});
})();
