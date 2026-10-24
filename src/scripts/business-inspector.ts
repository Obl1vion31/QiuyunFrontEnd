import { navigate } from 'astro:transitions/client';
import { businessConfirm, setBusinessScrollLock } from './business-dialog';

/** 静态详情与惰性模板都使用同一条正文滚动轨道。 */
function organizeInspector(element: HTMLElement) {
  let body = element.querySelector<HTMLElement>(':scope > [data-inspector-body], :scope > .inspector-body');
  if (!body) { body = document.createElement('div'); element.append(body); }
  body.dataset.inspectorBody = '';
  const title=element.querySelector<HTMLElement>(':scope>header h1,:scope>header h2');
  if(title)title.title=title.textContent??'';
  for (const node of [...element.childNodes]) {
    if (node === body || node instanceof HTMLElement && (node.tagName === 'HEADER' || node.tagName === 'FOOTER')) continue;
    body.append(node);
  }
  const footer = element.querySelector(':scope > footer');
  element.insertBefore(body, footer);
}
/** 公共详情交互；业务适配器只负责填充内容与保存。示例见 docs/code-study.md。 */
export interface InspectorOptions {
  parameter?: string;
  render?: (id: string) => void;
  select?: (id: string | null) => void;
  localParameters?: string[];
  discard?: () => void;
  onContextChange?: (url: URL) => void;
}
const controllers = new WeakMap<HTMLElement, ReturnType<typeof createInspector>>();
export function getInspector(element: HTMLElement, options: InspectorOptions = {}) {
  const existing = controllers.get(element);
  if (existing) { existing.configure(options); return existing; }
  const controller = createInspector(element, options);
  controllers.set(element, controller);
  return controller;
}
function createInspector(element: HTMLElement, options: InspectorOptions) {
  element.dataset.inspectorReady = 'true';
  const host = element.closest<HTMLElement>('[data-inspector-host]');
  const parameter = options.parameter ?? element.dataset.inspectorParameter;
  const lifecycle = new AbortController();
  const { signal } = lifecycle;
  let selected: string | null = null;
  let trigger: HTMLElement | null = null;
  let motion:Animation[]=[];
  const stopMotion=()=>{for(const animation of motion)animation.cancel();motion=[];};
  const motionOptions={duration:220,easing:'cubic-bezier(.2,.8,.2,1)',fill:'both' as FillMode};
  let generation = 0;
  let currentUrl = new URL(location.href);
  let viewportFrame = 0;
  const fitViewport = () => {
    if (element.hidden || !selected) return;
    setBusinessScrollLock(element,matchMedia('(max-width:900px)').matches);
    const top = element.getBoundingClientRect().top;
    element.style.setProperty('--inspector-height', `${Math.max(120, window.innerHeight - top - 20)}px`);
  };
  const queueViewport = () => {
    cancelAnimationFrame(viewportFrame);
    viewportFrame = requestAnimationFrame(fitViewport);
  };
  window.addEventListener('scroll',queueViewport,{passive:true,signal});
  window.addEventListener('resize',queueViewport,{passive:true,signal});
  const viewportObserver = new ResizeObserver(queueViewport);
  if(host)viewportObserver.observe(host);
  signal.addEventListener('abort',()=>{viewportObserver.disconnect();cancelAnimationFrame(viewportFrame);},{once:true});
  const baseUrl = (url:URL) => { const base = new URL(url); if(parameter)base.searchParams.delete(parameter); for(const name of options.localParameters??[])base.searchParams.delete(name); base.hash=''; return base.href; };
  const syncContext = () => { element.dataset.inspectorHistoryBase = baseUrl(currentUrl); element.dataset.inspectorLocalParameters = (options.localParameters??[]).join(','); };
  syncContext();
  const dirty = () => element.dataset.dirty === 'true';
  const mayLeave = async () => {
    if (!dirty()) return true;
    if (!await businessConfirm('有尚未保存的修改，是否放弃？')) return false;
    options.discard?.();
    return true;
  };
  const setClean = () => { element.dataset.dirty = 'false'; document.documentElement.dataset.unsaved = String([...document.querySelectorAll('form[data-dirty=true]')].some(form=>!element.contains(form))); };
  const updateUrl = (id: string | null, replace = false) => {
    if (!parameter) return;
    const url = new URL(location.href);
    if (id) url.searchParams.set(parameter, id); else url.searchParams.delete(parameter);
    if (url.href !== location.href) history[replace ? 'replaceState' : 'pushState']({...history.state, businessInspector:true}, '', url);
    currentUrl = url;
  };
  const select = (id: string | null) => {
    selected = id;
    document.dispatchEvent(new CustomEvent('business:inspector-selection',{detail:{id}}));
    element.dataset.selectedId = id ?? '';
    host?.classList.toggle('inspecting', !!id);
    options.select?.(id);
    if (!options.select) document.querySelectorAll<HTMLElement>('[data-inspect-id]').forEach(row => {row.classList.toggle('selected',row.dataset.inspectId===id);row.setAttribute('aria-expanded',String(row.dataset.inspectId===id));});
    document.querySelectorAll<HTMLElement>('[data-inspector-key]').forEach(row => {
      const active = row.dataset.inspectorKey === id;
      row.classList.toggle('selected', active);
      row.setAttribute('aria-selected', String(active));
    });
  };
  const open = (id: string, source?: HTMLElement | null, writeHistory = true) => {
    if (selected !== id && dirty()) {
      const token=generation;
      void mayLeave().then(accepted=>{if(accepted&&token===generation&&!signal.aborted){setClean();open(id,source,writeHistory);}});
      return false;
    }
    const wasVisible=!element.hidden,wasClosing=element.dataset.closing==='true';
    const previous=getComputedStyle(element),from={width:element.getBoundingClientRect().width,opacity:wasVisible?previous.opacity:'0',transform:wasVisible?previous.transform:'translateX(18px)'},oldGap=host?getComputedStyle(host).columnGap:'0px';
    stopMotion();generation++;delete element.dataset.closing;
    if (source) trigger = source;
    else if (!trigger?.isConnected) trigger = document.querySelector<HTMLElement>(`[data-inspector-key="${CSS.escape(id)}"],[data-inspect-id="${CSS.escape(id)}"]`);
    if (selected !== id||wasClosing) { setClean(); if (options.render) options.render(id); else element.dispatchEvent(new CustomEvent('business:inspector-render-record',{detail:{id}})); }
    organizeInspector(element);
    const body = element.querySelector<HTMLElement>('[data-inspector-body]')!;
    if (selected !== id) body.scrollTop = 0;
    select(id);
    element.hidden = false;
    element.setAttribute('role', matchMedia('(max-width:900px)').matches ? 'dialog' : 'complementary');
    element.setAttribute('aria-modal', String(matchMedia('(max-width:900px)').matches));
    const token = generation;
    element.classList.add('is-open');fitViewport();
    if(!matchMedia('(prefers-reduced-motion:reduce)').matches){
      const dock=!!host&&getComputedStyle(element).position!=='fixed',width=element.getBoundingClientRect().width;
      const animations=[element.animate([{opacity:from.opacity,transform:from.transform,...(dock?{width:`${wasVisible?from.width:0}px`}:{})},{opacity:1,transform:'none',...(dock?{width:`${width}px`}:{})}],motionOptions)];
      if(dock)animations.push(host!.animate([{gap:oldGap},{gap:getComputedStyle(host!).columnGap}],motionOptions));
      motion=animations;void Promise.allSettled(animations.map(animation=>animation.finished)).then(()=>{if(token!==generation||signal.aborted)return;for(const animation of animations)animation.cancel();if(motion===animations)motion=[];});
    }
    element.focus({ preventScroll: true });
    if (writeHistory) updateUrl(id);
    return true;
  };
  const close = (writeHistory = true) => {
    if(dirty()){
      const token=generation;
      void mayLeave().then(accepted=>{if(accepted&&token===generation&&!signal.aborted){setClean();close(writeHistory);}});
      return false;
    }
    if(element.hidden||element.dataset.closing==='true')return true;
    const previous=getComputedStyle(element),from={width:element.getBoundingClientRect().width,opacity:previous.opacity,transform:previous.transform},oldGap=host?getComputedStyle(host).columnGap:'0px';
    stopMotion();generation++;setClean();element.dataset.closing='true';const token=generation;
    const finish=()=>{if(token!==generation||signal.aborted)return;element.hidden=true;element.classList.remove('is-open','open');delete element.dataset.closing;select(null);setBusinessScrollLock(element,false);const focusTarget=trigger?.getClientRects().length?trigger:trigger?.closest('details:not([open])')?.querySelector<HTMLElement>(':scope>summary');focusTarget?.focus({preventScroll:true});};
    if(matchMedia('(prefers-reduced-motion:reduce)').matches)finish();
    else{
      const dock=!!host&&getComputedStyle(element).position!=='fixed';
      const animations=[element.animate([{opacity:from.opacity,transform:from.transform,...(dock?{width:`${from.width}px`}:{})},{opacity:0,transform:'translateX(18px)',...(dock?{width:'0px'}:{})}],motionOptions)];
      if(dock)animations.push(host!.animate([{gap:oldGap},{gap:'0px'}],motionOptions));
      motion=animations;void Promise.allSettled(animations.map(animation=>animation.finished)).then(()=>{if(token!==generation||signal.aborted)return;finish();for(const animation of animations)animation.cancel();if(motion===animations)motion=[];});
    }
    if (writeHistory) updateUrl(null);
    return true;
  };
  element.addEventListener('input', () => { element.dataset.dirty = 'true'; document.documentElement.dataset.unsaved = 'true'; }, { signal });
  element.addEventListener('click', event => {
    if (!(event.target as Element).closest('[data-close-inspector]')) return;
    event.preventDefault(); close();
  }, { signal });
  element.addEventListener('business:inspector-select', event => {
    const { id, trigger: source } = (event as CustomEvent).detail;
    open(id, source);
  }, { signal });
  element.addEventListener('business:inspector-close', () => close(), { signal });
  document.addEventListener('keydown', event => {
    if (element.hidden || document.querySelector('dialog[open]')) return;
    if (event.key === 'Escape') { event.preventDefault(); close(); }
    if (event.key === 'Tab' && matchMedia('(max-width:900px)').matches) {
      const nodes = [...element.querySelectorAll<HTMLElement>('a[href],button:not(:disabled),summary,input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')].filter(node => {
        if(!node.getClientRects().length)return false;
        // Chrome 会为关闭 details 的内容保留布局盒；矩形存在不等于能聚焦。
        for(let parent=node.parentElement;parent&&parent!==element;parent=parent.parentElement){
          if(parent instanceof HTMLDetailsElement&&!parent.open&&!parent.querySelector(':scope>summary')?.contains(node))return false;
        }
        return true;
      });
      const first = nodes[0], last = nodes.at(-1);
      if (event.shiftKey && (document.activeElement === first || document.activeElement === element)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === element)) { event.preventDefault(); first?.focus(); }
    }
  }, { signal });
  element.addEventListener('business:inspector-popstate', event => {
    if (!parameter) return;
    const destination = new URL(location.href);
    if (baseUrl(destination) !== baseUrl(currentUrl)) {
      event.stopImmediatePropagation();
      const previous=new URL(currentUrl);history.pushState({...history.state},'',previous);
      void mayLeave().then(accepted=>{if(accepted){setClean();void navigate(destination.href,{history:'replace'});}});
      return;
    }
    // 本地选择的历史由本控制器处理，避免 Astro 把 query 变化当成整页导航。
    event.stopImmediatePropagation();
    const id = destination.searchParams.get(parameter);
    const apply=()=>{currentUrl=destination;history.replaceState({...history.state},'',destination);options.onContextChange?.(destination);if(id!==selected){setClean();id?open(id,null,false):close(false);}};
    if(dirty()&&id!==selected){history.pushState({...history.state},'',currentUrl);void mayLeave().then(accepted=>{if(accepted)apply();});}
    else apply();
  }, { signal });
  window.addEventListener('beforeunload', event => { if (dirty()) event.preventDefault(); }, { signal });
  const guardNavigation = (event:Event) => {
    if (!dirty()) return;
    if(event instanceof MouseEvent && (event.button!==0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey))return;
    const target = event.target as Element;
    if (target.closest('[data-inspector]')) return;
    const link = target.closest<HTMLAnchorElement>('a[href]');
    if (event.type === 'click' && (!link || link.target === '_blank' || link.hasAttribute('download') || link.closest('[data-inspector]') || link.hasAttribute('data-inspector-key') || link.hasAttribute('data-inspector-trigger') && link.closest('[data-inspector-key]'))) return;
    if (event.type === 'submit' && !(target instanceof HTMLFormElement && target.getAttribute('method')?.toLowerCase() === 'get')) return;
    event.preventDefault(); event.stopImmediatePropagation();
    void mayLeave().then(accepted=>{
      if(!accepted)return;setClean();
      if(link)void navigate(link.href);
      else if(target instanceof HTMLFormElement)target.requestSubmit();
    });
  };
  document.addEventListener('click', guardNavigation, {signal,capture:true});
  document.addEventListener('submit', guardNavigation, {signal,capture:true});
  document.addEventListener('astro:before-swap', () => { stopMotion();setBusinessScrollLock(element,false);lifecycle.abort(); }, { once: true, signal });
  return { open, close, setClean,
    refresh:()=>{if(!selected||dirty())return;const body=element.querySelector<HTMLElement>('[data-inspector-body]'),scroll=body?.scrollTop??0;options.render?.(selected);organizeInspector(element);const next=element.querySelector<HTMLElement>('[data-inspector-body]');if(next)next.scrollTop=scroll;},
    configure:(next:InspectorOptions)=>{Object.assign(options,next);syncContext();},
    setLocalParameters:(values:Record<string,string|null>)=>{
      const url=new URL(location.href);
      for(const [name,value] of Object.entries(values)){
        if(!options.localParameters?.includes(name))throw new Error('未注册的局部视图参数');
        if(value==null)url.searchParams.delete(name);else url.searchParams.set(name,value);
      }
      if(url.href!==location.href)history.pushState({...history.state,businessInspector:true},'',url);
      currentUrl=url;syncContext();options.onContextChange?.(url);
    },
    setLocalParameter:(name:string,value:string)=>{
      if(!options.localParameters?.includes(name))throw new Error('未注册的局部视图参数');
      const url=new URL(location.href);url.searchParams.set(name,value);
      if(url.href!==location.href)history.pushState({...history.state,businessInspector:true},'',url);
      currentUrl=url;syncContext();options.onContextChange?.(url);
    },
    get selected() { return selected; }, get generation() { return generation; } };
}

