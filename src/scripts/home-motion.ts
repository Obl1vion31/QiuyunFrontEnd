/** 同一相位驱动浅弧→平带；不拦截滚轮，不访问业务数据。 */
export function attachHomeMotion(hero: HTMLElement): () => void {
  const frame = hero.querySelector<HTMLElement>('[data-home-frame]')!;
  const scene = hero.querySelector<HTMLElement>('[data-home-scene]')!;
  const cards = [...hero.querySelectorAll<HTMLElement>('[data-home-cover]')];
  const faces = cards.map(card => card.querySelector<HTMLElement>('[data-home-cover-face]')!);
  const tilts = cards.map(() => ({x:0,y:0,vx:0,vy:0,offset:0}));
  const stages = [...hero.querySelectorAll<HTMLElement>('[data-home-stage]')];
  const activeText = hero.querySelector<HTMLElement>('[data-home-active-stage]')!;
  const controls = hero.querySelector<HTMLElement>('[data-home-controls]')!;
  const toggle = hero.querySelector<HTMLButtonElement>('[data-home-toggle]')!;
  const preference = matchMedia('(prefers-reduced-motion: reduce)');
  const pointerCapability = matchMedia('(hover: hover) and (pointer: fine)');
  const hold = 2600, move = 1150, cycle = hold + move, flatRate = .22, count = cards.length;
  const clamp = (n: number) => Math.max(0, Math.min(1, n));
  const smooth = (n: number) => n * n * (3 - 2 * n);
  const ease = (n: number) => n * n * n * (n * (n * 6 - 15) + 10);
  const mix = (a: number, b: number, p: number) => a + (b - a) * p;
  const offset = (i: number, phase: number) => ((i - 3 - phase + count / 2) % count + count) % count - count / 2;
  const idlePhase = (t: number) => Math.floor(t / cycle) + ease(clamp((t % cycle - hold) / move));
  let request = 0, last = 0, elapsed = 0, phase = 0, visible = true, paused = false;
  let currentStage = -1, dirty = true, lastPhase = -1, lastProgress = -1;
  let pointer: {x:number;y:number}|null = null;
  const resetFace = (index:number) => {
    const tilt=tilts[index];tilt.x=tilt.y=tilt.vx=tilt.vy=0;
    faces[index].style.removeProperty('transform');faces[index].style.removeProperty('will-change');
  };
  const resetTilt = () => {pointer=null;cards.forEach((card,index)=>{resetFace(index);card.removeAttribute('data-home-interactive');});};
  const drawTilt = (dt:number,enabled:boolean) => {
    if(!enabled)return false;
    // Hit testing stays on the moving outer figure; the visual face never changes its hit area.
    const hit=pointer?document.elementFromPoint(pointer.x,pointer.y)?.closest<HTMLElement>('[data-home-cover]'):null;
    const rect=hit&&cards.includes(hit)?hit.getBoundingClientRect():null;
    let moving=false;
    cards.forEach((card,index)=>{
      const tilt=tilts[index],face=faces[index],target=card===hit&&rect&&pointer;
      const x=target?-(clamp((pointer!.y-rect!.top)/rect!.height)*2-1)*5:0;
      const y=target?(clamp((pointer!.x-rect!.left)/rect!.width)*2-1)*5:0;
      // Small integration steps keep the same damped spring on slow and fast displays.
      const steps=Math.max(1,Math.ceil(dt*120)),step=dt/steps;
      for(let i=0;i<steps;i++){
        tilt.vx+=(324*(x-tilt.x)-28.08*tilt.vx)*step;
        tilt.vy+=(324*(y-tilt.y)-28.08*tilt.vy)*step;
        tilt.x+=tilt.vx*step;tilt.y+=tilt.vy*step;
      }
      const unsettled=Math.abs(x-tilt.x)+Math.abs(y-tilt.y)>.005||Math.abs(tilt.vx)+Math.abs(tilt.vy)>.02;
      moving ||= unsettled;
      if(!unsettled&&!target){resetFace(index);return;}
      face.style.transform=`perspective(900px) rotateX(${tilt.x.toFixed(4)}deg) rotateY(${tilt.y.toFixed(4)}deg)`;
      if(unsettled)face.style.willChange='transform';else face.style.removeProperty('will-change');
    });
    return moving;
  };
  const draw = (timestamp: number) => {
    request = 0;
    if (!visible || document.hidden) { last = 0; return; }
    const bounds = hero.getBoundingClientRect(), distance = Math.max(1, hero.offsetHeight - frame.offsetHeight);
    const reduced = preference.matches, p = reduced ? 0 : clamp(-bounds.top / distance);
    const settle = reduced ? 0 : smooth(clamp((p - .2) / .55));
    const dt=last?Math.min(64,timestamp-last)/1000:1/60;
    if (last && !paused && !reduced) {
      const before = idlePhase(elapsed);
      elapsed += dt*1000; phase += mix(idlePhase(elapsed) - before, dt * flatRate, settle);
    }
    last = timestamp;
    const stage = reduced ? 0 : Math.min(stages.length - 1, Math.floor(p * stages.length));
    if (stage !== currentStage) {
      stages.forEach((node, i) => {
        if (i === stage) node.setAttribute('aria-current', 'step'); else node.removeAttribute('aria-current');
        node.dataset.past = String(i < stage);
      });
      activeText.textContent = stages[stage]?.querySelector('strong')?.textContent ?? ''; currentStage = stage;
    }
    controls.hidden = reduced;
    const shownPhase = reduced ? 0 : phase;
    if (dirty || shownPhase !== lastPhase || p !== lastProgress) {
      const width = scene.clientWidth, height = frame.offsetHeight;
      hero.style.setProperty('--progress', String(p));
      scene.style.setProperty('--edge-start', `${mix(19, 3.5, settle)}%`);
      scene.style.setProperty('--edge-end', `${mix(81, 96.5, settle)}%`);
      cards.forEach((card, i) => {
        const d = offset(i, shownPhase), a = Math.abs(d), edge = (1 - smooth(clamp((a - .9) / 2.2))) ** 1.7;
        const finalScale = Math.max(116, Math.min(148, innerWidth * .1025)) * .82 / card.offsetWidth;
        const x = (.5 + d * mix(.165, .125, settle)) * width;
        const y = mix(height * .70 - Math.min(a, 3.8) ** 2 * 6.2, height * .69, settle);
        const scale = mix(1.08 - Math.min(a, 3.8) * .105, finalScale, settle);
        const angle = -d * 2.2 * (1 - settle), yaw = -d * 10 * (1 - settle);
        card.style.left = '0'; card.style.top = '0';
        card.style.transform = `translate3d(${(x - card.offsetWidth / 2).toFixed(3)}px,${(y - card.offsetHeight / 2).toFixed(3)}px,0) perspective(1100px) rotateY(${yaw.toFixed(3)}deg) rotate(${angle.toFixed(3)}deg) scale(${scale.toFixed(5)})`;
        const opacity=mix(edge,1,settle);
        card.style.opacity = opacity.toFixed(5); card.style.zIndex = String(Math.round(100 - a * 10));
        if(Math.abs(d-tilts[i].offset)>count/2||opacity<.01)resetFace(i);
        tilts[i].offset=d;
        const interactive=String(!reduced&&pointerCapability.matches&&opacity>.05);
        if(card.dataset.homeInteractive!==interactive)card.dataset.homeInteractive=interactive;
      });
      hero.dataset.progress = p.toFixed(5); hero.dataset.phase = shownPhase.toFixed(6);
      hero.dataset.settle = settle.toFixed(5); hero.dataset.motionReady = 'true';
      lastPhase = shownPhase; lastProgress = p; dirty = false;
    }
    hero.dataset.playback = reduced ? 'reduced' : paused ? 'paused' : settle === 1 ? 'flat-loop' : settle > 0 ? 'unfolding' : elapsed % cycle < hold ? 'hold' : 'advance';
    const tiltMoving=drawTilt(dt,!reduced&&pointerCapability.matches);
    if ((!paused && !reduced)||tiltMoving) request = requestAnimationFrame(draw);
  };
  const wake = () => {if (visible && !document.hidden && !request) request = requestAnimationFrame(draw);};
  const update = () => { dirty = true; wake(); };
  const pointerMove = (event:PointerEvent) => {
    if(preference.matches||!pointerCapability.matches||event.pointerType==='touch')return;
    pointer={x:event.clientX,y:event.clientY};wake();
  };
  const pointerLeave = () => {pointer=null;wake();};
  const observer = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting; last = 0;
    if (visible) update(); else hide();
  }, { rootMargin: '0px' });
  observer.observe(frame);
  const resizeObserver = new ResizeObserver(update); resizeObserver.observe(frame); resizeObserver.observe(scene);
  const pause = () => {
    paused = !paused; last = 0; toggle.setAttribute('aria-pressed', String(paused));
    toggle.setAttribute('aria-label', paused ? '播放封面轮播' : '暂停封面轮播');
    toggle.querySelector<HTMLElement>('[data-home-toggle-label]')!.textContent = paused ? '播放轮播' : '暂停轮播';
    toggle.firstElementChild!.textContent = paused ? '▷' : 'Ⅱ';
    if (paused && request) { cancelAnimationFrame(request); request = 0; } update();
  };
  const visibility = () => { if(document.hidden)hide();else{last=0;update();} };
  const preferenceChange = () => { resetTilt();last = 0; update(); };
  const hide = () => { if (request) cancelAnimationFrame(request); request = 0; last = 0;resetTilt(); };
  const show = () => { last = 0; update(); };
  const imageCleanups = cards.map(card => {
    const img = card.querySelector('img'), failed = () => { card.dataset.imageFailed = 'true'; };
    img?.addEventListener('error', failed);
    if (!img || (img.complete && img.naturalWidth === 0)) failed();
    return () => img?.removeEventListener('error', failed);
  });
  toggle.addEventListener('click', pause); addEventListener('scroll', update, { passive: true }); addEventListener('resize', update);
  hero.addEventListener('pointermove',pointerMove,{passive:true});hero.addEventListener('pointerleave',pointerLeave);hero.addEventListener('pointercancel',pointerLeave);
  addEventListener('blur',pointerLeave);pointerCapability.addEventListener('change',preferenceChange);
  document.addEventListener('visibilitychange', visibility); preference.addEventListener('change', preferenceChange);
  addEventListener('pagehide', hide); addEventListener('pageshow', show); update();
  return () => {
    hide(); observer.disconnect(); resizeObserver.disconnect(); imageCleanups.forEach(cleanup => cleanup());
    toggle.removeEventListener('click', pause); removeEventListener('scroll', update); removeEventListener('resize', update);
    hero.removeEventListener('pointermove',pointerMove);hero.removeEventListener('pointerleave',pointerLeave);hero.removeEventListener('pointercancel',pointerLeave);
    removeEventListener('blur',pointerLeave);pointerCapability.removeEventListener('change',preferenceChange);
    document.removeEventListener('visibilitychange', visibility); preference.removeEventListener('change', preferenceChange);
    removeEventListener('pagehide', hide); removeEventListener('pageshow', show);
  };
}
