import type {PublicationMomentsConfirmation} from '../db/schema';
import './promotion-timeline';
import './schedule-approvals';
import {appendChangeDiff} from './business-change-diff';
import {mayOperate} from './business-permissions';
import { configureDateTimeField } from './business-datetime';
import { businessDateTime, delayDayLabel } from './business-date';
import { getInspector } from './business-inspector';
import { beginBusinessRead } from './business-read';
import { extractPublicationLink } from '../db/publication-link.mjs';
import { publicationLabels } from '../db/publication-rules.mjs';
import { isDelayed, delayResponsibilityLabels } from '../db/schedule-rules.mjs';
type SavedReason = { reason: string; responsibility: 'self' | 'external' | 'requester' | 'unknown'; source: string; updatedAt: string; changedByLabel: string; history: Array<unknown> };
type DelayDay = { planRevision: number; dayNumber: number; dueAt: string; saved: SavedReason | null; archived: boolean };
type Application = { id: string; status: string; originalPlannedPublishAt: string; requestedPublishAt: string; reason: string; requestedByLabel: string; decisionReason: string | null; decidedByLabel: string | null };
type Reservation={history:Array<{status:string;actorLabel:string;at:string;reason:string|null}>;id:string;scheduledPublishAt:string;status:string;planRevision:number;requestedByLabel:string;decidedByLabel:string|null;decisionReason:string|null};
type ChangeProposal={key:string;name:string;title:string;requestedBy:string;reason:string;endpoint:string;scheduleId:string|null;diff:Array<{label:string;before:string;after:string}>};
type Workflow = {delayLabel:string;changeProposals?:ChangeProposal[];registrationState:'pending'|'missing'|'registered';requiresPlanApproval:boolean;allowEmptyPublicationLink:boolean;publicationState:keyof typeof publicationLabels;publicationReservations:Reservation[];publicationHistory:Array<{revision:number;before:{actualPublishAt:string|null;publicationUrl:string|null;momentsConfirmation?:PublicationMomentsConfirmation};after:{actualPublishAt:string;publicationUrl:string|null;momentsConfirmation?:PublicationMomentsConfirmation};changedByLabel:string;reason:string|null;createdAt:string}>; schedule: { id: string; planRevision: number;publicationRevision:number;publicationUrl:string|null; delayThresholdHours:number; plannedPublishAt: string; actualPublishAt: string | null }; overdueDays: number; days: DelayDay[]; applications: Application[]; history: Array<{ revision: number; plannedPublishAt: string; newPlannedPublishAt: string; reason: string; changedByLabel: string }> };
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
let responsibilityGroup=0;
const responsibilityField = (host: HTMLElement, selected = '', name = 'responsibility') => {
  const group=element('fieldset');group.append(element('legend','原因归属'));
  const options=element('div');options.className='responsibility-options';
  for(const value of ['self','external'] as const){
    const label=element('label');const input=element('input');input.type='radio';input.name=name;input.value=value;input.required=true;
    input.checked=(selected==='requester'?'external':selected)===value;label.append(input,document.createTextNode(delayResponsibilityLabels[value]));options.append(label);
  }
  group.append(options);host.append(group);return group;
};
const restoreResponsibility=(host:HTMLElement,value:string)=>host.querySelectorAll<HTMLInputElement>('input[type=radio]').forEach(input=>input.checked=input.value===value);
const reasonLabel=(workflow:Workflow,day:DelayDay)=>`${businessDateTime(day.dueAt)} · ${delayDayLabel(workflow.schedule.plannedPublishAt,day.dueAt)}`;
async function getWorkflow(id: string, actual?: string, signal?: AbortSignal) {
  const query = actual ? `?actual=${encodeURIComponent(actual)}` : '';
  const response = await fetch(`/api/operations-content/${id}/workflow${query}`, { cache: 'no-store', signal });
  const result = await response.json();
  if (!response.ok) throw new Error(result.message || '读取失败，请重试。');
  return result as Workflow;
}
function bindForm(form: HTMLFormElement, endpoint: string, onSaved: () => void, method = 'POST') {
  const output = element('output'); output.setAttribute('role', 'alert'); form.append(output);
  form.addEventListener('input', () => { form.dataset.dirty = 'true'; document.documentElement.dataset.unsaved = 'true'; });
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
      form.dataset.dirty = 'false';
      const pane=form.closest<HTMLElement>('[data-inspector]');
      const otherDrafts=pane?.querySelector('form[data-dirty=true]');
      if(pane&&otherDrafts){pane.dataset.dirty='true';document.documentElement.dataset.unsaved='true';}
      else if(pane)getInspector(pane).setClean(); else document.documentElement.dataset.unsaved = 'false';
      if(response.status===202){
        if(otherDrafts){output.textContent=result.message??'已提交管理员审核。';document.dispatchEvent(new Event('business:workflow-updated'));}
        else location.reload();
        return;
      }
      document.dispatchEvent(new Event('business:workflow-updated')); onSaved();
    } catch { output.textContent = '连接失败，当前输入已保留，请重试。'; }
    finally { button.disabled = false; }
  });
}
function submitButton(form: HTMLElement, text: string) { const button = element('button', text); button.type = 'submit'; button.className = 'business-action-primary'; form.append(button); }
function reasonForm(day: DelayDay, scheduleId: string, onSaved: () => void) {
  const form = element('form'); form.className = 'workflow-form business-form';
  hidden(form, 'planRevision', String(day.planRevision)); hidden(form, 'dayNumber', String(day.dayNumber)); hidden(form, 'expectedUpdatedAt', day.saved?.updatedAt || '');
  if (day.saved) hidden(form, 'expectedHistoryLength', String(day.saved.history.length));
  const fields=element('div');fields.className='business-reason-fields';form.append(fields);
  responsibilityField(fields, day.saved?.responsibility === 'unknown' ? '' : day.saved?.responsibility);
  const text = textField(fields, 'reason', '文字原因'); text.value = day.saved?.reason || ''; text.setAttribute('placeholder', '例如：今日请假／今日确实未完成／今日正在修改中');
  submitButton(form, day.saved ? '保存更正' : '保存这一天的原因'); bindForm(form, `/api/operations-content/${scheduleId}/delay-reasons`, onSaved); return form;
}
let lifecycle: AbortController | undefined;
function initialize() {
  lifecycle?.abort(); lifecycle = new AbortController(); const signal = lifecycle.signal;
  const panel = document.querySelector<HTMLElement>('[data-schedule-workflow]');
  const publication = document.querySelector<HTMLFormElement>('#publication-form');
  if (!panel || !publication) return;
  let stopLoading=()=>{};let stopPublicationRead=()=>{};
  let panelToken = 0; let publicationId = ''; let publicationToken = 0;
  let pendingTimer: ReturnType<typeof setTimeout>; let publicationDays: DelayDay[] = [];
  const isAdmin = document.querySelector<HTMLElement>('[data-user-role]')?.dataset.userRole === 'admin';
  const reload = () => { document.documentElement.dataset.unsaved = 'false'; location.reload(); };
  type ReasonDraft = {responsibility:string; reason:string; open:boolean};
  document.addEventListener('business:schedule-approval-decided',event=>{const id=(event as CustomEvent).detail?.id;if(id&&panel?.dataset.scheduleId===id)void showPanel(id);},{signal});
  async function showPanel(id: string, priorDrafts?:Map<string,ReasonDraft>) {
    const token = ++panelToken;
    const historyHost = document.querySelector<HTMLElement>('[data-schedule-workflow-history]')!;
    const switched = panel!.dataset.loadedScheduleId !== id;
    const retained = priorDrafts ?? new Map<string,ReasonDraft>();
    if (panel!.dataset.scheduleId === id) for (const form of [...panel!.querySelectorAll<HTMLFormElement>('form[data-dirty=true]'),...historyHost.querySelectorAll<HTMLFormElement>('form[data-dirty=true]')]) {
      const data = new FormData(form);
      if (data.has('dayNumber')) retained.set(`${data.get('planRevision')}:${data.get('dayNumber')}`, {responsibility:String(data.get('responsibility')),reason:String(data.get('reason')),open:form.closest('details')?.open ?? true});
    }
    panel!.dataset.scheduleId = id; panel!.dataset.ready = 'false'; panel!.hidden = true;
    historyHost.replaceChildren(); historyHost.hidden = true;
    panel!.replaceChildren();stopLoading();
    const pane=panel!.closest<HTMLElement>('[data-inspector]')!;
    const read=beginBusinessRead(pane,{signal,isCurrent:()=>token===panelToken&&pane.dataset.selectedId===id});
    const cleanup=read.finish;stopLoading=read.cancel;
    if(retained.size)panel!.dispatchEvent(new Event('input',{bubbles:true}));
    try {
      const [workflow,timelineResponse] = await Promise.all([getWorkflow(id,undefined,read.signal),fetch(`/api/operations-content/${id}/promotion-timeline`,{cache:'no-store',signal:read.signal})]);
      const timelineHtml=timelineResponse.ok?await timelineResponse.text():'';
      if (!read.isCurrent()) return;
      const timelineHost=document.querySelector<HTMLElement>('[data-promotion-state-history]');if(timelineHost){timelineHost.innerHTML=timelineHtml;timelineHost.hidden=!timelineHost.querySelector('.promotion-timeline');document.dispatchEvent(new CustomEvent('business:promotion-fragment-updated'));}
      panel!.replaceChildren();
      const resultLabel = workflow.schedule.actualPublishAt
        ? isDelayed(new Date(workflow.schedule.plannedPublishAt),new Date(workflow.schedule.actualPublishAt),workflow.schedule.delayThresholdHours) ? '延期发布' : '按时发布'
        : workflow.registrationState === 'missing' ? '尚未登记' : '待发布';
      document.dispatchEvent(new CustomEvent('business:publication-context',{detail:{...workflow,publicationLabel:publicationLabels[workflow.publicationState],completionLabel:resultLabel}}));
      const stateNode=document.querySelector<HTMLElement>('[data-inspector-completion]'); if(stateNode)stateNode.textContent=resultLabel;
      const completionRow=document.querySelector<HTMLElement>('[data-inspector-completion-row]');if(completionRow)completionRow.hidden=workflow.registrationState==='missing';
      const history = (title:string) => { const details=element('details');details.append(element('summary',title));historyHost.append(details);return details; };
      const pending = workflow.days.filter(day => !day.saved && !day.archived);
      const saved = workflow.days.filter(day => day.saved);
      if(switched){const reference=document.querySelector<HTMLDetailsElement>('.inspector-reference');if(reference)reference.open=workflow.registrationState!=='missing'&&!pending.length;}
      const pendingRequest = workflow.applications.find(application => application.status === 'pending');
      if (workflow.registrationState === 'missing') {
        const warning=element('p','尚未登记');warning.className='workflow-registration-warning';warning.setAttribute('role','status');panel!.append(warning);
      }
      const delayLabel=document.querySelector<HTMLElement>('[data-inspector-delay-label]');if(delayLabel){delayLabel.textContent=workflow.delayLabel;delayLabel.hidden=!workflow.delayLabel;}
      if (pending.length) {
        const section=element('section');section.className='workflow-pending-reasons';
        section.append(element('h4',workflow.schedule.actualPublishAt?`延期原因 · 待填 ${pending.length} 条`:`尚未发布时填写原因 · ${pending.length} 条`));
        for (const [index,day] of pending.entries()) {
          const row=element('details');row.className='workflow-reason';row.dataset.delayKey=`${day.planRevision}:${day.dayNumber}`;row.open=index===0;
          row.append(element('summary',reasonLabel(workflow,day)));
          const form=reasonForm(day,id,()=>showPanel(id));const prior=retained.get(row.dataset.delayKey);
          if(prior){restoreResponsibility(form,prior.responsibility);form.querySelector('textarea')!.value=prior.reason;form.dataset.dirty='true';row.open=prior.open;}
          if(mayOperate('schedule.reason'))row.append(form);section.append(row);
        }
        panel!.append(section);
      }
      if (saved.length) {
        const details=history(`已填延期原因 ${saved.length} 条`);
        for(const day of saved){
          const row=element('section');row.className='workflow-reason';
          row.append(element('h4',reasonLabel(workflow,day)));
          row.append(element('p',`${delayResponsibilityLabels[day.saved!.responsibility]}：${day.saved!.reason}`),element('small',`${day.saved!.source==='historical'?'':day.saved!.changedByLabel}`));
          if(!day.archived&&mayOperate('schedule.reason')){
            const button=element('button','更正理由');button.type='button';button.className='business-action-secondary';
            const form=reasonForm(day,id,()=>showPanel(id));form.hidden=true;
            const draft=retained.get(`${day.planRevision}:${day.dayNumber}`);if(draft){form.hidden=false;restoreResponsibility(form,draft.responsibility);form.querySelector('textarea')!.value=draft.reason;form.dataset.dirty='true';details.open=draft.open;}
            button.addEventListener('click',()=>{form.hidden=!form.hidden;if(!form.hidden)form.querySelector<HTMLInputElement>('input[type=radio]')?.focus();});row.append(button,form);
          }
          details.append(row);
        }
      }
      if (!isAdmin && workflow.requiresPlanApproval && !pendingRequest) {
        const details=element('details');details.append(element('summary','申请调整排期'));
        const form=element('form');form.className='workflow-form business-form';hidden(form,'expectedPlanRevision',String(workflow.schedule.planRevision));
        const dateTime=document.querySelector<HTMLTemplateElement>('[data-change-request-datetime]')!.content.cloneNode(true) as DocumentFragment;
        configureDateTimeField(dateTime.querySelector<HTMLElement>('[data-datetime-field]')!,{value:inputTime(workflow.schedule.plannedPublishAt)});form.append(dateTime);
        textField(form,'reason','改期申请理由');submitButton(form,'提交管理员审批');bindForm(form,`/api/operations-content/${id}/change-requests`,reload);details.append(form);panel!.append(details);
      }
      for(const request of workflow.changeProposals??[]){
        if(!request.key.startsWith('proposal:'))continue;
        const section=element('section');section.className='workflow-application';section.append(element('h4','待审核修改'),element('p',`${request.title} · ${request.requestedBy}`));
        if(request.reason)section.append(element('p',request.reason));
        appendChangeDiff(section,request.diff);
        if(isAdmin){const form=element('form');form.className='workflow-form business-form';form.dataset.scheduleApproval=request.endpoint;form.dataset.scheduleId=id;form.dataset.approvalKey=request.key;
          const label=element('label','审核说明');const reason=element('textarea');reason.name='reason';reason.maxLength=500;label.append(reason);form.append(label);const actions=element('div');actions.className='business-action-group';
          for(const [value,text] of [['approve','通过'],['reject','驳回']]){const button=element('button',text);button.type='submit';button.name='action';button.value=value;button.className=value==='approve'?'business-action-primary':'business-action-secondary';actions.append(button);}const output=element('output');output.setAttribute('role','alert');form.append(actions,output);section.append(form);
        }panel!.append(section);
      }
      const applicationLabels:Record<string,string>={pending:'待审批',approved:'已同意',rejected:'已驳回',obsolete:'已失效'};
      for(const application of [...workflow.applications].reverse()){
        const row=element('section');row.className='workflow-application';
        row.append(element('p',`${applicationLabels[application.status]} · ${application.requestedByLabel}`));
        appendChangeDiff(row,[{label:'应发时间',before:timeLabel(application.originalPlannedPublishAt),after:timeLabel(application.requestedPublishAt)}]);
        row.append(element('p',application.reason));
        if(application.decisionReason)row.append(element('small',`${application.decidedByLabel||'系统'}：${application.decisionReason}`));
        if(application.status==='pending'){
          if(isAdmin)for(const action of ['approve','reject']){
            const form=element('form');form.className='workflow-form business-form';hidden(form,'action',action);
            if(action==='reject')textField(form,'reason','驳回说明');submitButton(form,action==='approve'?'同意调整排期':'驳回申请');
            if(action==='reject')form.querySelector('button')!.className='business-action-secondary';
            bindForm(form,`/api/operations-content/${id}/change-requests/${application.id}`,reload,'PATCH');row.append(form);
          }
          panel!.append(row);
        }else{
          let details=historyHost.querySelector<HTMLDetailsElement>('[data-application-history]');
          if(!details){details=history(`改期申请历史 ${workflow.applications.filter(item=>item.status!=='pending').length} 条`);details.dataset.applicationHistory='';}details.append(row);
        }
      }
      if(workflow.history.length){
        const details=history(`排期变更历史 ${workflow.history.length} 条`);
        for(const plan of workflow.history){const row=element('p',`R${plan.revision} → R${plan.revision+1} · ${timeLabel(plan.plannedPublishAt)} → ${timeLabel(plan.newPlannedPublishAt)}\n${plan.changedByLabel}：${plan.reason}`);row.className='workflow-plan-history';details.append(row);}
      }
      if(workflow.publicationHistory.length){
        const details=history(`发布登记与更正历史 ${workflow.publicationHistory.length} 条`);
        for(const entry of workflow.publicationHistory){const row=element('section');row.className='workflow-plan-history';row.append(element('p',`R${entry.revision} · ${entry.changedByLabel} · ${timeLabel(entry.createdAt)}\n实发：${entry.before.actualPublishAt?timeLabel(entry.before.actualPublishAt):'未登记'} → ${timeLabel(entry.after.actualPublishAt)}`));
          if(entry.after.momentsConfirmation&&!entry.before.momentsConfirmation)row.append(element('p','运营确认：已发送朋友圈 · 已发送对应需求'));
          if(entry.reason)row.append(element('p',entry.reason));
          for(const [label,url] of [['查看原帖子链接 ↗',entry.before.publicationUrl],['查看登记的帖子链接 ↗',entry.after.publicationUrl]])if(url){const link=element('a',label!);link.href=url;link.target='_blank';link.rel='noreferrer';row.append(link);}details.append(row);
        }
      }
      if(workflow.publicationReservations.length){
        const details=history(`历史预约记录 ${workflow.publicationReservations.length} 条`);
        const labels:Record<string,string>={pending:'预约待审',approved:'已审核预约',rejected:'已驳回',cancelled:'已取消',obsolete:'已失效',fulfilled:'已完成实发'};
        for(const booking of workflow.publicationReservations){
          const row=element('section');row.className='workflow-application';row.append(element('p',`${labels[booking.status]} · ${booking.requestedByLabel}\n预约 ${timeLabel(booking.scheduledPublishAt)}`));
          if(booking.decisionReason||booking.decidedByLabel)row.append(element('small',`${booking.decidedByLabel||'系统'}：${booking.decisionReason||'审核通过'}`));
          if(booking.history.length){const past=element('details');past.append(element('summary','预约操作历史'));for(const entry of booking.history)past.append(element('p',`${labels[entry.status]} · ${entry.actorLabel} · ${timeLabel(entry.at)}${entry.reason?'\n'+entry.reason:''}`));row.append(past);}details.append(row);
        }
      }
      if(panel!.childElementCount){panel!.prepend(element('h3','待处理'));panel!.hidden=false;}
      if(historyHost.childElementCount){historyHost.prepend(element('h3','历史记录'));historyHost.hidden=false;}
      panel!.dataset.loadedScheduleId=id;panel!.dataset.ready='true';
      if(retained.size)(panel!.querySelector('form[data-dirty=true]')??historyHost.querySelector('form[data-dirty=true]'))?.dispatchEvent(new Event('input',{bubbles:true}));
    } catch(error){
      if(!read.isCurrent())return;
      panel!.replaceChildren(element('p',error instanceof Error?error.message:'读取失败。'));
      const button=element('button','重新读取');button.className='business-action-secondary';button.addEventListener('click',()=>showPanel(id,retained));panel!.append(button);panel!.hidden=false;
    } finally {if(token===panelToken)cleanup();}
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
    responsibility: row.querySelector<HTMLInputElement>('input[type=radio]:checked')?.value??'', reason: row.querySelector<HTMLTextAreaElement>('textarea')!.value,
  }));
  async function showPublication() {
    if (!publicationId) return;
    const token = ++publicationToken;
    host.dataset.ready = 'false'; status.textContent = '';
    stopPublicationRead();
    const read=beginBusinessRead(publication!.querySelector<HTMLElement>('[data-publication-delay]')!,{label:'正在核对逐日理由…',signal,isCurrent:()=>token===publicationToken});
    stopPublicationRead=read.cancel;
    const retained = new Map(collectInput().map(input => [`${input.planRevision}:${input.dayNumber}`,input]));
    const control=publication!.elements.namedItem('actualPublishAt') as HTMLInputElement;
    const actual=control.disabled?'':control.value;
    try {
      const workflow = await getWorkflow(publicationId, actual,read.signal); if (!read.isCurrent()) return;
      (publication!.elements.namedItem('expectedPlanRevision') as HTMLInputElement).value = String(workflow.schedule.planRevision);
      (publication!.elements.namedItem('plannedPublishAt') as HTMLInputElement).value = inputTime(workflow.schedule.plannedPublishAt);
      const statusOutput = publication!.querySelector<HTMLOutputElement>('[data-publication-status]')!;
      if (actual) statusOutput.value = isDelayed(new Date(workflow.schedule.plannedPublishAt),new Date(`${actual}:00+08:00`),workflow.schedule.delayThresholdHours) ? '延期发布' : '按时发布';
      publicationDays = workflow.days; host.replaceChildren();
      const pending = publicationDays.filter(day => !day.saved && !day.archived);
      status.textContent = pending.length ? `请逐日填写 ${pending.length} 条理由，保存时与实发事实一起提交。` : '逐日理由已齐全。';
      for (const day of pending) {
        const row = element('section'); row.className = 'publication-reason-day'; row.dataset.delayDay = '';
        row.dataset.planRevision = String(day.planRevision); row.dataset.dayNumber = String(day.dayNumber);
        row.append(element('strong', reasonLabel(workflow,day)));
        const prior = retained.get(`${day.planRevision}:${day.dayNumber}`);
        const fields=element('div');fields.className='business-reason-fields';row.append(fields);responsibilityField(fields, prior?.responsibility,`responsibility-${++responsibilityGroup}`);
        const text = textField(fields, '', '文字原因'); text.value = prior?.reason || ''; text.setAttribute('placeholder', '例如：今日正在修改中');
        host.append(row);
      }
      const saved = publicationDays.filter(day => day.saved);
      if (saved.length) {
        const details = element('details'); details.append(element('summary', `已填写／历史理由 ${saved.length} 条`));
        for (const day of saved) { const row = element('section'); row.className='publication-reason-day'; row.append(element('strong', reasonLabel(workflow,day)),element('p', day.saved!.reason),element('small', day.saved!.source==='historical'?'':day.saved!.changedByLabel)); details.append(row); }
        host.append(details);
      }
      const section = publication!.querySelector<HTMLElement>('[data-publication-delay]')!; section.hidden = publicationDays.length === 0;
      host.dataset.ready = 'true';
    } catch (error) { if (read.isCurrent()) status.textContent = error instanceof Error ? error.message : '读取失败，请重新选择实发时间。'; } finally {read.finish();}
  }
  document.addEventListener('business:inspector-selection',event=>{if(!(event as CustomEvent).detail.id){++panelToken;stopLoading();}},{signal});
  signal.addEventListener('abort',()=>{stopLoading();stopPublicationRead();},{once:true});
  document.addEventListener('business:schedule-selected', event => showPanel((event as CustomEvent).detail.id), { signal });
  document.addEventListener('business:publication-opened', event => {
    publicationId = (event as CustomEvent).detail.id;publication!.dataset.collaborationResource=`schedule:${publicationId}`; host.replaceChildren(); publicationDays = [];
    publication!.querySelector<HTMLElement>('[data-publication-delay]')!.hidden = false; showPublication();
  }, { signal });
  publication.addEventListener('input', event => {
    if(!(event.target instanceof Element)||!event.target.closest('[data-datetime-name="actualPublishAt"]'))return;
    publicationToken++; stopPublicationRead(); host.dataset.ready = 'false'; clearTimeout(pendingTimer); pendingTimer = setTimeout(showPublication, 200);
  }, { signal });
  publication.addEventListener('change',event=>{if((event.target as HTMLInputElement).name==='correctTime'){clearTimeout(pendingTimer);showPublication();}},{signal});
  publication.addEventListener('submit', event => {
    validateLink();
    if (host.dataset.ready !== 'true') { event.preventDefault(); event.stopImmediatePropagation(); status.textContent = '正在核对理由，请稍后保存；读取失败时请重新选择实发时间。'; return; }
    const moments=publication!.querySelector<HTMLElement>('[data-publication-moments]')!;
    const missing=[...moments.querySelectorAll<HTMLInputElement>('input')].find(control=>control.required&&!control.checked);
    if(missing){moments.querySelector<HTMLElement>('[data-publication-moments-error]')!.textContent='请确认朋友圈及对应需求均已发送。';missing.focus();event.preventDefault();event.stopImmediatePropagation();return;}
    if (!publication!.reportValidity()) { event.preventDefault(); event.stopImmediatePropagation(); return; }
    (publication!.elements.namedItem('dailyReasons') as HTMLInputElement).value = JSON.stringify(collectInput());
  }, { capture: true, signal });
  const initialId = document.querySelector<HTMLElement>('[data-inspector]')?.dataset.selectedId;
  if (initialId) showPanel(initialId);
}
document.addEventListener('astro:page-load', initialize);
