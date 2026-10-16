import { getInspector } from './business-inspector';
import { isDelayed } from '../db/schedule-rules.mjs';
type SavedReason = { reason: string; responsibility: 'self' | 'requester' | 'unknown'; source: string; updatedAt: string; changedByLabel: string; history: Array<unknown> };
type DelayDay = { planRevision: number; dayNumber: number; dueAt: string; saved: SavedReason | null; archived: boolean };
type Application = { id: string; status: string; originalPlannedPublishAt: string; requestedPublishAt: string; reason: string; requestedByLabel: string; decisionReason: string | null; decidedByLabel: string | null };
type Workflow = { schedule: { id: string; planRevision: number; plannedPublishAt: string; actualPublishAt: string | null }; overdueDays: number; days: DelayDay[]; applications: Application[]; history: Array<{ revision: number; plannedPublishAt: string; newPlannedPublishAt: string; reason: string; changedByLabel: string }> };
const element = <K extends keyof HTMLElementTagNameMap>(tag: K, text?: string) => {
  const node = document.createElement(tag); if (text !== undefined) node.textContent = text; return node;
};
const timeLabel = (value: string) => new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(value));
const inputTime = (value: string) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(value)).replace(' ', 'T');
const hidden = (form: HTMLElement, name: string, value: string) => {
  const input = element('input'); input.type = 'hidden'; input.name = name; input.value = value; form.append(input);
};
const textField = (form: HTMLElement, name: string, labelText: string, multiline = true) => {
  const label = element('label', labelText); const control = multiline ? element('textarea') : element('input');
  control.name = name; control.required = true; control.maxLength = 500; label.append(control); form.append(label); return control;
};
const responsibilityField = (host: HTMLElement, selected = '') => {
  const label = element('label', '责任方'); const select = element('select'); select.name = 'responsibility'; select.required = true;
  for (const [value, text] of [['','请选择'],['self','自身原因'],['requester','需求端原因']]) {
    const option = element('option', text); option.value = value; select.append(option);
  }
  select.value = selected; label.append(select); host.append(label); return select;
};
async function getWorkflow(id: string, actual?: string) {
  const query = actual ? `?actual=${encodeURIComponent(actual)}` : '';
  const response = await fetch(`/api/operations-content/${id}/workflow${query}`, { cache: 'no-store' });
  const result = await response.json();
  if (!response.ok) throw new Error(result.message || '读取失败，请重试。');
  return result as Workflow;
}
function bindForm(form: HTMLFormElement, endpoint: string, onSaved: () => void, method = 'POST') {
  const output = element('output'); output.setAttribute('role', 'alert'); form.append(output);
  form.addEventListener('input', () => { document.documentElement.dataset.unsaved = 'true'; });
  form.addEventListener('submit', async event => {
    event.preventDefault(); if (!form.reportValidity()) return;
    const button = form.querySelector<HTMLButtonElement>('button[type=submit]')!; button.disabled = true; output.textContent = '正在保存…';
    try {
      const response = await fetch(endpoint, { method, body: new FormData(form), headers: { Accept: 'application/json' } });
      const result = await response.json();
      if (!response.ok) {
        const messages: string[] = [];
        for (const [name, errors] of Object.entries(result.fields ?? {})) {
          const control = form.elements.namedItem(name);
          if (control instanceof HTMLElement) control.setAttribute('aria-invalid','true');
          messages.push(...(errors as string[]));
        }
        output.textContent = messages.join('；') || result.message || '保存失败。'; return;
      }
      const pane=form.closest<HTMLElement>('[data-inspector]');
      if(pane)getInspector(pane).setClean(); else document.documentElement.dataset.unsaved = 'false';
      document.dispatchEvent(new Event('business:workflow-updated')); onSaved();
    } catch { output.textContent = '连接失败，当前输入已保留，请重试。'; }
    finally { button.disabled = false; }
  });
}
function submitButton(form: HTMLElement, text: string) { const button = element('button', text); button.type = 'submit'; form.append(button); }
function reasonForm(day: DelayDay, scheduleId: string, onSaved: () => void) {
  const form = element('form'); form.className = 'workflow-form';
  hidden(form, 'planRevision', String(day.planRevision)); hidden(form, 'dayNumber', String(day.dayNumber)); hidden(form, 'expectedUpdatedAt', day.saved?.updatedAt || '');
  if (day.saved) hidden(form, 'expectedHistoryLength', String(day.saved.history.length));
  responsibilityField(form, day.saved?.responsibility === 'unknown' ? '' : day.saved?.responsibility);
  const text = textField(form, 'reason', '文字原因'); text.value = day.saved?.reason || ''; text.setAttribute('placeholder', '例如：今日请假／今日确实未完成／今日正在修改中');
  submitButton(form, day.saved ? '保存更正' : '保存这一天的原因'); bindForm(form, `/api/operations-content/${scheduleId}/delay-reasons`, onSaved); return form;
}
let lifecycle: AbortController | undefined;
function initialize() {
  lifecycle?.abort(); lifecycle = new AbortController(); const signal = lifecycle.signal;
  const panel = document.querySelector<HTMLElement>('[data-schedule-workflow]');
  const publication = document.querySelector<HTMLFormElement>('#publication-form');
  if (!panel || !publication) return;
  let panelToken = 0; let publicationId = ''; let publicationToken = 0;
  let pendingTimer: ReturnType<typeof setTimeout>; let publicationDays: DelayDay[] = [];
  const isAdmin = document.querySelector<HTMLElement>('[data-user-role]')?.dataset.userRole === 'admin';
  const reload = () => { document.documentElement.dataset.unsaved = 'false'; location.reload(); };
  async function showPanel(id: string) {
    const token = ++panelToken;
    panel!.replaceChildren(element('p', '正在读取延期与审批记录…'));
    try {
      const workflow = await getWorkflow(id); if (signal.aborted || token !== panelToken) return;
      panel!.replaceChildren();
      const pending = workflow.days.filter(day => !day.saved && !day.archived);
      if (workflow.overdueDays) { const warning = element('p', `延期第 ${workflow.overdueDays} 天${pending.length ? `，请填写 ${pending.length} 天的原因` : '，原因已填写，等待发布'}`); warning.className = 'workflow-warning'; panel!.append(warning); }
      if (workflow.days.length) {
        const details = element('details'); details.open = pending.length > 0;
        details.append(element('summary', `逐日延期记录 ${workflow.days.length} 条${pending.length ? ` · 待补 ${pending.length} 条` : ''}`));
        for (const day of workflow.days) {
          const row = element('section'); row.className = 'workflow-reason';
          row.append(element('h4', `排期 R${day.planRevision} · 第 ${day.dayNumber} 天 · ${timeLabel(day.dueAt)}`));
          if (day.saved) {
            const labels = { self: '自身原因', requester: '需求端原因', unknown: '历史未确认' };
            row.append(element('p', `${labels[day.saved.responsibility]}：${day.saved.reason}`));
            row.append(element('small', `${day.saved.source === 'historical' ? '历史补齐' : day.saved.changedByLabel}${day.archived ? ' · 实发更正前的记录' : ''}`));
            if (!day.archived) {
              const button = element('button', '更正理由'); button.type = 'button';
              const form = reasonForm(day, id, () => showPanel(id)); form.hidden = true;
              button.addEventListener('click', () => { form.hidden = !form.hidden; if (!form.hidden) form.querySelector('select')?.focus(); }); row.append(button, form);
            }
          } else if (!day.archived) row.append(reasonForm(day, id, () => showPanel(id)));
          details.append(row);
        }
        panel!.append(details);
      }
      const pendingRequest = workflow.applications.find(application => application.status === 'pending');
      if (!workflow.schedule.actualPublishAt && !isAdmin && !pendingRequest) {
        const details = element('details'); details.append(element('summary', '申请调整排期'));
        const form = element('form'); form.className = 'workflow-form';
        hidden(form, 'expectedPlanRevision', String(workflow.schedule.planRevision));
        const date = textField(form, 'plannedPublishAt', '申请的新发送时间', false) as HTMLInputElement;
        date.type = 'datetime-local'; date.value = inputTime(workflow.schedule.plannedPublishAt);
        textField(form, 'reason', '改期申请理由'); form.append(element('p', '批准前原排期继续生效，逐日理由仍需填写。'));
        submitButton(form, '提交管理员审批'); bindForm(form, `/api/operations-content/${id}/change-requests`, reload); details.append(form); panel!.append(details);
      }
      if (workflow.applications.length) {
        const details = element('details'); details.open = Boolean(pendingRequest); details.append(element('summary', `改期申请 ${workflow.applications.length} 条`));
        const labels: Record<string,string> = { pending:'待审批',approved:'已同意',rejected:'已驳回',obsolete:'已失效' };
        for (const application of [...workflow.applications].reverse()) {
          const row = element('section'); row.className = 'workflow-application';
          row.append(element('p', `${labels[application.status]} · ${application.requestedByLabel}\n${timeLabel(application.originalPlannedPublishAt)} → ${timeLabel(application.requestedPublishAt)}\n${application.reason}`));
          if (application.decisionReason) row.append(element('small', `${application.decidedByLabel || '系统'}：${application.decisionReason}`));
          if (isAdmin && application.status === 'pending') {
            for (const action of ['approve','reject']) {
              const form = element('form'); form.className = 'workflow-form'; hidden(form,'action',action);
              if (action === 'reject') textField(form, 'reason', '驳回说明');
              submitButton(form, action === 'approve' ? '同意调整排期' : '驳回申请');
              bindForm(form, `/api/operations-content/${id}/change-requests/${application.id}`, reload, 'PATCH'); row.append(form);
            }
          }
          details.append(row);
        }
        panel!.append(details);
      }
      if (workflow.history.length) {
        const details = element('details'); details.append(element('summary', `排期变更历史 ${workflow.history.length} 条`));
        for (const plan of workflow.history) {
          const row = element('p', `R${plan.revision} → R${plan.revision+1} · ${timeLabel(plan.plannedPublishAt)} → ${timeLabel(plan.newPlannedPublishAt)}\n${plan.changedByLabel}：${plan.reason}`);
          row.className = 'workflow-plan-history'; details.append(row);
        }
        panel!.append(details);
      }
      if (!panel!.childElementCount) panel!.append(element('p', '当前没有延期或改期记录。'));
    } catch (error) {
      if (signal.aborted || token !== panelToken) return;
      panel!.replaceChildren(element('p', error instanceof Error ? error.message : '读取失败。'));
      const button = element('button', '重新读取'); button.addEventListener('click', () => showPanel(id)); panel!.append(button);
    }
  }
  const host = publication.querySelector<HTMLElement>('[data-publication-delay-days]')!;
  const status = publication.querySelector<HTMLElement>('[data-publication-delay-status]')!;
  const collectInput = () => [...host.querySelectorAll<HTMLElement>('[data-delay-day]')].map(row => ({
    planRevision: Number(row.dataset.planRevision), dayNumber: Number(row.dataset.dayNumber), expectedUpdatedAt: null,
    responsibility: row.querySelector<HTMLSelectElement>('select')!.value, reason: row.querySelector<HTMLTextAreaElement>('textarea')!.value,
  }));
  async function showPublication() {
    if (!publicationId) return;
    const token = ++publicationToken; host.dataset.ready = 'false'; status.textContent = '正在核对逐日理由…';
    const retained = new Map(collectInput().map(input => [`${input.planRevision}:${input.dayNumber}`,input]));
    const actual = (publication!.elements.namedItem('actualPublishAt') as HTMLInputElement).value;
    try {
      const workflow = await getWorkflow(publicationId, actual); if (signal.aborted || token !== publicationToken) return;
      (publication!.elements.namedItem('expectedPlanRevision') as HTMLInputElement).value = String(workflow.schedule.planRevision);
      (publication!.elements.namedItem('plannedPublishAt') as HTMLInputElement).value = inputTime(workflow.schedule.plannedPublishAt);
      const statusOutput = publication!.querySelector<HTMLOutputElement>('[data-publication-status]')!;
      if (actual) statusOutput.value = isDelayed(new Date(workflow.schedule.plannedPublishAt),new Date(`${actual}:00+08:00`)) ? '延期发布' : '按时发布';
      publicationDays = workflow.days; host.replaceChildren();
      const pending = publicationDays.filter(day => !day.saved && !day.archived);
      status.textContent = pending.length ? `请逐日填写 ${pending.length} 条理由，保存时与实发事实一起提交。` : '逐日理由已齐全。';
      for (const day of pending) {
        const row = element('section'); row.className = 'publication-reason-day'; row.dataset.delayDay = '';
        row.dataset.planRevision = String(day.planRevision); row.dataset.dayNumber = String(day.dayNumber);
        row.append(element('strong', `排期 R${day.planRevision} · 第 ${day.dayNumber} 天 · ${timeLabel(day.dueAt)}`));
        const prior = retained.get(`${day.planRevision}:${day.dayNumber}`); responsibilityField(row, prior?.responsibility);
        const text = textField(row, '', '文字原因'); text.value = prior?.reason || ''; text.setAttribute('placeholder', '例如：今日正在修改中');
        host.append(row);
      }
      const saved = publicationDays.filter(day => day.saved);
      if (saved.length) {
        const details = element('details'); details.append(element('summary', `已填写／历史理由 ${saved.length} 条`));
        for (const day of saved) { const row = element('section'); row.className='publication-reason-day'; row.append(element('strong', `R${day.planRevision} · 第 ${day.dayNumber} 天 · ${timeLabel(day.dueAt)}`),element('p', day.saved!.reason),element('small', day.saved!.source==='historical'?'历史补齐':day.saved!.changedByLabel)); details.append(row); }
        host.append(details);
      }
      const section = publication!.querySelector<HTMLElement>('[data-publication-delay]')!; section.hidden = publicationDays.length === 0;
      host.dataset.ready = 'true';
    } catch (error) { if (token === publicationToken) status.textContent = error instanceof Error ? error.message : '读取失败，请重新选择实发时间。'; }
  }
  document.addEventListener('business:schedule-selected', event => showPanel((event as CustomEvent).detail.id), { signal });
  document.addEventListener('business:publication-opened', event => {
    publicationId = (event as CustomEvent).detail.id; host.replaceChildren(); publicationDays = [];
    publication!.querySelector<HTMLElement>('[data-publication-delay]')!.hidden = false; showPublication();
  }, { signal });
  publication.querySelector('[name=actualPublishAt]')!.addEventListener('input', () => {
    host.dataset.ready = 'false'; clearTimeout(pendingTimer); pendingTimer = setTimeout(showPublication, 200);
  }, { signal });
  publication.addEventListener('submit', event => {
    if (host.dataset.ready !== 'true') { event.preventDefault(); event.stopImmediatePropagation(); status.textContent = '正在核对理由，请稍后保存；读取失败时请重新选择实发时间。'; return; }
    if (!publication!.reportValidity()) { event.preventDefault(); event.stopImmediatePropagation(); return; }
    (publication!.elements.namedItem('dailyReasons') as HTMLInputElement).value = JSON.stringify(collectInput());
  }, { capture: true, signal });
  const initialId = document.querySelector<HTMLElement>('[data-inspector]')?.dataset.selectedId;
  if (initialId) showPanel(initialId);
}
document.addEventListener('astro:page-load', initialize);
initialize();
