import { navigate } from 'astro:transitions/client';
import { getInspector } from './business-inspector';
import { businessConfirm } from './business-dialog';
import type { readNonPromotionReview } from '../db/non-promotion-read-model';
type ReviewItem = Awaited<ReturnType<typeof readNonPromotionReview>>['tableRows'][number];
function initialize() {
  const table = document.querySelector<HTMLElement>('.review-table');
  const inspector = document.querySelector<HTMLElement>('[data-inspector-templates][data-inspector-parameter="row"]');
  if (!table || !inspector || table.dataset.reviewReady) return;
  table.dataset.reviewReady = 'true';
  document.dispatchEvent(new Event('business:inspector-refresh'));
  const controller = getInspector(inspector);
  const body = table.querySelector<HTMLElement>('[data-review-body]')!;
  const groups = [...body.querySelectorAll<HTMLElement>('[data-review-group]')];
  const records = [...body.querySelectorAll<HTMLElement>('[data-row-href]')];
  const groupRows = new Map(groups.map(group => [group, ([...group.children] as HTMLElement[]).sort((left,right)=>Number(left.dataset.checkpoint!=='day_7')-Number(right.dataset.checkpoint!=='day_7'))]));
  const filters = document.querySelector<HTMLFormElement>('[data-review-filters]');
  const displaySwitch = document.querySelector<HTMLElement>('[data-review-display]');
  const singleRound = Boolean(filters?.querySelector<HTMLSelectElement>('[name="checkpoint"]')?.value);
  let sortState = { key: 'date', direction: 'descending' };
  const arrange = () => {
    const grouped = table.dataset.grouped === 'true';
    const {key,direction} = sortState;
    const compare = (l:HTMLElement,r:HTMLElement) => {
      if (key !== 'date' && (l.dataset[key] === '') !== (r.dataset[key] === '')) return l.dataset[key] === '' ? 1 : -1;
      const comparison = key === 'date' ? l.dataset.date!.localeCompare(r.dataset.date!) : Number(l.dataset[key]) - Number(r.dataset[key]);
      return direction === 'ascending' ? comparison : -comparison;
    };
    const pane = table.closest<HTMLElement>('.table-scroll')!;
    const position = {x:scrollX,y:scrollY,left:pane.scrollLeft,top:pane.scrollTop};
    if(grouped){
      for(const group of groups){group.classList.add('review-post-group');const rows=groupRows.get(group)!;group.replaceChildren(...rows);rows.forEach((row,index)=>row.querySelectorAll<HTMLElement>('[data-review-common]').forEach(cell=>{cell.classList.toggle('review-common-repeat',index>0);if(index>0)cell.setAttribute('aria-hidden','true');else cell.removeAttribute('aria-hidden');}));for(const node of group.querySelectorAll<HTMLElement>('[data-review-placeholder]'))node.hidden=false;}
      body.replaceChildren(...[...groups].sort((left,right)=>compare(left.querySelector('[data-row-href]')!,right.querySelector('[data-row-href]')!)));
    }else{
      groups.forEach(group=>group.classList.remove('review-post-group'));
      for(const row of records)for(const cell of row.querySelectorAll<HTMLElement>('[data-review-common]')){cell.classList.remove('review-common-repeat');cell.removeAttribute('aria-hidden');}
      body.replaceChildren(...[...records].sort(compare));
    }
    document.querySelectorAll<HTMLButtonElement>('[data-sort]').forEach(item => {
      item.disabled = item.dataset.sort!=='date' && grouped && !singleRound;
      const active = item.dataset.sort===key;
      item.closest('[role="columnheader"]')?.setAttribute('aria-sort', active ? direction : 'none');
      item.querySelector('i')!.textContent = active ? (direction === 'ascending' ? '↑' : '↓') : '↕';
    });
    pane.scrollLeft=position.left;pane.scrollTop=position.top;window.scrollTo(position.x,position.y);
  };
  document.querySelectorAll<HTMLButtonElement>('[data-sort]').forEach(button => button.addEventListener('click', () => {
    const key = button.dataset.sort!;
    sortState = { key, direction: sortState.key === key && sortState.direction === 'descending' ? 'ascending' : 'descending' };
    arrange();
  }));
  if(displaySwitch)controller.configure({localParameters:['group'],onContextChange:url=>{
    const grouped=url.searchParams.get('group')!=='0';table.dataset.grouped=String(grouped);
    displaySwitch.querySelectorAll<HTMLInputElement>('input').forEach(input=>input.checked=input.value===(grouped?'1':'0'));
    (filters!.elements.namedItem('group') as HTMLInputElement).value=grouped?'1':'0';
    if(grouped&&!singleRound&&sortState.key!=='date')sortState={key:'date',direction:'descending'};
    for(const row of records){const href=new URL(row.dataset.rowHref!,location.href);href.searchParams.set('group',grouped?'1':'0');row.dataset.rowHref=href.pathname+href.search;}
    arrange();
  }});
  displaySwitch?.addEventListener('change',event=>{
    const input=event.target as HTMLInputElement;if(input.checked)controller.setLocalParameter('group',input.value);
  });
  arrange();
  filters?.addEventListener('change', event => {
    const field = event.target as HTMLInputElement;
    if (field.name === 'subject') { const category = filters.elements.namedItem('category') as HTMLSelectElement; category.value = ''; category.disabled = true; }
    filters.requestSubmit();
  });
  const refresh = async () => {
    const response = await fetch(`/api/non-promotion-reviews${location.search}`, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error('保存已成功，列表刷新失败，请刷新页面查看最新基准。');
    const data = await response.json() as {tableRows:ReviewItem[]};
    for (const item of data.tableRows) {
      const row = table.querySelector<HTMLElement>(`[data-inspector-key="${CSS.escape(item.key)}"]`);
      if (!row) continue;
      for (const [key, field, cohort] of [['click','clickRate',item.click],['read','threeSecondReadRate',item.read]] as const) {
        const value = item.metric ? Number(item.metric[field]) : null;
        row.dataset[key] = value == null ? '' : String(value);
        const cell = row.querySelector<HTMLElement>(`[data-label="${key === 'click' ? '点击率' : '3 秒阅读率'}"] .metric-cell`)!;
        const delta = value == null || cohort.mean == null ? null : value - cohort.mean;
        cell.classList.remove('positive','negative','neutral');
        cell.classList.add(delta == null || Math.abs(delta)<.01 ? 'neutral' : delta>0 ? 'positive' : 'negative');
        cell.title = `${item.checkpoint.type==='day_7'?'首轮':'二轮'}同类均值 ${cohort.mean?.toFixed(2) ?? '—'}% · n=${cohort.count} 篇`;
        cell.querySelector('strong')!.textContent = value == null ? '待录入' : `${value.toFixed(2)}%`;
        const em = cell.querySelector('em'); if (em) em.textContent = `同类均值 ${cohort.mean?.toFixed(2)??'—'}% · n=${cohort.count}`;
        cell.querySelector('small')!.textContent = delta == null ? '暂无同类基准' : `${delta>0?'+':''}${delta.toFixed(2)}pp`;
      }
      const template = [...document.querySelectorAll<HTMLTemplateElement>('template[data-inspector-template]')].find(node => node.dataset.inspectorTemplate === item.key);
      if (template) for (const [field, value] of Object.entries({ recordedThrough:item.metric?.recordedThrough,clickRate:item.metric?.clickRate,threeSecondReadRate:item.metric?.threeSecondReadRate,conclusion:item.review?.conclusion })) {
        const input = template.content.querySelector<HTMLInputElement|HTMLTextAreaElement>(`[name="${field}"]`);
        if (input) { input.value = String(value ?? ''); input.defaultValue = input.value; }
      }
    }
    arrange();
  };
  inspector.addEventListener('click', async event => {
    const copy = (event.target as Element).closest<HTMLButtonElement>('[data-copy-id]');
    if (copy) { await navigator.clipboard.writeText(copy.dataset.copyId!); copy.textContent = '已复制'; }
  });
  inspector.addEventListener('submit', async event => {
    const form = event.target as HTMLFormElement;
    if (!form.matches('[data-review-form],[data-checkpoint-form],[data-id-correction]')) return;
    event.preventDefault();
    const output = form.querySelector<HTMLOutputElement>('output')!;
    const button = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    if (form.matches('[data-id-correction]')) {
      const oldValue = form.querySelector<HTMLInputElement>('input[readonly]')!.value;
      const newValue = (form.elements.namedItem('platformNoteId') as HTMLInputElement).value.trim().toLowerCase();
      if (!await businessConfirm(`旧值：${oldValue}\n新值：${newValue}\n\n该帖子的全部版本与复盘都会同步。`,{title:'更正笔记 ID',confirmLabel:'确认更正',cancelLabel:'继续编辑'})) return;
    }
    button.disabled = true; output.textContent = '正在保存…';
    try {
      const endpoint = form.matches('[data-id-correction]') ? form.action : form.matches('[data-checkpoint-form]') ? '/api/non-promotion-checkpoints' : '/api/non-promotion-reviews';
      const response = await fetch(endpoint, { method:'POST',body:new FormData(form),headers:{Accept:'application/json'} });
      const result = await response.json();
      if (!response.ok) { output.textContent = result.message || '保存失败。'; return; }
      controller.setClean();
      if (new URL(location.href).searchParams.get('view') === 'history' && form.matches('[data-review-form]')) {
        output.textContent = '已保存，正在更新同轮基准…';
        await refresh(); output.textContent = '已保存';
      } else await navigate(form.dataset.successHref || location.href);
    } catch (error) { output.textContent = error instanceof Error && error.message.startsWith('保存已成功') ? error.message : '连接失败，当前输入已保留，请重试。'; }
    finally { button.disabled = false; }
  });
}
document.addEventListener('astro:page-load', initialize);
