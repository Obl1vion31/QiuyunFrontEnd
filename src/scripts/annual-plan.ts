import { getInspector } from './business-inspector';
import { blockBackground, blockPromotionLabel, formatSlotRange, normalizeSnapshot, splitBlockSegments, type PlanBlock } from '../db/annual-plan-rules.mjs';
import type { AnnualPlanSnapshot } from '../db/schema';

type Row = { id: string; rowName: string; sectionKey: string; sectionLabel: string; subjectId: string | null; subjectName: string | null; categoryId: string | null; categoryName: string | null; note: string; isActive: boolean; sortOrder: number; currentVersionNumber: number; blocks: PlanBlock[]; links: Array<{ label: string; url: string; sortOrder: number }> };
type Data = { rows: Row[]; selectedYear: number; categories: Array<{ subjectId: string; id: string; name: string }>; sections: Array<{ key: string; label: string; subjectId: string | null; tone: number }> };
const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
const q = <T extends Element = HTMLElement>(selector: string, parent: ParentNode = document) => parent.querySelector<T>(selector)!;
const all = <T extends Element = HTMLElement>(selector: string, parent: ParentNode = document) => [...parent.querySelectorAll<T>(selector)];
const slotOptions = (end: boolean, selected: number) => Array.from({ length: 24 }, (_, index) => {
  const slot = index + 1; const suffix = end ? (slot % 2 ? '中旬' : '末') : (slot % 2 ? '初' : '中旬');
  return `<option value="${slot}" ${slot === selected ? 'selected' : ''}>${Math.ceil(slot / 2)}月${suffix}</option>`;
}).join('');

