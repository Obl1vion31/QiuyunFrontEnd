import { configureDateTimeField } from './business-datetime';
import { businessDateTime } from './business-date';
import { getInspector } from './business-inspector';
import { extractPublicationLink } from '../db/publication-link.mjs';
import { publicationLabels } from '../db/publication-rules.mjs';
import { isDelayed } from '../db/schedule-rules.mjs';
type SavedReason = { reason: string; responsibility: 'self' | 'requester' | 'unknown'; source: string; updatedAt: string; changedByLabel: string; history: Array<unknown> };
type DelayDay = { planRevision: number; dayNumber: number; dueAt: string; saved: SavedReason | null; archived: boolean };
type Application = { id: string; status: string; originalPlannedPublishAt: string; requestedPublishAt: string; reason: string; requestedByLabel: string; decisionReason: string | null; decidedByLabel: string | null };
type Reservation={history:Array<{status:string;actorLabel:string;at:string;reason:string|null}>;id:string;scheduledPublishAt:string;status:string;planRevision:number;requestedByLabel:string;decidedByLabel:string|null;decisionReason:string|null};
type Workflow = {allowEmptyPublicationLink:boolean;publicationState:keyof typeof publicationLabels;publicationReservations:Reservation[];publicationHistory:Array<{revision:number;before:{actualPublishAt:string|null;publicationUrl:string|null};after:{actualPublishAt:string;publicationUrl:string|null};changedByLabel:string;reason:string|null;createdAt:string}>; schedule: { id: string; planRevision: number;publicationRevision:number;publicationUrl:string|null; plannedPublishAt: string; actualPublishAt: string | null }; overdueDays: number; days: DelayDay[]; applications: Application[]; history: Array<{ revision: number; plannedPublishAt: string; newPlannedPublishAt: string; reason: string; changedByLabel: string }> };
const element = <K extends keyof HTMLElementTagNameMap>(tag: K, text?: string) => {
  const node = document.createElement(tag); if (text !== undefined) node.textContent = text; return node;
};
const timeLabel = businessDateTime;
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
  const form = element('form'); form.className = 'workflow-form business-form';
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
      const stateLabel=publicationLabels[workflow.publicationState];
      document.dispatchEvent(new CustomEvent('business:publication-context',{detail:{...workflow,publicationLabel:stateLabel}}));
      const stateNode=document.querySelector<HTMLElement>('[data-inspector-publication-state]');if(stateNode)stateNode.textContent=stateLabel;
      const rowState=document.querySelector<HTMLElement>(`[data-publication-row-state="${CSS.escape(id)}"]`);if(rowState)rowState.textContent=stateLabel;
      if(workflow.publicationReservations.length){
        const details=element('details');details.open=false;
        details.append(element('summary',`历史预约记录 ${workflow.publicationReservations.length} 条`));
        const labels:Record<string,string>={pending:'预约待审',approved:'已审核预约',rejected:'已驳回',cancelled:'已取消',obsolete:'已失效',fulfilled:'已完成实发'};
        for(const booking of workflow.publicationReservations){
          const row=element('section');row.className='workflow-application';row.append(element('p',`${labels[booking.status]} · ${booking.requestedByLabel}\n预约 ${timeLabel(booking.scheduledPublishAt)}`));
          if(booking.decisionReason||booking.decidedByLabel)row.append(element('small',`${booking.decidedByLabel||'系统'}：${booking.decisionReason||'审核通过'}`));
          if(booking.history.length){const history=element('details');history.append(element('summary','预约操作历史'));for(const entry of booking.history)history.append(element('p',`${labels[entry.status]} · ${entry.actorLabel} · ${timeLabel(entry.at)}${entry.reason?'\n'+entry.reason:''}`));row.append(history);}
          details.append(row);
        }
        panel!.append(details);
      }
      if(workflow.publicationHistory.length){
        const details=element('details');details.append(element('summary',`发布登记与更正历史 ${workflow.publicationHistory.length} 条`));
        for(const entry of workflow.publicationHistory){const row=element('section');row.className='workflow-plan-history';row.append(element('p',`R${entry.revision} · ${entry.changedByLabel} · ${timeLabel(entry.createdAt)}\n实发：${entry.before.actualPublishAt?timeLabel(entry.before.actualPublishAt):'未登记'} → ${timeLabel(entry.after.actualPublishAt)}`));
          if(entry.reason)row.append(element('p',entry.reason));
          if(entry.before.publicationUrl) {const old=element('a','查看原帖子链接 ↗');old.href=entry.before.publicationUrl;old.target='_blank';old.rel='noreferrer';row.append(old);}
          if(entry.after.publicationUrl){const link=element('a','查看登记的帖子链接 ↗');link.href=entry.after.publicationUrl;link.target='_blank';link.rel='noreferrer';row.append(link);}details.append(row);
        }panel!.append(details);
      }
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
        const form = element('form'); form.className = 'workflow-form business-form';
        hidden(form, 'expectedPlanRevision', String(workflow.schedule.planRevision));
        const dateTime=document.querySelector<HTMLTemplateElement>('[data-change-request-datetime]')!.content.cloneNode(true) as DocumentFragment;
        configureDateTimeField(dateTime.querySelector<HTMLElement>('[data-datetime-field]')!,{value:inputTime(workflow.schedule.plannedPublishAt)});
        form.append(dateTime);
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
              const form = element('form'); form.className = 'workflow-form business-form'; hidden(form,'action',action);
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
  const linkControl=publication.elements.namedItem('publicationUrl') as HTMLTextAreaElement;
  const preview=publication.querySelector<HTMLOutputElement>('[data-publication-link-preview]')!;
  const validateLink=()=>{
    const value=linkControl.value.trim();
    const result=extractPublicationLink(value);
    linkControl.setCustomValidity(value?result.error:'');
    preview.textContent=value?(result.error||`已识别：${result.url}`):'';
    preview.dataset.invalid=String(Boolean(value&&result.error));
  };
  linkControl.addEventListener('input',validateLink,{signal});
  document.addEventListener('business:publication-opened',validateLink,{signal});
  const host = publication.querySelector<HTMLElement>('[data-publication-delay-days]')!;
  const status = publication.querySelector<HTMLElement>('[data-publication-delay-status]')!;
  const collectInput = () => [...host.querySelectorAll<HTMLElement>('[data-delay-day]')].map(row => ({
    planRevision: Number(row.dataset.planRevision), dayNumber: Number(row.dataset.dayNumber), expectedUpdatedAt: null,
    responsibility: row.querySelector<HTMLSelectElement>('select')!.value, reason: row.querySelector<HTMLTextAreaElement>('textarea')!.value,
  }));
  async function showPublication() {
    if (!publicationId) return;
    const token = ++publicationToken;
    host.dataset.ready = 'false'; status.textContent = '正在核对逐日理由…';
    const retained = new Map(collectInput().map(input => [`${input.planRevision}:${input.dayNumber}`,input]));
    const control=publication!.elements.namedItem('actualPublishAt') as HTMLInputElement;
    const actual=control.disabled?'':control.value;
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
  publication.addEventListener('input', event => {
    if(!(event.target instanceof Element)||!event.target.closest('[data-datetime-name="actualPublishAt"]'))return;
    publicationToken++; host.dataset.ready = 'false'; clearTimeout(pendingTimer); pendingTimer = setTimeout(showPublication, 200);
  }, { signal });
  publication.addEventListener('change',event=>{if((event.target as HTMLInputElement).name==='correctTime'){clearTimeout(pendingTimer);showPublication();}},{signal});
  publication.addEventListener('submit', event => {
    validateLink();
    if (host.dataset.ready !== 'true') { event.preventDefault(); event.stopImmediatePropagation(); status.textContent = '正在核对理由，请稍后保存；读取失败时请重新选择实发时间。'; return; }
    if (!publication!.reportValidity()) { event.preventDefault(); event.stopImmediatePropagation(); return; }
    (publication!.elements.namedItem('dailyReasons') as HTMLInputElement).value = JSON.stringify(collectInput());
  }, { capture: true, signal });
  const initialId = document.querySelector<HTMLElement>('[data-inspector]')?.dataset.selectedId;
  if (initialId) showPanel(initialId);
}
document.addEventListener('astro:page-load', initialize);
initialize();
