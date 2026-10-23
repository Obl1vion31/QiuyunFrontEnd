/** 同一相位驱动浅弧→平带；不拦截滚轮，不访问业务数据。 */
export function attachHomeMotion(hero: HTMLElement): () => void {
  const frame = hero.querySelector<HTMLElement>('[data-home-frame]')!;
  const scene = hero.querySelector<HTMLElement>('[data-home-scene]')!;
  const cards = [...hero.querySelectorAll<HTMLElement>('[data-home-cover]')];
  const stages = [...hero.querySelectorAll<HTMLElement>('[data-home-stage]')];
  const activeText = hero.querySelector<HTMLElement>('[data-home-active-stage]')!;
  const controls = hero.querySelector<HTMLElement>('[data-home-controls]')!;
  const toggle = hero.querySelector<HTMLButtonElement>('[data-home-toggle]')!;
  const preference = matchMedia('(prefers-reduced-motion: reduce)');
  const hold = 2600, move = 1150, cycle = hold + move, flatRate = .22, count = cards.length;
  const clamp = (n: number) => Math.max(0, Math.min(1, n));
  const smooth = (n: number) => n * n * (3 - 2 * n);
  const ease = (n: number) => n * n * n * (n * (n * 6 - 15) + 10);
  const mix = (a: number, b: number, p: number) => a + (b - a) * p;
  const offset = (i: number, phase: number) => ((i - 3 - phase + count / 2) % count + count) % count - count / 2;
  const idlePhase = (t: number) => Math.floor(t / cycle) + ease(clamp((t % cycle - hold) / move));
  let request = 0, last = 0, elapsed = 0, phase = 0, visible = true, paused = false;
  let currentStage = -1, dirty = true, lastPhase = -1, lastProgress = -1;
  const draw = (timestamp: number) => {
    request = 0;
    if (!visible || document.hidden) { last = 0; return; }
    const bounds = hero.getBoundingClientRect(), distance = Math.max(1, hero.offsetHeight - frame.offsetHeight);
    const reduced = preference.matches, p = reduced ? 0 : clamp(-bounds.top / distance);
    const settle = reduced ? 0 : smooth(clamp((p - .2) / .55));
    if (last && !paused && !reduced) {
      const dt = Math.min(64, timestamp - last), before = idlePhase(elapsed);
      elapsed += dt; phase += mix(idlePhase(elapsed) - before, dt / 1000 * flatRate, settle);
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
        card.style.opacity = mix(edge, 1, settle).toFixed(5); card.style.zIndex = String(Math.round(100 - a * 10));
      });
      hero.dataset.progress = p.toFixed(5); hero.dataset.phase = shownPhase.toFixed(6);
      hero.dataset.settle = settle.toFixed(5); hero.dataset.motionReady = 'true';
      lastPhase = shownPhase; lastProgress = p; dirty = false;
    }
    hero.dataset.playback = reduced ? 'reduced' : paused ? 'paused' : settle === 1 ? 'flat-loop' : settle > 0 ? 'unfolding' : elapsed % cycle < hold ? 'hold' : 'advance';
    if (!paused && !reduced) request = requestAnimationFrame(draw);
  };
  const update = () => { dirty = true; if (visible && !document.hidden && !request) request = requestAnimationFrame(draw); };
  const observer = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting; last = 0;
    if (visible) update(); else if (request) { cancelAnimationFrame(request); request = 0; }
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
  const visibility = () => { last = 0; if (document.hidden && request) { cancelAnimationFrame(request); request = 0; } else update(); };
  const preferenceChange = () => { last = 0; update(); };
  const hide = () => { if (request) cancelAnimationFrame(request); request = 0; last = 0; };
  const show = () => { last = 0; update(); };
  const imageCleanups = cards.map(card => {
    const img = card.querySelector('img'), failed = () => { card.dataset.imageFailed = 'true'; };
    img?.addEventListener('error', failed);
    if (!img || (img.complete && img.naturalWidth === 0)) failed();
    return () => img?.removeEventListener('error', failed);
  });
  toggle.addEventListener('click', pause); addEventListener('scroll', update, { passive: true }); addEventListener('resize', update);
  document.addEventListener('visibilitychange', visibility); preference.addEventListener('change', preferenceChange);
  addEventListener('pagehide', hide); addEventListener('pageshow', show); update();
  return () => {
    hide(); observer.disconnect(); resizeObserver.disconnect(); imageCleanups.forEach(cleanup => cleanup());
    toggle.removeEventListener('click', pause); removeEventListener('scroll', update); removeEventListener('resize', update);
    document.removeEventListener('visibilitychange', visibility); preference.removeEventListener('change', preferenceChange);
    removeEventListener('pagehide', hide); removeEventListener('pageshow', show);
  };
}
