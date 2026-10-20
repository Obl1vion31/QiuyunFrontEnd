import './business-data-motion';
import './promotion-disclosure';
import {nonPromotionGroups} from '../db/non-promotion-groups';
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
  const records = [...body.querySelectorAll<HTMLElement>('[data-row-href]')];
  const filters = document.querySelector<HTMLFormElement>('[data-review-filters]');
  const displaySwitch = document.querySelector<HTMLElement>('[data-review-display]');
  const overview=table.querySelector<HTMLElement>('[data-category-overview]')!;
  let sortState={key:'date',direction:'descending'};
  const arrange=()=>{
    const grouped=table.dataset.grouped==='true',focus=document.activeElement as HTMLElement|null;
    const compare=(left:HTMLElement,right:HTMLElement)=>{
      const key=sortState.key;
      if(key!=='date'&&(left.dataset[key]==='')!==(right.dataset[key]===''))return left.dataset[key]===''?1:-1;
      const delta=key==='date'?left.dataset.date!.localeCompare(right.dataset.date!):Number(left.dataset[key])-Number(right.dataset[key]);
      return (sortState.direction==='ascending'?delta:-delta)||left.dataset.inspectorKey!.localeCompare(right.dataset.inspectorKey!);
    };
    const sorted=[...records].sort(compare);
    if(grouped){for(const group of table.querySelectorAll<HTMLElement>('[data-category-records]'))group.replaceChildren(...sorted.filter(row=>row.dataset.categoryKey===group.dataset.categoryRecords));}
    else body.replaceChildren(...sorted);
    for(const row of records){row.hidden=false;row.querySelectorAll<HTMLElement>('[data-review-common]').forEach(cell=>{cell.classList.remove('review-common-repeat');cell.removeAttribute('aria-hidden');});}
    body.hidden=grouped;overview.hidden=!grouped;table.querySelector<HTMLElement>('[data-flat-head]')!.hidden=grouped;
    for(const button of table.querySelectorAll<HTMLButtonElement>('[data-sort]')){button.disabled=false;const active=button.dataset.sort===sortState.key;button.closest('[role=columnheader]')?.setAttribute('aria-sort',active?sortState.direction:'none');button.querySelector('i')!.textContent=active?(sortState.direction==='ascending'?'↑':'↓'):'↕';}
    if(focus?.isConnected&&focus.closest('[data-row-href]'))focus.focus({preventScroll:true});
  };
  table.querySelectorAll<HTMLButtonElement>('[data-sort]').forEach(button=>button.addEventListener('click',()=>{const key=button.dataset.sort!;sortState={key,direction:sortState.key===key&&sortState.direction==='descending'?'ascending':'descending'};arrange();}));
  if(displaySwitch)controller.configure({localParameters:['group','bucket'],onContextChange:url=>{
    const grouped=url.searchParams.get('group')!=='0';table.dataset.grouped=String(grouped);
    displaySwitch.querySelectorAll<HTMLInputElement>('input').forEach(input=>input.checked=input.value===(grouped?'1':'0'));
    (filters!.elements.namedItem('group') as HTMLInputElement).value=grouped?'1':'0';
    const bucket=url.searchParams.get('bucket');if(bucket){const detail=table.querySelector<HTMLDetailsElement>(`[data-category-group="${CSS.escape(bucket)}"]`);if(detail)detail.open=true;}
    for(const row of records){const href=new URL(row.dataset.rowHref!,location.href);href.searchParams.set('group',grouped?'1':'0');href.searchParams.delete('bucket');row.dataset.rowHref=href.pathname+href.search;}
    arrange();
  }});
  displaySwitch?.addEventListener('change',event=>{const input=event.target as HTMLInputElement;if(input.checked)controller.setLocalParameters({group:input.value,bucket:null});});
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
        cell.classList.toggle('has-value',value!=null);cell.toggleAttribute('data-result-metric',value!=null);
        cell.classList.remove('positive','negative','neutral');
        cell.classList.add(delta == null || Math.abs(delta)<.01 ? 'neutral' : delta>0 ? 'positive' : 'negative');
        cell.title = `${item.checkpoint.type==='day_7'?'首轮':'二轮'}同类均值 ${cohort.mean?.toFixed(2) ?? '—'}% · n=${cohort.count} 篇`;
        cell.querySelector('strong')!.textContent = value == null ? '待录入' : `${value.toFixed(2)}%`;
        const em=cell.querySelector('em');if(em){const label=document.createElement('span'),mean=document.createElement('span'),sample=document.createElement('span');label.className='metric-reference-label';label.textContent='同类均值 ';mean.textContent=cohort.mean==null?'— ':`${cohort.mean.toFixed(2)}% `;sample.textContent=`· ${cohort.count} 篇`;em.replaceChildren(label,mean,sample);}
        cell.querySelector('small')!.textContent = delta == null ? '暂无同类基准' : `${delta>0?'+':''}${delta.toFixed(2)}pp`;
      }
      const template = [...document.querySelectorAll<HTMLTemplateElement>('template[data-inspector-template]')].find(node => node.dataset.inspectorTemplate === item.key);
      if (template) for (const [field, value] of Object.entries({ recordedThrough:item.metric?.recordedThrough,clickRate:item.metric?.clickRate,threeSecondReadRate:item.metric?.threeSecondReadRate,conclusion:item.review?.conclusion })) {
        const input = template.content.querySelector<HTMLInputElement|HTMLTextAreaElement>(`[name="${field}"]`);
        if (input) { input.value = String(value ?? ''); input.defaultValue = input.value; }
      }
    }
    for(const group of nonPromotionGroups(data.tableRows)){
      const summary=table.querySelector<HTMLElement>(`[data-category-group="${CSS.escape(group.key)}"]`);if(!summary)continue;
      for(const round of group.rounds){
        const cell=summary.querySelector<HTMLElement>(`[data-category-click="${round.type}"]`);if(!cell)continue;
        cell.textContent=round.click==null?'—':`${round.click.toFixed(2)}%`;
        summary.querySelector(`[data-category-read="${round.type}"]`)!.textContent=round.read==null?'—':`${round.read.toFixed(2)}%`;
        summary.querySelector(`[data-category-count="${round.type}"]`)!.textContent=`${round.count} 篇`;
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
