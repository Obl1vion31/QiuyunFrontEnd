import { navigate } from 'astro:transitions/client';
/** 公共详情交互；业务适配器只负责填充内容与保存。示例见 docs/code-study.md。 */
export interface InspectorOptions {
  parameter?: string;
  render?: (id: string) => void;
  select?: (id: string | null) => void;
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
  let closeTimer = 0;
  let generation = 0;
  let currentUrl = new URL(location.href);
  const baseUrl = (url:URL) => { const base = new URL(url); if(parameter)base.searchParams.delete(parameter); base.hash=''; return base.href; };
  element.dataset.inspectorHistoryBase = baseUrl(currentUrl);
  const dirty = () => element.dataset.dirty === 'true';
  const mayLeave = () => !dirty() || window.confirm('有尚未保存的修改，确定放弃吗？');
  const setClean = () => { element.dataset.dirty = 'false'; document.documentElement.dataset.unsaved = 'false'; };
  const updateUrl = (id: string | null, replace = false) => {
    if (!parameter) return;
    const url = new URL(location.href);
    if (id) url.searchParams.set(parameter, id); else url.searchParams.delete(parameter);
    if (url.href !== location.href) history[replace ? 'replaceState' : 'pushState']({...history.state, businessInspector:true}, '', url);
    currentUrl = url;
  };
  const select = (id: string | null) => {
    selected = id;
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
    if (selected !== id && !mayLeave()) return false;
    clearTimeout(closeTimer); generation++;
    if (source) trigger = source;
    else if (!trigger?.isConnected) trigger = document.querySelector<HTMLElement>(`[data-inspector-key="${CSS.escape(id)}"],[data-inspect-id="${CSS.escape(id)}"]`);
    if (selected !== id) { setClean(); if (options.render) options.render(id); else element.dispatchEvent(new CustomEvent('business:inspector-render-record',{detail:{id}})); }
    select(id);
    element.hidden = false;
    element.setAttribute('role', matchMedia('(max-width:900px)').matches ? 'dialog' : 'complementary');
    element.setAttribute('aria-modal', String(matchMedia('(max-width:900px)').matches));
    const token = generation;
    requestAnimationFrame(() => { if (token !== generation) return; element.classList.add('is-open'); element.focus({ preventScroll: true }); });
    if (writeHistory) updateUrl(id);
    return true;
  };
  const close = (writeHistory = true) => {
    if (!mayLeave()) return false;
    generation++; setClean(); select(null); element.classList.remove('is-open', 'open');
    closeTimer = window.setTimeout(() => { element.hidden = true; }, matchMedia('(prefers-reduced-motion:reduce)').matches ? 0 : 220);
    trigger?.focus({ preventScroll: true });
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
      const nodes = [...element.querySelectorAll<HTMLElement>('a[href],button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')].filter(node => node.getClientRects().length);
      const first = nodes[0], last = nodes.at(-1);
      if (event.shiftKey && (document.activeElement === first || document.activeElement === element)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === element)) { event.preventDefault(); first?.focus(); }
    }
  }, { signal });
  element.addEventListener('business:inspector-popstate', event => {
    if (!parameter) return;
    const destination = new URL(location.href);
    if (baseUrl(destination) !== baseUrl(currentUrl)) {
      if (!mayLeave()) { event.stopImmediatePropagation(); history.pushState({...history.state},'',currentUrl); }
      else { setClean(); void navigate(destination.href,{history:'replace'}); }
      return;
    }
    // 本地选择的历史由本控制器处理，避免 Astro 把 query 变化当成整页导航。
    event.stopImmediatePropagation();
    currentUrl = destination;
    const id = destination.searchParams.get(parameter);
    if (id === selected) return;
    const accepted = id ? open(id, null, false) : close(false);
    if (!accepted) updateUrl(selected, true);
  }, { signal });
  window.addEventListener('beforeunload', event => { if (dirty()) event.preventDefault(); }, { signal });
  const guardNavigation = (event:Event) => {
    if (!dirty()) return;
    if(event instanceof MouseEvent && (event.button!==0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey))return;
    const target = event.target as Element;
    if (target.closest('[data-inspector]')) return;
    const link = target.closest<HTMLAnchorElement>('a[href]');
    if (event.type === 'click' && (!link || link.target === '_blank' || link.hasAttribute('download') || link.closest('[data-inspector]') || link.hasAttribute('data-inspector-key'))) return;
    if (event.type === 'submit' && !(target instanceof HTMLFormElement && target.method.toLowerCase() === 'get')) return;
    if (!mayLeave()) { event.preventDefault(); event.stopImmediatePropagation(); }
    else setClean();
  };
  document.addEventListener('click', guardNavigation, {signal,capture:true});
  document.addEventListener('submit', guardNavigation, {signal,capture:true});
  document.addEventListener('astro:before-swap', () => { clearTimeout(closeTimer); lifecycle.abort(); }, { once: true, signal });
  return { open, close, setClean, configure:(next:InspectorOptions)=>Object.assign(options,next), get selected() { return selected; }, get generation() { return generation; } };
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
    document.querySelectorAll<HTMLElement>('[data-inspector-key]').forEach(row => {
      const activate = (event: Event) => {
        if (event instanceof MouseEvent && (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)) return;
        if (!(row instanceof HTMLAnchorElement) && (event.target as Element).closest('a,button,input,select,textarea')) return;
        event.preventDefault(); controller.open(row.dataset.inspectorKey!, row);
      };
      row.addEventListener('click', activate);
      row.addEventListener('keydown', event => { if (event.target === row && (event.key === 'Enter' || event.key === ' ')) activate(event); });
    });
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