function initializeAnnualPlan() {
  const dataNode = q<HTMLScriptElement>('#annual-data');
  if (!dataNode || dataNode.dataset.bound) return;
  dataNode.dataset.bound = 'true';
  const { rows, categories, sections, selectedYear } = JSON.parse(dataNode.textContent!) as Data;
  const rowDialog = q<HTMLDialogElement>('#row-dialog'); const rowForm = q<HTMLFormElement>('#row-form');
  const yearDialog = q<HTMLDialogElement>('#year-dialog'); const copyDialog = q<HTMLDialogElement>('#copy-dialog');
  const inspector = q<HTMLElement>('[data-inspector]'); const blockRows = q('[data-block-rows]', rowForm); const linkRows = q('[data-link-rows]', rowForm);
  let activeRow: Row | null = null; let editingRow: Row | null = null; let dirty = false;
  const field = (name: string) => rowForm.elements.namedItem(name) as HTMLInputElement;
  const applySection = (key: string, selectedCategory = '') => {
    const section = sections.find(section => section.key === key) ?? sections[0];
    if (!section) return;
    field('sectionKey').value = section.key; field('sectionLabel').value = section.label; field('subjectId').value = section.subjectId ?? '';
    rowDialog.dataset.tone = String(section.tone);
    const select = field('categoryId') as unknown as HTMLSelectElement;
    select.replaceChildren(new Option('不关联分类', ''), ...categories.filter(category => category.subjectId === section.subjectId).map(category => new Option(category.name, category.id)));
    select.disabled = !section.subjectId;
    if ([...select.options].some(option => option.value === selectedCategory)) select.value = selectedCategory;
  };
  function collectBlock(node: HTMLElement, index = 0): PlanBlock {
    const startSlot = Number(q<HTMLSelectElement>('[data-start]', node).value); const endSlot = Number(q<HTMLSelectElement>('[data-end]', node).value);
    const mode = q<HTMLSelectElement>('[data-promotion-mode]', node).value;
    const promotionRanges = mode === 'paid' ? [{ startSlot, endSlot }] : mode === 'first' ? [{ startSlot, endSlot: Math.min(startSlot + 1, endSlot) }]
      : mode === 'custom' ? all('[data-paid-range]', node).map(range => ({ startSlot: Number(q<HTMLSelectElement>('[data-paid-start]', range).value), endSlot: Number(q<HTMLSelectElement>('[data-paid-end]', range).value) })) : [];
    return { startSlot, endSlot, promotionRanges, label: q<HTMLInputElement>('[data-label]', node).value.trim(), note: q<HTMLTextAreaElement>('[data-note]', node).value.trim(), sortOrder: index * 10 };
  }
  function addBlock(block: Partial<PlanBlock> = {}) {
    const node = document.createElement('div'); node.className = 'block-row';
    const startSlot = block.startSlot ?? 1; const endSlot = block.endSlot ?? 2;
    const mode = !block.promotionRanges?.length ? 'organic' : blockPromotionLabel(block as PlanBlock) === '全程付费推广' ? 'paid'
      : block.promotionRanges.length === 1 && block.promotionRanges[0].startSlot === startSlot && block.promotionRanges[0].endSlot === Math.min(startSlot + 1, endSlot) ? 'first' : 'custom';
    node.innerHTML = `<div class="block-range"><label>开始时间<select data-start>${slotOptions(false, startSlot)}</select></label><span>至</span><label>结束时间<select data-end>${slotOptions(true, endSlot)}</select></label></div>
      <label>推广安排<select data-promotion-mode><option value="paid">全程付费推广</option><option value="organic">全程自然流／观察</option><option value="first">首月推广，后续观察</option><option value="custom">自定义付费区间</option></select></label>
      <label class="block-note">时间条备注<textarea data-note rows="2" maxlength="500" placeholder="例如：针对 10 月考试（每月至多两篇）">${escapeHtml(block.note)}</textarea></label>
      <div class="promotion-editor" hidden><div class="promotion-ranges" data-paid-ranges></div><button class="quiet-button" type="button" data-add-paid>添加付费区间</button></div>
      <label class="block-stage">阶段名称（可选）<input data-label maxlength="200" placeholder="留空使用规划项目名称" value="${escapeHtml(block.label)}"></label>
      <div class="block-note-preview" aria-label="时间条预览"><span></span></div><button class="remove-row" type="button" aria-label="删除时间块">×</button>`;
    q<HTMLSelectElement>('[data-promotion-mode]', node).value = mode;
    const preview = () => {
      const current = collectBlock(node); const target = q<HTMLElement>('.block-note-preview', node);
      q<HTMLElement>('.promotion-editor', node).hidden = q<HTMLSelectElement>('[data-promotion-mode]', node).value !== 'custom';
      if (current.endSlot < current.startSlot) { target.textContent = '结束时间不能早于开始时间'; target.style.background = ''; return; }
      const label = blockPromotionLabel(current); target.classList.toggle('paid', label === '全程付费推广'); target.classList.toggle('mixed', label === '部分付费推广');
      target.style.background = blockBackground(current); target.innerHTML = `<span>${escapeHtml(current.note || '在上方填写时间条备注')}</span>`;
      target.title = `${formatSlotRange(current)} · ${label}`;
    };
    const addPaidRange = (range = { startSlot: Number(q<HTMLSelectElement>('[data-start]', node).value), endSlot: Number(q<HTMLSelectElement>('[data-end]', node).value) }) => {
      const entry = document.createElement('div'); entry.className = 'promotion-range'; entry.dataset.paidRange = '';
      entry.innerHTML = `<select data-paid-start aria-label="付费推广开始时间">${slotOptions(false, range.startSlot)}</select><span>至</span><select data-paid-end aria-label="付费推广结束时间">${slotOptions(true, range.endSlot)}</select><button type="button" aria-label="删除付费区间">×</button>`;
      q('button', entry).addEventListener('click', () => { entry.remove(); dirty = true; preview(); }); q('[data-paid-ranges]', node).append(entry);
    };
    for (const range of block.promotionRanges ?? []) addPaidRange(range);
    q('[data-add-paid]', node).addEventListener('click', () => { addPaidRange(); dirty = true; preview(); });
    q<HTMLSelectElement>('[data-promotion-mode]', node).addEventListener('change', event => {
      if ((event.target as HTMLSelectElement).value === 'custom' && !q('[data-paid-range]', node)) addPaidRange(); preview();
    });
    node.addEventListener('input', preview); node.addEventListener('change', preview);
    q('.remove-row', node).addEventListener('click', () => { node.remove(); dirty = true; }); blockRows.append(node); preview();
  }
  function addLink(link: Partial<Row['links'][number]> = {}) {
    const node = document.createElement('div'); node.className = 'link-row'; node.dataset.linkLabel = link.label || 'SOP';
    node.innerHTML = `<input data-link-url type="url" aria-label="SOP 链接" placeholder="https://…" value="${escapeHtml(link.url)}"><button type="button" aria-label="删除链接">×</button>`;
    q('button', node).addEventListener('click', () => { node.remove(); dirty = true; }); linkRows.append(node);
  }
  function openRow(row: Row | null = null, sectionKey?: string) {
    editingRow = row; rowForm.reset(); blockRows.replaceChildren(); linkRows.replaceChildren();
    const key = row?.sectionKey ?? sectionKey ?? sections[0]?.key; if (!key) return;
    field('sectionChoice').value = key; applySection(key, row?.categoryId ?? '');
    field('planId').value = row?.id ?? ''; field('expectedVersionNumber').value = String(row?.currentVersionNumber ?? 0);
    field('rowName').value = row?.rowName ?? ''; field('isActive').checked = row?.isActive ?? true; field('note').value = row?.note ?? '';
    q('[data-dialog-title]', rowForm).textContent = row ? `编辑 ${row.rowName} · V${row.currentVersionNumber}` : '新建规划行';
    (row?.blocks ?? []).forEach(addBlock); (row?.links ?? []).forEach(addLink);
    if (!row) { addBlock(); addLink(); }
    q('.form-message', rowForm).textContent = ''; dirty = false; rowDialog.showModal(); field('rowName').focus();
  }
  function closeRow() { if (dirty && !window.confirm('有尚未保存的修改，确定关闭吗？')) return; dirty = false; rowDialog.close(); }
  all('[data-open-new]').forEach(button => button.addEventListener('click', () => openRow()));
  all('[data-new-section]').forEach(button => button.addEventListener('click', () => openRow(null, button.dataset.newSection)));
  all('[data-close-row]').forEach(button => button.addEventListener('click', closeRow));
  rowDialog.addEventListener('cancel', event => { event.preventDefault(); closeRow(); });
  rowForm.addEventListener('input', () => { dirty = true; }); rowForm.addEventListener('change', () => { dirty = true; });
  field('sectionChoice').addEventListener('change', () => applySection(field('sectionChoice').value));
  q('[data-add-block]').addEventListener('click', () => { addBlock(); dirty = true; }); q('[data-add-link]').addEventListener('click', () => { addLink(); dirty = true; });

  async function submit(form: HTMLFormElement, path: string, method: string, body: unknown, success: (result: any) => void) {
    if (form.dataset.saving) return;
    form.dataset.saving = 'true'; const message = q<HTMLElement>('.form-message, [role=alert]', form); message.textContent = '';
    try {
      const response = await fetch(path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); const result = await response.json();
      if (response.ok) success(result); else message.textContent = result.fields ? Object.values(result.fields).flat().join('；') : result.message ?? '保存失败，请重试。';
    } catch { message.textContent = '网络暂时不可用，填写内容已保留，请重试。'; }
    finally { delete form.dataset.saving; }
  }
  rowForm.addEventListener('submit', event => {
    event.preventDefault();
    const input = { year: selectedYear, sectionKey: field('sectionKey').value, sectionLabel: field('sectionLabel').value, subjectId: field('subjectId').value || null,
      rowName: field('rowName').value.trim(), categoryId: field('categoryId').value || null, note: field('note').value.trim() || null,
      isActive: field('isActive').checked, sortOrder: editingRow?.sortOrder ?? 9999,
      blocks: all('.block-row', blockRows).map(collectBlock), links: all('.link-row', linkRows).filter(node => q<HTMLInputElement>('[data-link-url]', node).value.trim()).map((node, index) => ({ url: q<HTMLInputElement>('[data-link-url]', node).value.trim(), label: node.dataset.linkLabel || 'SOP', sortOrder: index * 10 })),
      expectedVersionNumber: Number(field('expectedVersionNumber').value), changeSummary: field('changeSummary').value.trim() };
    void submit(rowForm, `/api/operations-annual-plans${field('planId').value ? `/${field('planId').value}` : ''}`, field('planId').value ? 'PATCH' : 'POST', input, () => { dirty = false; window.location.reload(); });
  });

  function setSelected(id: string | null) {
    all('[data-row-id]').forEach(node => node.classList.toggle('selected', node.dataset.rowId === id));
    all('[data-inspect-id]').forEach(node => node.setAttribute('aria-expanded', String(node.dataset.inspectId === id)));
  }
  function fillInspector(row: Row) {
    activeRow = row;
    inspector.dataset.tone = String(sections.find(section => section.key === row.sectionKey)?.tone ?? 4);
    const setText = (selector: string, value: string) => { q(selector, inspector).textContent = value; };
    setText('[data-section-label]', row.sectionLabel); setText('[data-row-name]', row.rowName); setText('[data-relation]', [row.subjectName, row.categoryName].filter(Boolean).join(' / '));
    setText('[data-version]', `V${row.currentVersionNumber}`); setText('[data-status]', row.isActive ? '启用' : '已停用');
    setText('[data-promotion]', row.blocks.some(block => block.promotionRanges.length) ? '含付费推广区间' : '自然流／观察'); setText('[data-note]', row.note || '暂无行备注');
    const mini = q('[data-mini-timeline]', inspector); mini.replaceChildren();
    for (let month = 1; month <= 12; month++) { const cell = document.createElement('span'); cell.className = `mini-grid ${[1, 4, 7, 10].includes(month) ? 'quarter-start' : ''}`; cell.style.gridColumn = `${month * 2 - 1}/span 2`; mini.append(cell); }
    for (const block of row.blocks) { const node = document.createElement('span'); node.className = 'mini-block'; node.style.gridColumn = `${block.startSlot}/${block.endSlot + 1}`; node.style.background = blockBackground(block); node.title = `${formatSlotRange(block)} · ${block.note}`; mini.append(node); }
    const list = q('[data-block-list]', inspector); list.replaceChildren();
    for (const block of row.blocks) {
      const article = document.createElement('article'); article.className = 'block-detail';
      article.innerHTML = `<div class="block-primary"><div class="block-name"><b>${escapeHtml(block.label || row.rowName)}</b></div><strong>${formatSlotRange(block)}</strong></div><p class="block-secondary">${escapeHtml(block.note || '暂无时间条备注')}</p><ul class="block-phases">${splitBlockSegments(block).map(segment => `<li class="${segment.paid ? 'paid' : ''}">${formatSlotRange(segment)} · ${segment.paid ? '付费推广' : '自然流／观察'}</li>`).join('')}</ul>`; list.append(article);
    }
    if (!row.blocks.length) list.innerHTML = '<p class="inspector-empty">尚未设置时间块。</p>';
    const linkList = q('[data-link-list]', inspector); linkList.replaceChildren();
    for (const link of row.links) { const anchor = document.createElement('a'); anchor.href = link.url; anchor.target = '_blank'; anchor.rel = 'noreferrer'; anchor.textContent = `${link.label} ↗`; linkList.append(anchor); }
    if (!row.links.length) linkList.innerHTML = '<p class="inspector-empty">尚未添加 SOP 或帖集链接。</p>';
    q('[data-history-list]', inspector).replaceChildren();
  }
  const inspectorController = getInspector(inspector, { parameter:'row', select:setSelected, render:id => { const row=rows.find(row=>row.id===id); if(row)fillInspector(row); } });
  all('[data-inspect-id]').forEach(button => button.addEventListener('click', () => inspectorController.open(button.dataset.inspectId!,button)));
  const requestedRow = new URL(location.href).searchParams.get('row');
  if (requestedRow && rows.some(row=>row.id===requestedRow)) inspectorController.open(requestedRow,null,false);
  q('[data-edit-row]').addEventListener('click', () => { if (activeRow) openRow(activeRow); });
  let activeSection = 'all'; let showInactive = false;
  const visibility = () => { all('[data-section]').forEach(node => { node.hidden = activeSection !== 'all' && node.dataset.section !== activeSection; }); all('[data-inactive=true]').forEach(node => { node.hidden = !showInactive; }); };
  all('[data-filter]').forEach(button => button.addEventListener('click', () => { activeSection = button.dataset.filter!; all('[data-filter]').forEach(node => node.classList.toggle('active', node === button)); visibility(); }));
  q('[data-show-inactive]').addEventListener('click', event => { showInactive = !showInactive; const button = event.currentTarget as HTMLElement; button.classList.toggle('active', showInactive); button.textContent = showInactive ? '隐藏已停用' : '显示已停用'; visibility(); }); visibility();
  const scrolls = all<HTMLElement>('.matrix-shell,.summary-scroll'); for (const scroll of scrolls) scroll.addEventListener('scroll', () => { for (const other of scrolls) if (other !== scroll && Math.abs(other.scrollLeft - scroll.scrollLeft) > 1) other.scrollLeft = scroll.scrollLeft; });

  q('[data-load-history]').addEventListener('click', async () => {
    if (!activeRow) return; const row = activeRow; const generation = inspectorController.generation; const target = q('[data-history-list]', inspector); target.textContent = '正在读取…';
    try {
      const response = await fetch(`/api/operations-annual-plans/${row.id}/versions`); const result = await response.json();
      if (activeRow?.id !== row.id || generation !== inspectorController.generation) return;
      if (!response.ok) { target.textContent = result.message; return; } target.replaceChildren();
      for (const version of result.versions) {
        const article = document.createElement('article'); article.innerHTML = `<div><strong>V${version.versionNumber}</strong><span>${new Date(version.createdAt).toLocaleString('zh-CN')}</span></div><p>${escapeHtml(version.changeSummary)}</p><small>${escapeHtml(version.changedByLabel)} · ${escapeHtml(version.diffSummary.join('；'))}</small>`;
        const view = document.createElement('button'); view.type = 'button'; view.textContent = '查看版本内容';
        view.addEventListener('click', async () => {
          const existing = q('.snapshot-view', article); if (existing) { existing.remove(); return; } view.disabled = true;
          try {
            const response = await fetch(`/api/operations-annual-plans/${row.id}/versions/${version.versionNumber}`); const detail = await response.json();
            if (!response.ok) { window.alert(detail.message); return; }
            const snapshot = normalizeSnapshot(detail.version.snapshot as AnnualPlanSnapshot); const panel = document.createElement('div'); panel.className = 'snapshot-view';
            const title = document.createElement('strong'); title.textContent = `${snapshot.row.sectionLabel} / ${snapshot.row.rowName}`; panel.append(title);
            const items = document.createElement('ul'); for (const block of snapshot.blocks) { const item = document.createElement('li'); item.textContent = `${formatSlotRange(block)} · ${block.note || '暂无备注'} · ${blockPromotionLabel(block)}`; items.append(item); } panel.append(items);
            for (const link of snapshot.links) { const anchor = document.createElement('a'); anchor.href = link.url; anchor.target = '_blank'; anchor.rel = 'noreferrer'; anchor.textContent = `${link.label} ↗`; panel.append(anchor); }
            if (snapshot.row.note) { const note = document.createElement('p'); note.textContent = snapshot.row.note; panel.append(note); } article.append(panel);
          } catch { window.alert('历史版本读取失败，请重试。'); } finally { view.disabled = false; }
        }); article.append(view);
        if (version.versionNumber !== row.currentVersionNumber) {
          const restore = document.createElement('button'); restore.type = 'button'; restore.dataset.adminOnly = ''; restore.textContent = '恢复此版本';
          restore.addEventListener('click', async () => {
            if (!window.confirm(`将 V${version.versionNumber} 的内容恢复为新版本，当前及历史版本都会保留。确定恢复吗？`)) return;
            restore.disabled = true;
            try { const response = await fetch(`/api/operations-annual-plans/${row.id}/restore`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ versionNumber: version.versionNumber, expectedVersionNumber: row.currentVersionNumber }) }); const result = await response.json(); if (response.ok) window.location.reload(); else window.alert(result.message); }
            catch { window.alert('恢复失败，请重试。'); } finally { restore.disabled = false; }
          }); article.append(restore);
        } target.append(article);
      }
    } catch { if (activeRow?.id === row.id) target.textContent = '版本历史读取失败，请重试。'; }
  });
  const yearForm = q<HTMLFormElement>('#year-form'); q('[data-edit-year]').addEventListener('click', () => { q<HTMLElement>('[role=alert]', yearForm).textContent = ''; yearDialog.showModal(); });
  all('[data-close-year]').forEach(button => button.addEventListener('click', () => yearDialog.close()));
  yearForm.addEventListener('submit', event => { event.preventDefault(); void submit(yearForm, `/api/operations-annual-plans/year/${selectedYear}`, 'PATCH', { instructions: (yearForm.elements.namedItem('instructions') as HTMLTextAreaElement).value.trim() || null }, () => window.location.reload()); });
  const copyForm = q<HTMLFormElement>('#copy-form'); q('[data-copy-year]').addEventListener('click', () => { q('.form-message', copyForm).textContent = ''; copyDialog.showModal(); });
  all('[data-close-copy]').forEach(button => button.addEventListener('click', () => copyDialog.close()));
  copyForm.addEventListener('submit', event => { event.preventDefault(); void submit(copyForm, `/api/operations-annual-plans/year/${Number((copyForm.elements.namedItem('sourceYear') as HTMLInputElement).value)}/copy`, 'POST', { targetYear: Number((copyForm.elements.namedItem('targetYear') as HTMLInputElement).value) }, result => { window.location.href = `/business/annual-plan?year=${result.year}`; }); });
}
initializeAnnualPlan();
document.addEventListener('astro:page-load', initializeAnnualPlan);
