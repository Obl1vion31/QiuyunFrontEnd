/** A read belongs to its destination, including its delay, cancellation and stale-response guard. */
export type BusinessReadOptions = { label?: string; signal?: AbortSignal; isCurrent?: () => boolean };
export type BusinessRead = { signal: AbortSignal; isCurrent: () => boolean; finish: () => void; cancel: () => void };
const reads = new WeakMap<HTMLElement, BusinessRead>();
const active = new Set<BusinessRead>();

export function beginBusinessRead(target: HTMLElement, options: BusinessReadOptions = {}): BusinessRead {
  reads.get(target)?.cancel();
  const controller = new AbortController();
  let ended = false;
  const indicator = document.createElement('div');
  indicator.className = 'business-read-feedback';
  indicator.dataset.businessReadLoading = '';
  if (target.matches('[data-inspector]')) indicator.dataset.inspectorLoading = '';
  indicator.setAttribute('role', 'status');
  const spinner = document.createElement('span');
  spinner.className = 'business-operation-feedback__spinner';
  spinner.setAttribute('aria-hidden', 'true');
  indicator.append(spinner, document.createTextNode(options.label ?? '正在加载…'));
  const previousBusy = target.getAttribute('aria-busy');
  const inspector = target.closest<HTMLElement>('[data-inspector]');
  const dialog = target.closest<HTMLDialogElement>('dialog');
  const container = inspector ?? dialog;
  const observer = container ? new MutationObserver(() => {
    if (container.hidden || container.dataset.closing === 'true' || !isCurrent()) cancel();
  }) : null;
  const isCurrent = () => !ended && !controller.signal.aborted && target.isConnected && (!dialog || dialog.open) && reads.get(target) === operation && (options.isCurrent?.() ?? true);
  const cleanup = () => {
    if (ended) return;
    ended = true;
    window.clearTimeout(timer);
    indicator.remove();
    observer?.disconnect();
    options.signal?.removeEventListener('abort', cancel);
    active.delete(operation);
    if (reads.get(target) === operation) {
      reads.delete(target);
      target.classList.remove('business-read-host');
      if (previousBusy == null) target.removeAttribute('aria-busy');
      else target.setAttribute('aria-busy', previousBusy);
    }
  };
  const cancel = () => { controller.abort(); cleanup(); };
  const operation: BusinessRead = { signal: controller.signal, isCurrent, finish: cleanup, cancel };
  const timer = window.setTimeout(() => {
    if (!isCurrent()) { cancel(); return; }
    target.classList.add('business-read-host');
    target.append(indicator);
    target.setAttribute('aria-busy', 'true');
  }, 500);
  reads.set(target, operation); active.add(operation);
  if (container) observer?.observe(container, { attributes: true, attributeFilter: ['hidden','open','data-closing','data-selected-id'] });
  if (options.signal?.aborted) cancel();
  else options.signal?.addEventListener('abort', cancel, { once: true });
  return operation;
}

/** Include response parsing in task, then commit only when this returns a value. */
export async function readBusiness<T>(target: HTMLElement, task: (read: BusinessRead) => Promise<T>, options: BusinessReadOptions = {}): Promise<T | undefined> {
  const read = beginBusinessRead(target, options);
  try {
    const value = await task(read);
    return read.isCurrent() ? value : undefined;
  } catch (error) {
    if (!read.isCurrent() || (error instanceof DOMException && error.name === 'AbortError')) return undefined;
    throw error;
  } finally { read.finish(); }
}

document.addEventListener('astro:before-swap', () => { for (const read of active) read.cancel(); });
