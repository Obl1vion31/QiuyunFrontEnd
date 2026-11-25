import { navigate } from 'astro:transitions/client';
import { businessConfirm, bindBusinessBackdrop, closeBusinessDialog } from '../scripts/business-dialog';
import { getInspector } from '../scripts/business-inspector';
import { dateText, isStatView, monthLabel, salesToday, salesHref } from './model';
import type { Direction, Post, View } from './model';
import { detailFeedback, escapeText, leadDetail, leadSummary, listRows, postChoice, postType, statsContent } from './render';
import type { LeadView, ListView } from './render';
import { browserWorkspace } from './browser-storage';
import { deleteLead, filtersFrom, monthOptions, postFor, readLead, readList, readStats, saveLead, searchPosts } from './store';
import type { Action, Workspace } from './store';

type Config = { account: string; view: View };
type Sheet = Action;
type EditTarget = LeadView | ListView['rows'][number];
const sheetLabels: Record<Sheet, string> = {
  create: '已登记微信', contact: '已保存微信信息', follow: '已保存跟进', deal: '已更新成交记录',
  source: '已保存来源', merge: '已合并登记',
};

function field(form: HTMLFormElement, name: string) {
  return form.elements.namedItem(name) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
}
function signature(form: HTMLFormElement) {
  return JSON.stringify(Array.from(new FormData(form)).filter(([key]) => !['requestId','candidate','postQuery'].includes(key)));
}
function start(config: Config) {
  const lifecycle = new AbortController();
  const { signal } = lifecycle;
  const storage = browserWorkspace(config.account);
  let filters = filtersFrom(new URL(location.href).searchParams);
  const listFilter = document.querySelector<HTMLFormElement>('[data-sales-list-filter]');
  const clear = document.querySelector<HTMLButtonElement>('[data-sales-clear]');
  let list: ListView | undefined;
  let lead: LeadView | undefined;
  let readGeneration = 0;
  let workspaceGeneration = 0;
  let receiptTimer: ReturnType<typeof setTimeout>;
  let candidates: Post[] = [];
  const baselines = new WeakMap<HTMLFormElement, string>();
  const deleting = new Set<string>();
  const pane = document.querySelector<HTMLDialogElement>('#sales-trial-inspector');
  const queue = config.view === 'queue';
  const forms = [...document.querySelectorAll<HTMLFormElement>('form[data-preview-form]')];
  document.addEventListener('astro:before-swap', () => {
    clearTimeout(receiptTimer);
    lifecycle.abort();
  }, { once: true, signal });

  function receipt(message: string, error = false) {
    const spot = document.querySelector<HTMLElement>('[data-sales-receipt]')!;
    clearTimeout(receiptTimer);
    spot.setAttribute('role', error ? 'alert' : 'status');
    spot.toggleAttribute('data-error', error);
    spot.textContent = message;
    spot.hidden = false;
    receiptTimer = setTimeout(() => { spot.hidden = true; }, error ? 6500 : 3400);
  }
  function showDetail(html: string) {
    if (!pane) return;
    pane.innerHTML = html;
    const heading = pane.querySelector('h2');
    if (heading) heading.id = pane.getAttribute('aria-labelledby')!;
  }
  async function readDetail(id: string) {
    if (!pane) return;
    lead = undefined;
    const generation = ++readGeneration;
    const available = list?.rows.find(row => row.id === id);
    showDetail(leadSummary(available));
    const active = () => !signal.aborted && generation === readGeneration && inspector?.selected === id && pane.open && !pane.dataset.closing;
    const timeout = setTimeout(() => {
      if (active()) pane.querySelector('[data-inspector-body]')?.insertAdjacentHTML('beforeend', detailFeedback('loading'));
    }, 500);
    try {
      const opened = readLead(await storage.read(), id);
      if (!active()) return;
      lead = opened;
      const scrollTop = pane.querySelector<HTMLElement>('[data-inspector-body]')?.scrollTop ?? 0;
      showDetail(leadDetail(opened));
      const body = pane.querySelector<HTMLElement>('[data-inspector-body]');
      if (body) body.scrollTop = scrollTop;
    } catch {
      if (active()) {
        pane.querySelector('.sales-inspector-feedback')?.remove();
        pane.querySelector('[data-inspector-body]')?.insertAdjacentHTML('beforeend', detailFeedback('error'));
      }
    } finally {
      clearTimeout(timeout);
    }
  }
  const inspector = pane && getInspector(pane, {
    render(id) { void readDetail(id); },
  });
  const recordTrigger = (id: string) => document.querySelector<HTMLElement>('[data-inspector-key="' + CSS.escape(id) + '"] [data-inspector-trigger]');

  async function refreshWorkspace(snapshot?: Workspace) {
    const generation = ++workspaceGeneration;
    const workspace = snapshot ?? await storage.read();
    if (signal.aborted || generation !== workspaceGeneration) return;
    document.querySelector<HTMLElement>('[data-sales-storage-error]')!.hidden = true;
    const month = document.querySelector<HTMLSelectElement>('[data-sales-month]');
    if (month) {
      const selected = filters.month || (isStatView(config.view) ? salesToday().slice(0, 7) : '');
      month.replaceChildren(
        ...(!isStatView(config.view) ? [new Option('全部月份', '', false, !selected)] : []),
        ...monthOptions(workspace, selected).map(value => new Option(monthLabel(value), value, false, value === selected)),
      );
    }
    if (isStatView(config.view)) {
      document.querySelector('[data-sales-stats]')!.innerHTML = statsContent(readStats(workspace, filters), config.view, postFor(filters.post));
      return;
    }
    const fresh = readList(workspace, filters, queue);
    const filtered = Boolean(filters.q || filters.month || filters.stage || filters.source && filters.source !== 'pending');
    if (clear) clear.hidden = !filtered;
    const tbody = document.querySelector<HTMLElement>('[data-sales-rows]')!;
    const template = document.createElement('template');
    template.innerHTML = '<table><tbody>' + listRows(fresh, queue, filtered) + '</tbody></table>';
    const oldRows = new Map([...tbody.querySelectorAll<HTMLElement>('[data-inspector-key]')].map(row => [row.dataset.inspectorKey, row]));
    const newRows = [...template.content.querySelectorAll<HTMLElement>('tr')].map(row => {
      const previous = oldRows.get(row.dataset.inspectorKey);
      return previous?.innerHTML === row.innerHTML ? previous : row;
    });
    tbody.replaceChildren(...newRows);
    const retained = newRows.find(row => row.dataset.inspectorKey === inspector?.selected);
    retained?.classList.add('selected');
    document.querySelector('[data-list-count]')!.textContent = fresh.count + ' 位';
    const badge = document.querySelector('[data-queue-count]');
    if (badge) badge.textContent = '待核对 (' + fresh.waiting + ')';
    list = fresh;
  }

  async function removeCustomer(button: HTMLButtonElement) {
    const id = button.closest<HTMLElement>('[data-inspector-key]')?.dataset.inspectorKey;
    const row = list?.rows.find(item => item.id === id);
    if (!row || deleting.has(row.id)) return;

    deleting.add(row.id);
    try {
      const confirmed = await businessConfirm(
        '删除后，该客户将从销售台账、来源核对和销售统计中移除。删除不可恢复。',
        { title: '删除「' + row.name + '」？', confirmLabel: '确认删除', cancelLabel: '取消', danger: true },
      );
      if (!confirmed || signal.aborted) return;

      button.disabled = true;
      button.textContent = '删除中';
      button.setAttribute('aria-busy', 'true');
      const position = list?.rows.findIndex(item => item.id === row.id) ?? -1;
      let saved: { workspace: Workspace; outcome: ReturnType<typeof deleteLead> };
      try {
        saved = await storage.write(workspace => ({ workspace, outcome: deleteLead(workspace, row.id) }));
      } catch {
        if (!signal.aborted) {
          receipt('删除未保存，客户记录已保留。请重试。', true);
          button.disabled = false;
          button.focus({ preventScroll: true });
        }
        return;
      }

      if (signal.aborted) return;
      await refreshWorkspace(saved.workspace);
      if (saved.outcome === 'deleted') receipt('已删除客户。');
      else if (saved.outcome === 'already-deleted') receipt('该客户已删除，列表已刷新。');
      else receipt('该客户已合并，请在列表中核对。', true);
      const remaining = list?.rows ?? [];
      const neighbor = remaining[Math.min(Math.max(0, position), remaining.length - 1)];
      const focus = neighbor ? recordTrigger(neighbor.id) : document.querySelector<HTMLElement>('[data-sales-sheet="create"]');
      focus?.focus({ preventScroll: true });
    } finally {
      deleting.delete(row.id);
      if (button.isConnected) {
        button.disabled = false;
        button.textContent = '删除';
        button.removeAttribute('aria-busy');
      }
    }
  }

  function selectPost(form: HTMLFormElement, post?: Post, version = '', entry = '仅确认帖子') {
    field(form, 'postId').value = post?.id ?? '';
    const selected = form.querySelector<HTMLElement>('[data-selected-post]')!;
    selected.hidden = !post;
    setSourcePicker(form);
    if (!post) return;
    selected.querySelector('strong')!.textContent = post.title;
    const type = selected.querySelector<HTMLElement>('[data-post-type]')!;
    type.textContent = postType(post);
    type.className = 'sales-status sales-status--' + (post.type === '推广' ? 'following' : 'new');
    selected.querySelector('[data-post-published]')!.textContent = dateText(post.published);
    selected.querySelector('[data-post-subject]')!.textContent = post.subject;
    selected.querySelector('[data-post-versions]')!.textContent = post.versions.join(' / ');
    selected.querySelector<HTMLElement>('[data-post-promotion-row]')!.hidden = !post.promotion;
    selected.querySelector('[data-post-promotion]')!.textContent = post.promotion ? post.promotion.name + ' · ' + post.promotion.stage : '';
    selected.querySelector<HTMLAnchorElement>('a')!.href = salesHref('posts', { post: post.id });
    field(form, 'version').innerHTML = '<option value="">仅确认原帖</option>' + post.versions.map(item => '<option>' + escapeText(item) + '</option>').join('');
    field(form, 'version').value = version;
    field(form, 'entry').value = entry;
  }

  function storageIssue(error: unknown) {
    if (signal.aborted) return;
    const feedback = document.querySelector<HTMLElement>('[data-sales-storage-error]')!;
    feedback.textContent = error instanceof Error ? error.message : '本浏览器暂时无法读取试用记录。请重新打开页面。';
    feedback.hidden = false;
  }
  function setSourcePicker(form: HTMLFormElement) {
    const status = field(form, 'sourceStatus').value;
    const isPost = status === 'confirmed';
    const extra = form.querySelector<HTMLDetailsElement>('[data-source-extra]')!;
    form.querySelector<HTMLElement>('[data-post-picker]')!.hidden = !isPost;
    form.querySelector<HTMLElement>('[data-source-options]')!.hidden = !isPost;
    extra.hidden = !isPost || !field(form, 'postId').value;
    form.querySelector<HTMLElement>('[data-other-source]')!.hidden = status !== 'other';
    form.querySelector<HTMLElement>('[data-unknown-source]')!.hidden = status !== 'unknown';
    for (const name of ['otherEntry', 'otherSource']) field(form, name).disabled = status !== 'other';
    field(form, 'unknownNote').disabled = status !== 'unknown';
  }
  function choosePost(form: HTMLFormElement, post?: Post) {
    if (!post) return;
    if (post.id !== field(form, 'postId').value) {
      field(form, 'evidence').value = '';
      selectPost(form, post);
      form.querySelector<HTMLDetailsElement>('[data-source-extra]')!.open = false;
    }
    form.querySelector<HTMLElement>('[data-post-results]')!.hidden = true;
    document.documentElement.dataset.unsaved = String(signature(form) !== baselines.get(form));
  }
  function findPost(form: HTMLFormElement) {
    const input = field(form, 'postQuery');
    const feedback = form.querySelector<HTMLElement>('[data-post-feedback]')!;
    const results = form.querySelector<HTMLElement>('[data-post-results]')!;
    const choices = form.querySelector<HTMLElement>('[data-post-choices]')!;
    const q = input.value.trim();
    results.hidden = true;
    if (!q) { feedback.textContent = '请输入帖子标题、笔记 ID 或分享链接。'; input.focus(); return; }
    candidates = searchPosts(q);
    if (candidates.length === 1) choosePost(form, candidates[0]);
    if (candidates.length > 1) {
      choices.innerHTML = candidates.map(postChoice).join('');
      results.hidden = false;
    }
    feedback.textContent = candidates.length ? '' : '样例中没有匹配的帖子。可以选择「其他来源」记录真实线索。';
  }

  function labelDirections(group: HTMLElement) {
    const rows = [...group.querySelectorAll<HTMLElement>('[data-direction]')];
    rows.forEach((row, index) => {
      row.querySelector('[data-direction-label]')!.textContent = '咨询方向 ' + (index + 1);
      const remove = row.querySelector<HTMLButtonElement>('[data-sales-remove-direction]')!;
      remove.hidden = rows.length === 1;
      remove.setAttribute('aria-label', '移除第 ' + (index + 1) + ' 个咨询方向');
    });
  }
  function addDirection(group: HTMLElement, item?: Direction) {
    const template = group.querySelector<HTMLTemplateElement>('[data-direction-template]')!;
    const row = template.content.firstElementChild!.cloneNode(true) as HTMLElement;
    const need = row.querySelector<HTMLSelectElement>('[name="need"]')!;
    const subject = row.querySelector<HTMLSelectElement>('[name="subject"]')!;
    need.value = item?.need ?? '';
    if (item?.subject && ![...subject.options].some(option => option.value === item.subject)) {
      subject.add(new Option(item.subject + '（原登记）', item.subject));
    }
    subject.value = item?.subject ?? '';
    row.querySelector<HTMLInputElement>('[name="interest"]')!.value = item?.interest ?? '';
    group.querySelector('[data-directions-list]')!.append(row);
    labelDirections(group);
    return need;
  }
  function openSheet(kind: Sheet, target: EditTarget | undefined = lead) {
    const form = forms.find(item => item.dataset.previewForm === kind);
    if (!form || kind !== 'create' && !target) return;
    const dialog = form.closest('dialog')!;
    const customer = form.querySelector<HTMLElement>('[data-sheet-customer]');
    form.reset();
    field(form, 'requestId').value = crypto.randomUUID();
    field(form, 'leadId').value = kind === 'create' ? '' : target!.id;
    form.querySelector('[data-save-error]')!.textContent = '';
    if (customer && target) {
      customer.querySelector('strong')!.textContent = target.name;
      customer.querySelector('span')!.textContent = '添加微信 ' + dateText(target.added);
    }
    if (kind === 'create') {
      field(form, 'addedDay').value = salesToday();
      field(form, 'addedTime').value = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
      }).format(new Date());
    }
    if (kind === 'contact' && target) {
      field(form, 'name').value = target.name;
      field(form, 'wechatId').value = target.wechatId ?? '';
      form.querySelector('h2')!.textContent = target.wechatId ? '编辑微信信息' : '补填微信号';
    }
    if (kind === 'follow' && target) field(form, 'stage').value = target.stage;
    const directions = form.querySelector<HTMLElement>('[data-sales-directions]');
    if (directions) {
      directions.querySelector('[data-directions-list]')!.replaceChildren();
      const current = kind === 'follow' ? target?.directions : undefined;
      if (current?.length) for (const direction of current) addDirection(directions, direction);
      else addDirection(directions);
    }
    if (kind === 'deal' && target) {
      const current = 'latestPayment' in target ? target.latestPayment :
        'payments' in target ? target.payments.find(payment => !payment.voided) : undefined;
      form.querySelector('h2')!.textContent = current ? '更正成交' : '登记成交';
      form.querySelector<HTMLButtonElement>('[data-sales-revoke]')!.hidden = !current;
      const paymentDate = field(form, 'dealDay') as HTMLInputElement;
      paymentDate.max = salesToday();
      paymentDate.value = current?.date || salesToday();
      field(form, 'product').value = current?.product || '';
    }
    if (kind === 'source' && target) {
      form.querySelector('h2')!.textContent = target.source.status === 'pending' ? '核对来源' : '更正来源';
      form.querySelector<HTMLElement>('[data-post-results]')!.hidden = true;
      form.querySelector('[data-post-feedback]')!.textContent = '';
      form.querySelector<HTMLDetailsElement>('[data-source-extra]')!.open = false;
      field(form, 'postQuery').value = target.post?.note ?? '';
      field(form, 'sourceStatus').value = target.source.status === 'pending' ? 'confirmed' : target.source.status;
      field(form, 'evidence').value = target.source.status === 'confirmed' ? target.source.evidence ?? '' : '';
      field(form, 'otherEntry').value = target.source.status === 'other' ? target.source.entry ?? '' : '';
      field(form, 'otherSource').value = target.source.status === 'other' ? target.source.evidence ?? '' : '';
      field(form, 'unknownNote').value = target.source.status === 'unknown' ? target.source.evidence ?? '' : '';
      selectPost(form, target.post, target.source.version, target.source.entry);
    }
    if (kind === 'merge' && lead && 'duplicates' in lead) {
      const duplicates = lead.duplicates ?? [];
      field(form, 'duplicateId').innerHTML = '<option value="">请选择要合并的登记</option>' + duplicates.map(other =>
        '<option value="' + escapeText(other.id) + '">' + escapeText(other.name + ' · ' + dateText(other.added)) + '</option>').join('');
    }
    baselines.set(form, signature(form));
    document.documentElement.dataset.unsaved = 'false';
    dialog.showModal();
    form.querySelector<HTMLElement>('[data-preview-form-body] :is(input:not([type=hidden]),select,textarea)')?.focus();
  }

  async function dismiss(form: HTMLFormElement) {
    if (form.dataset.saving) return;
    if (baselines.get(form) !== signature(form) && !await businessConfirm('这次填写尚未保存，是否放弃修改？')) return;
    document.documentElement.dataset.unsaved = 'false';
    await closeBusinessDialog(form.closest('dialog')!);
  }
  for (const form of forms) {
    const dialog = form.closest('dialog')!;
    dialog.setAttribute('data-dialog-cancel-managed', '');
    const kind = form.dataset.previewForm as Sheet;
    bindBusinessBackdrop(dialog, () => void dismiss(form), signal);
    dialog.addEventListener('cancel', event => { event.preventDefault(); void dismiss(form); });
    form.addEventListener('input', () => {
      form.querySelector('[data-save-error]')!.textContent = '';
      document.documentElement.dataset.unsaved = String(signature(form) !== baselines.get(form));
    });
    form.addEventListener('change', event => {
      const input = event.target as HTMLInputElement;
      if (input.name === 'sourceStatus') {
        form.querySelector<HTMLDetailsElement>('[data-source-extra]')!.open = false;
        setSourcePicker(form);
      }
      if (input.name === 'candidate') {
        choosePost(form, candidates.find(post => post.id === input.value));
        form.querySelector<HTMLAnchorElement>('[data-open-original]')?.focus({ preventScroll: true });
      }
      document.documentElement.dataset.unsaved = String(signature(form) !== baselines.get(form));
    });
    form.addEventListener('keydown', event => {
      if (event.key === 'Enter' && event.target === form.elements.namedItem('postQuery')) {
        event.preventDefault(); findPost(form);
      }
    });
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (form.dataset.saving) return;
      const error = form.querySelector<HTMLElement>('[data-save-error]')!;
      error.textContent = '';
      if (kind === 'merge' && (!field(form, 'duplicateId').value || !await businessConfirm(
        '请确认两条登记是同一个客户。合并后只计为一人。', { title: '确认合并重复登记', confirmLabel: '合并', cancelLabel: '返回核对' },
      ))) {
        if (!field(form, 'duplicateId').value) error.textContent = '请选择要合并的登记。';
        return;
      }
      const revoking = kind === 'deal' && (event as SubmitEvent).submitter?.hasAttribute('data-sales-revoke');
      if (revoking && !await businessConfirm(
        '撤销后，这位客户将从成交统计中移出。', { title: '撤销成交', confirmLabel: '确认撤销', cancelLabel: '继续编辑', danger: true },
      )) return;
      const payload = new FormData(form);
      const submitted = signature(form);
      if (kind === 'deal') payload.set('outcome', revoking ? 'no' : 'yes');
      form.dataset.saving = 'true';
      const submit = form.querySelector<HTMLButtonElement>('.save-button')!;
      const label = submit.textContent;
      submit.disabled = true;
      submit.textContent = '保存中…';
      try {
        const saved = await storage.write(workspace => saveLead(workspace, kind, payload));
        if (signal.aborted) return;
        document.documentElement.dataset.unsaved = 'false';
        await closeBusinessDialog(dialog);
        try { await refreshWorkspace(); } catch { receipt(sheetLabels[kind] + '，列表暂未刷新。可重新加载页面。'); return; }
        receipt(sheetLabels[kind]);
        if (kind === 'create') recordTrigger(saved)?.focus({ preventScroll: true });
        else if (inspector?.selected === saved) inspector.refresh();
        else if (kind === 'follow' || kind === 'deal') {
          recordTrigger(saved)?.closest('tr')?.querySelector<HTMLElement>('[data-sales-sheet="' + kind + '"]')?.focus({ preventScroll: true });
        } else if (kind === 'source') {
          const action = document.querySelector<HTMLElement>('[data-inspector-key="' + CSS.escape(saved) + '"] [data-sales-sheet="source"]')
            ?? document.querySelector<HTMLElement>('[data-sales-list-filter] button[type="submit"]');
          action?.focus({ preventScroll: true });
        }
      } catch (reason) {
        if (signal.aborted || signature(form) !== submitted) return;
        error.textContent = reason instanceof Error
          ? reason.message : '暂未收到保存结果，输入已保留，可以重试。';
        if (kind === 'source' && error.textContent.includes('判断入口或版本')) {
          form.querySelector<HTMLDetailsElement>('[data-source-extra]')!.open = true;
        }
      } finally {
        submit.disabled = false;
        submit.textContent = label;
        delete form.dataset.saving;
      }
    });
  }

  document.addEventListener('click', event => {
    const target = event.target as Element;
    const directionButton = target.closest<HTMLButtonElement>('[data-sales-add-direction],[data-sales-remove-direction]');
    if (directionButton?.form) {
      const group = directionButton.closest<HTMLElement>('[data-sales-directions]')!;
      if (directionButton.hasAttribute('data-sales-add-direction')) addDirection(group).focus();
      else {
        directionButton.closest('[data-direction]')?.remove();
        labelDirections(group);
        group.querySelector<HTMLButtonElement>('[data-sales-add-direction]')?.focus();
      }
      document.documentElement.dataset.unsaved = String(signature(directionButton.form) !== baselines.get(directionButton.form));
      return;
    }
    const remove = target.closest<HTMLButtonElement>('[data-sales-delete]');
    if (remove) { void removeCustomer(remove); return; }
    const edit = target.closest<HTMLButtonElement>('[data-sales-sheet]');
    if (edit) {
      const id = edit.closest<HTMLElement>('[data-inspector-key]')?.dataset.inspectorKey;
      openSheet(edit.dataset.salesSheet as Sheet, id ? list?.rows.find(row => row.id === id) : lead);
      return;
    }
    const cancel = target.closest<HTMLButtonElement>('[data-sales-cancel]');
    if (cancel?.form) { void dismiss(cancel.form); return; }
    const find = target.closest<HTMLButtonElement>('[data-find-post]');
    if (find?.form) { findPost(find.form); return; }
    if (target.closest('[data-sales-retry]') && inspector?.selected) { void readDetail(inspector.selected); return; }
    const trigger = target.closest<HTMLButtonElement>('[data-inspector-trigger]');
    const id = trigger?.closest<HTMLElement>('[data-inspector-key]')?.dataset.inspectorKey;
    if (id && trigger) inspector?.open(id, trigger);
  }, { signal });
  const statSwitch = document.querySelector('[data-preview-stat-switch]');
  statSwitch?.querySelectorAll<HTMLInputElement>('input').forEach(input => { input.checked = input.value === config.view; });
  statSwitch?.addEventListener('change', event => {
    const target = event.target as HTMLInputElement;
    const previous = new URL(location.href).searchParams;
    const selected = statSwitch.querySelector<HTMLInputElement>('input[value="' + config.view + '"]');
    if (selected) selected.checked = true;
    void navigate(salesHref(target.value as View, { month: previous.get('month') ?? '' }));
  }, { signal });
  document.querySelector<HTMLFormElement>('[data-sales-stat-filter]')?.addEventListener('submit', event => {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const data = new FormData(form);
    void navigate(salesHref(config.view, { month: String(data.get('month') ?? ''), post: String(data.get('post') ?? '') }));
  }, { signal });
  const applyFilters = () => {
    if (!listFilter) return;
    const parameters = new URLSearchParams();
    for (const [key, value] of new FormData(listFilter)) if (typeof value === 'string') parameters.set(key, value);
    filters = filtersFrom(parameters);
    void refreshWorkspace().catch(storageIssue);
  };
  listFilter?.addEventListener('submit', event => { event.preventDefault(); applyFilters(); });
  clear?.addEventListener('click', () => {
    if (!listFilter) return;
    for (const name of ['q', 'month', 'stage', 'source']) {
      const control = listFilter.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement | null;
      if (control) control.value = name === 'source' ? 'pending' : '';
    }
    applyFilters();
  });
  document.addEventListener('business:navigation-discard', () => { document.documentElement.dataset.unsaved = 'false'; }, { signal });
  window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); }, { signal });

  void refreshWorkspace().then(() => {
    if (signal.aborted) return;
    const registration = document.querySelector<HTMLButtonElement>('[data-sales-sheet="create"]');
    if (registration) registration.disabled = false;
    const requested = new URL(location.href).searchParams.get('record');
    if (requested) inspector?.open(requested, recordTrigger(requested), false);
  }).catch(storageIssue);
}

function initialize() {
  const element = document.getElementById('sales-trial-config');
  if (!element?.textContent || element.dataset.ready) return;
  element.dataset.ready = 'true';
  start(JSON.parse(element.textContent) as Config);
}
initialize();
document.addEventListener('astro:page-load', initialize);
