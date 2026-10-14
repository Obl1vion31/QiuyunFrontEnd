(() => {
const inspector = document.querySelector('[data-inspector]');
const reviewTable = document.querySelector('.review-table');
const sortButtons = document.querySelectorAll('[data-sort]');
let sortState = { key: 'date', direction: 'descending' };
sortButtons.forEach((button) => button.addEventListener('click', () => {
  const key = button.dataset.sort;
  sortState = { key, direction: sortState.key === key && sortState.direction === 'descending' ? 'ascending' : 'descending' };
  const rows = [...reviewTable.querySelectorAll('.review-row[data-row-href]')];
  rows.sort((left, right) => {
    const leftMissing = key !== 'date' && left.dataset[key] === '';
    const rightMissing = key !== 'date' && right.dataset[key] === '';
    if (leftMissing !== rightMissing) return leftMissing ? 1 : -1;
    const leftValue = key === 'date' ? left.dataset.date : Number(left.dataset[key] || Number.NEGATIVE_INFINITY);
    const rightValue = key === 'date' ? right.dataset.date : Number(right.dataset[key] || Number.NEGATIVE_INFINITY);
    const comparison = typeof leftValue === 'number' ? leftValue - rightValue : leftValue.localeCompare(rightValue);
    return sortState.direction === 'ascending' ? comparison : -comparison;
  }).forEach((row) => reviewTable.append(row));
  sortButtons.forEach((item) => {
    const header = item.closest('[role="columnheader"]');
    const active = item === button;
    header.setAttribute('aria-sort', active ? sortState.direction : 'none');
    item.querySelector('i').textContent = active ? (sortState.direction === 'ascending' ? '↑' : '↓') : '↕';
  });
}));
document.querySelectorAll('[data-row-href]').forEach((row) => {
  const open = () => { location.href = row.dataset.rowHref; };
  row.addEventListener('click', (event) => { if (!event.target.closest('a')) open(); });
  row.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); } });
});
if (inspector) {
  inspector.focus();
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') inspector.querySelector('header>a')?.click();
  });
}
document.querySelectorAll('[data-copy-id]').forEach((button) => button.addEventListener('click', async () => {
  await navigator.clipboard.writeText(button.dataset.copyId || '');
  button.textContent = '已复制';
}));
const filters = document.querySelector('[data-review-filters]');
filters?.elements.namedItem('subject')?.addEventListener('change', () => {
  filters.elements.namedItem('category').value = '';
  filters.elements.namedItem('category').disabled = true;
  filters.requestSubmit();
});
filters?.elements.namedItem('category')?.addEventListener('change', () => filters.requestSubmit());
const saveForm = async (form, endpoint) => {
  const output = form.querySelector('output');
  const button = form.querySelector('button[type=submit]');
  output.textContent = '正在保存…'; button.disabled = true;
  try {
    const response = await fetch(endpoint, { method: 'POST', body: new FormData(form), headers: { Accept: 'application/json' } });
    const result = await response.json();
    if (response.ok) { document.documentElement.dataset.unsaved = 'false'; location.href = form.dataset.successHref || location.href; }
    else output.textContent = result.message || '保存失败。';
  } catch { output.textContent = '连接失败，当前输入已保留，请重试。'; }
  finally { button.disabled = false; }
};
document.querySelectorAll('[data-review-form], [data-checkpoint-form]').forEach(form => {
  form.addEventListener('input', () => { document.documentElement.dataset.unsaved = 'true'; });
  form.addEventListener('submit', event => {
    event.preventDefault();
    saveForm(form, form.matches('[data-checkpoint-form]') ? '/api/non-promotion-checkpoints' : '/api/non-promotion-reviews');
  });
});
inspector?.querySelector('header>a')?.addEventListener('click', event => {
  if (document.documentElement.dataset.unsaved === 'true' && !confirm('有尚未保存的修改，确定关闭吗？')) event.preventDefault();
  else document.documentElement.dataset.unsaved = 'false';
});
document.querySelectorAll('[data-id-correction]').forEach(form => form.addEventListener('submit', async event => {
  event.preventDefault();
  const oldValue = form.querySelector('input[readonly]').value;
  const newValue = form.elements.namedItem('platformNoteId').value.trim().toLowerCase();
  if (!confirm(`旧值：${oldValue}\n新值：${newValue}\n\n该帖子的全部版本与复盘都会同步。确认更正？`)) return;
  await saveForm(form, form.action);
}));

})();
