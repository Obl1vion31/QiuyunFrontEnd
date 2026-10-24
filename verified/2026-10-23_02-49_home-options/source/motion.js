/** 同一滚动进度驱动构图与轨道。页面静止和场景不可见时没有持续动画。 */
(() => {
  const hero = document.querySelector('.hero');
  const frame = document.querySelector('.hero__frame');
  const scene = document.querySelector('.cover-scene');
  const cards = [...document.querySelectorAll('[data-cover]')];
  const stages = [...document.querySelectorAll('[data-stage]')];
  const activeText = document.querySelector('[data-active-stage]');
  const variant = document.body.dataset.variant;
  const preference = matchMedia('(prefers-reduced-motion: reduce)');
  const starts = [[.065,.635,.71,-13],[.19,.72,.93,-8],[.315,.64,.79,5],[.44,.735,1.03,-4],[.565,.64,.82,7],[.69,.735,.96,-6],[.815,.65,.74,11],[.94,.71,.87,6]];
  let request = 0, visible = true, currentStage = -1;
  const clamp = n => Math.max(0,Math.min(1,n));
  const smooth = n => n*n*(3-2*n);
  const mix = (a,b,p) => a+(b-a)*p;
  const render = () => {
    request = 0;
    if (!visible) return;
    const bounds=hero.getBoundingClientRect();
    const distance=Math.max(1,hero.offsetHeight-frame.offsetHeight);
    const progress=variant==='c'?clamp(-bounds.top/Math.max(frame.offsetHeight*.65,1)):clamp(-bounds.top/distance);
    const isReduced=preference.matches;
    const stage=isReduced?0:Math.min(5,Math.floor(progress*6));
    if(stage!==currentStage){
      stages.forEach((node,i)=>{if(i===stage)node.setAttribute('aria-current','step');else node.removeAttribute('aria-current');node.classList.toggle('is-past',i<stage);});
      activeText.textContent=stages[stage].querySelector('strong').textContent;
      currentStage=stage;
    }
    hero.style.setProperty('--progress',isReduced?'0':String(progress));
    const width=scene.clientWidth,height=frame.offsetHeight;
    const settle=isReduced?1:smooth(clamp((progress-.2)/.55));
    cards.forEach((card,i)=>{
      let x,y,scale,angle;
      if(variant==='a'){
        const start=starts[i];
        x=mix(start[0],.065+i*.1243,settle)*width;
        y=mix(start[1],.69,settle)*height;
        scale=mix(start[2],.82,settle);angle=mix(start[3],0,settle);
      }else if(variant==='b'){
        x=(.065+i*.1243)*width;y=height*.685;scale=.76;angle=0;
      }else{
        x=(.615+(i%4)*.105)*width;y=(i<4?.37:.645)*height;scale=.79;angle=0;
      }
      card.style.transform=`translate3d(${(x-card.offsetWidth/2).toFixed(2)}px,${(y-card.offsetHeight/2).toFixed(2)}px,0) rotate(${angle.toFixed(2)}deg) scale(${scale.toFixed(3)})`;
    });
    hero.dataset.progress=progress.toFixed(3);
    hero.dataset.motionReady='true';
  };
  const update=()=>{if(visible&&!request)request=requestAnimationFrame(render);};
  const observer=new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;if(visible)update();else if(request){cancelAnimationFrame(request);request=0;}},{rootMargin:'100px'});
  observer.observe(hero);
  addEventListener('scroll',update,{passive:true});
  addEventListener('resize',update);
  preference.addEventListener('change',()=>{document.body.classList.toggle('motion-reduced',preference.matches);update();});
  document.body.classList.toggle('motion-reduced',preference.matches);
  cards.forEach(card=>{const img=card.querySelector('img');img.addEventListener('error',()=>card.classList.add('image-failed'));if(img.complete&&img.naturalWidth===0)card.classList.add('image-failed');});
  render();
  // 首次进入只播放一次；重入可视区、滚动回退和本地操作不重新触发。
  document.body.classList.add('motion-enter');
  addEventListener('pagehide',()=>{observer.disconnect();removeEventListener('scroll',update);removeEventListener('resize',update);if(request)cancelAnimationFrame(request);},{once:true});
})();
