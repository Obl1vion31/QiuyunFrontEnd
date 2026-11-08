import { closeBusinessDialog } from './business-dialog';
import { positionKeys, positionNames, type OrganizationWorkspace, type PositionKey, type OrganizationReference } from '../data/organization';

function initializeOrganization() {
  const root = document.querySelector<HTMLElement>('[data-organization]');
  if (!root || root.dataset.orgReady) return;
  root.dataset.orgReady = 'true';
  let workspace: OrganizationWorkspace = JSON.parse(root.querySelector('[data-organization-data]')!.textContent!);
  const lifecycle = new AbortController(), signal = lifecycle.signal;
  const editor = root.querySelector<HTMLDialogElement>('#organization-editor');
  const form = editor?.querySelector<HTMLFormElement>('form');
  const roleFields = form?.querySelector<HTMLFieldSetElement>('[data-org-position-fields]');
  const memberFields = form?.querySelector<HTMLFieldSetElement>('[data-org-member-fields]');
  const references = form?.querySelector<HTMLElement>('[data-org-reference-rows]');
  const message = form?.querySelector<HTMLOutputElement>('[data-org-editor-message]');
  const save = form?.querySelector<HTMLButtonElement>('[type=submit]');
  let target: { kind: 'position'; key: PositionKey } | { kind: 'member'; userId: string } | undefined;
  let original = '', busy = false, trigger: HTMLElement | null = null;
  if (editor) editor.dataset.dialogCancelManaged = 'true';
  const data = () => target?.kind === 'member' ? { ...target, positions: positionKeys.filter(key => form!.querySelector<HTMLInputElement>(`input[value="${key}"]`)!.checked) } : {
    ...target,
    ...Object.fromEntries(['responsibilities', 'deliverables', 'collaboration'].map(name => [name, (form!.elements.namedItem(name) as HTMLTextAreaElement).value.trim()])),
    references: [...references!.querySelectorAll<HTMLElement>('.org-reference-row')].map(row => ({ label: row.querySelector<HTMLInputElement>('[data-reference-label]')!.value.trim(), url: row.querySelector<HTMLInputElement>('[data-reference-url]')!.value.trim() })).filter(row => row.label || row.url),
  };
  const changed = () => {
    const dirty = Boolean(editor?.open && JSON.stringify(data()) !== original);
    document.documentElement.dataset.unsaved = String(dirty);
    if (form) form.dataset.dirty = String(dirty);
    if (save) save.disabled = busy || !dirty;
    return dirty;
  };
  const close = async (discard = false) => {
    if (!editor || busy) return;
    if (!discard && changed() && !await window.businessConfirm('有尚未保存的岗位或任职修改，是否放弃？')) return;
    document.documentElement.dataset.unsaved = 'false';
    if (form) form.dataset.dirty = 'false';
    await closeBusinessDialog(editor);
    trigger?.focus({ preventScroll: true });
  };
  const addReference = (reference: OrganizationReference = { label: '', url: '' }) => {
    const template = root.querySelector<HTMLTemplateElement>('[data-org-reference-template]')!;
    const row = template.content.firstElementChild!.cloneNode(true) as HTMLElement;
    row.querySelector<HTMLInputElement>('[data-reference-label]')!.value = reference.label;
    row.querySelector<HTMLInputElement>('[data-reference-url]')!.value = reference.url;
    references!.append(row);
    form!.querySelector<HTMLButtonElement>('[data-org-add-reference]')!.disabled = references!.children.length >= 8;
    return row;
  };
  const open = (next: NonNullable<typeof target>, source: HTMLElement) => {
    if (!editor || !form || busy) return;
    target = next; trigger = source; message!.textContent = '';
    const position = next.kind === 'position';
    roleFields!.hidden = !position; roleFields!.disabled = !position;
    memberFields!.hidden = position; memberFields!.disabled = position;
    const title = editor.querySelector('#organization-editor-title')!;
    const identity = editor.querySelector('[data-org-editor-identity]')!;
    if (position && next.kind === 'position') {
      const row = workspace.positions.find(item => item.key === next.key)!;
      title.textContent = `编辑${row.name}职责`; identity.textContent = row.name;
      for (const name of ['responsibilities', 'deliverables', 'collaboration'] as const) (form.elements.namedItem(name) as HTMLTextAreaElement).value = row[name];
      references!.replaceChildren(); row.references.forEach(addReference);
      form.querySelector<HTMLButtonElement>('[data-org-add-reference]')!.disabled = row.references.length >= 8;
    } else if (next.kind === 'member') {
      const member = workspace.members.find(item => item.id === next.userId)!;
      title.textContent = '编辑人员任职'; identity.textContent = `${member.name} · ${member.username}`;
      for (const key of positionKeys) form.querySelector<HTMLInputElement>(`input[value="${key}"]`)!.checked = member.positions.includes(key);
    }
    original = JSON.stringify(data()); editor.showModal(); changed();
    (position ? form.querySelector<HTMLElement>('[name=responsibilities]') : memberFields!.querySelector<HTMLElement>('input'))?.focus({ preventScroll: true });
  };
  const update = () => {
    for (const position of workspace.positions) {
      for (const field of ['responsibilities', 'deliverables', 'collaboration'] as const) root.querySelectorAll<HTMLElement>(`[data-position-field="${position.key}:${field}"]`).forEach(node => node.textContent = position[field]);
      root.querySelectorAll<HTMLElement>(`[data-position-references="${position.key}"]`).forEach(list => {
        list.replaceChildren(...position.references.map(reference => { const li = document.createElement('li'), link = document.createElement('a'); link.href = reference.url; link.textContent = reference.label; link.target = '_blank'; link.rel = 'noopener noreferrer'; li.append(link); return li; }));
      });
      root.querySelectorAll<HTMLElement>(`[data-org-assignees="${position.key}"]`).forEach(node => {
        const owners = workspace.members.filter(member => member.positions.includes(position.key));
        node.replaceChildren(...owners.map(member => { const span = document.createElement('span'); span.textContent = member.name; if (!member.enabled) { const small = document.createElement('small'); small.textContent = '账号已停用'; span.append(small); } return span; }));
        if (!owners.length) { const span = document.createElement('span'); span.className = 'org-unassigned'; span.textContent = '待安排'; node.append(span); }
      });
    }
    const body = root.querySelector<HTMLElement>('[data-org-members]')!;
    const managers = workspace.members.filter(member => member.enabled && member.positions.includes('supervisor')).map(member => member.name);
    body.querySelectorAll<HTMLElement>('[data-org-member]').forEach(row => { if (!workspace.members.some(member => member.id === row.dataset.orgMember)) row.remove(); });
    for (const member of workspace.members) {
      let row = [...body.querySelectorAll<HTMLElement>('[data-org-member]')].find(item => item.dataset.orgMember === member.id);
      if (!row) { row = (root.querySelector<HTMLTemplateElement>('[data-org-member-template]')!.content.firstElementChild!.cloneNode(true)) as HTMLElement; row.dataset.orgMember = member.id; body.append(row); }
      row.querySelector('[data-member-name]')!.textContent = member.name;
      row.querySelector('[data-member-username]')!.textContent = member.username;
      row.querySelector('[data-member-status]')!.textContent = member.enabled ? '' : '账号已停用';
      row.querySelector('[data-member-managers]')!.textContent = member.positions.includes('supervisor') ? '共同管理团队' : managers.join('、') || '待安排';
      const tags = row.querySelector('[data-member-positions]')!;
      tags.replaceChildren(...member.positions.map(key => { const span = document.createElement('span'); span.textContent = positionNames[key]; return span; }));
      if (!member.positions.length) { const span = document.createElement('span'); span.className = 'org-unassigned'; span.textContent = '待安排'; tags.append(span); }
      const button = row.querySelector<HTMLElement>('[data-edit-member]'); if (button) button.dataset.editMember = member.id;
    }
    root.querySelector('[data-org-member-count]')!.textContent = `(${workspace.members.length})`;
    root.querySelector<HTMLElement>('[data-org-no-members]')!.hidden = workspace.members.length > 0;
  };
  const selectView = (view: string, push = false) => {
    root.dataset.view = view;
    root.querySelectorAll<HTMLElement>('[data-org-panel]').forEach(panel => panel.hidden = panel.dataset.orgPanel !== view);
    document.querySelectorAll<HTMLInputElement>('[name=organization-view]').forEach(input => input.checked = input.value === view);
    if (push) { const url = new URL(location.href); if (view === 'people') url.searchParams.set('view', 'people'); else url.searchParams.delete('view'); history.pushState(history.state, '', url); }
  };
  selectView(new URL(location.href).searchParams.get('view') === 'people' ? 'people' : 'roles');
  document.querySelector('[data-organization-view]')?.addEventListener('change', () => selectView(document.querySelector<HTMLInputElement>('[name=organization-view]:checked')!.value, true), { signal });
  document.addEventListener('business:local-history-pop', event => { if (location.pathname !== '/organization') return; event.preventDefault(); selectView(new URL(location.href).searchParams.get('view') === 'people' ? 'people' : 'roles'); }, { signal });
  root.addEventListener('click', event => {
    const button = (event.target as Element).closest<HTMLButtonElement>('button'); if (!button) return;
    if (button.dataset.editPosition) open({ kind: 'position', key: button.dataset.editPosition as PositionKey }, button);
    else if (button.dataset.editMember) open({ kind: 'member', userId: button.dataset.editMember }, button);
    else if (button.hasAttribute('data-org-close')) void close();
    else if (button.hasAttribute('data-org-add-reference')) { addReference().querySelector<HTMLInputElement>('input')!.focus(); changed(); }
    else if (button.hasAttribute('data-org-remove-reference')) { const row = button.closest('.org-reference-row')!; row.remove(); form!.querySelector<HTMLButtonElement>('[data-org-add-reference]')!.disabled = false; changed(); }
  }, { signal });
  editor?.addEventListener('cancel', event => { event.preventDefault(); void close(); }, { signal });
  form?.addEventListener('input', () => { changed(); message!.textContent = ''; }, { signal });
  form?.addEventListener('submit', async event => {
    event.preventDefault(); if (busy || !changed()) return;
    busy = true; save!.disabled = true; save!.textContent = '正在保存…'; message!.textContent = '';
    const payload = data();
    form.querySelectorAll<HTMLButtonElement>('[data-org-close]').forEach(button => button.disabled = true);
    roleFields!.disabled = true; memberFields!.disabled = true;
    try {
      const response = await fetch('/api/organization', { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'X-Business-Feedback': 'local' }, body: JSON.stringify(payload) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || '保存失败，请重试。');
      workspace = result.workspace; update();
      busy = false; await close(true);
      document.dispatchEvent(new CustomEvent('business:operation-receipt', { detail: { message: target?.kind === 'member' ? '人员任职已保存' : '岗位职责已保存' } }));
    } catch (error) { message!.textContent = error instanceof Error && !(error instanceof SyntaxError) ? error.message : '保存结果未能确认，当前输入已保留，请重试。'; }
    finally {
      busy = false; roleFields!.disabled = target?.kind !== 'position'; memberFields!.disabled = target?.kind !== 'member';
      form.querySelectorAll<HTMLButtonElement>('[data-org-close]').forEach(button => button.disabled = false);
      save!.textContent = '保存'; changed();
    }
  }, { signal });
  document.addEventListener('business:navigation-discard', () => { document.documentElement.dataset.unsaved = 'false'; if (editor?.open) void close(true); }, { signal });
  const flow = root.querySelector<HTMLElement>('.org-flow');
  const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting) && flow) { flow.dataset.flowVisible = 'true'; observer.disconnect(); } }, { threshold: .25 });
  if (flow) observer.observe(flow);
  document.addEventListener('astro:before-swap', () => { lifecycle.abort(); observer.disconnect(); }, { once: true });
}
initializeOrganization(); document.addEventListener('astro:page-load', initializeOrganization);