function initialize() {
  document.querySelectorAll<HTMLElement>('[data-inspector-templates]').forEach(element => {
    if (controllers.has(element)) return;
    const render = (id: string) => {
      const template = [...document.querySelectorAll<HTMLTemplateElement>('template[data-inspector-template]')].find(node => node.dataset.inspectorTemplate === id);
      if (!template) { element.innerHTML = '<header><h2>记录暂不可用</h2><button data-close-inspector aria-label="关闭详情">×</button></header><p data-inspector-error>请刷新列表后重新选择。</p>'; return; }
      element.replaceChildren(template.content.cloneNode(true));
      element.dispatchEvent(new CustomEvent('business:inspector-render', { bubbles: true, detail: { id } }));
    };
    const controller = getInspector(element, { render });
    const parameter = element.dataset.inspectorParameter!;
    // Stable delegation also covers locally refreshed rows without rebinding or losing drafts.
    const host=element.closest('[data-inspector-host]')??element.parentElement!;
    const activate=(event:Event)=>{
      const row=(event.target as Element).closest<HTMLElement>('[data-inspector-key]');
      if(!row||!host.contains(row))return;
      if(event instanceof KeyboardEvent&&(event.target!==row||!['Enter',' '].includes(event.key)))return;
      if(event instanceof MouseEvent&&(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey))return;
      // Explicit row actions share selection, draft protection and focus return.
      // Native buttons synthesize click on Enter/Space; only the row handles keydown.
      const control=(event.target as Element).closest<HTMLElement>('a,button,input,select,textarea');
      if(!(row instanceof HTMLAnchorElement)&&control&&!control.hasAttribute('data-inspector-trigger'))return;
      event.preventDefault();controller.open(row.dataset.inspectorKey!,control??row);
    };
    host.addEventListener('click',activate);host.addEventListener('keydown',activate);
    const requested = new URL(location.href).searchParams.get(parameter);
    if (requested) controller.open(requested, document.querySelector<HTMLElement>(`[data-inspector-key="${CSS.escape(requested)}"]`), false);
  });
  document.querySelectorAll<HTMLElement>('[data-inspector]:not([data-inspector-templates])').forEach(element => {
    const controller = getInspector(element);
    if (element.dataset.selectedId) controller.open(element.dataset.selectedId, null, false);
  });
}
document.addEventListener('astro:page-load', initialize);
// 模板在本地刷新后重新挂接列表和表单；不会替换左侧列表来打开详情。
document.addEventListener('business:inspector-refresh', initialize);
