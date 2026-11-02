import {checkpointLabel} from '../db/non-promotion-nodes';
import './business-data-motion';
import './promotion-disclosure';
import {readingTrend} from '../db/non-promotion-trend';
import { navigate } from 'astro:transitions/client';
import { getInspector } from './business-inspector';
import { businessConfirm } from './business-dialog';
import { beginBusinessRead } from './business-read';
import type { readNonPromotionReview } from '../db/non-promotion-read-model';
type ReviewModel = Awaited<ReturnType<typeof readNonPromotionReview>>;
function initialize() {
  const table = document.querySelector<HTMLElement>('.review-table');
  const inspector = document.querySelector<HTMLElement>('[data-inspector-templates][data-inspector-parameter="row"]');
  if (!table || !inspector || table.dataset.reviewReady) return;
  table.dataset.reviewReady = 'true';
  document.dispatchEvent(new Event('business:inspector-refresh'));
  const controller = getInspector(inspector);
  inspector.addEventListener('input',event=>{
    const input=event.target as HTMLInputElement,form=input.closest<HTMLFormElement>('[data-review-form]');
    if(!form||!['exposureCount','readCount'].includes(input.name))return;
    const exposure=form.elements.namedItem('exposureCount') as HTMLInputElement,reads=form.elements.namedItem('readCount') as HTMLInputElement,rate=form.elements.namedItem('clickRate') as HTMLInputElement;
    rate.value=exposure.value!==''&&reads.value!==''&&Number(exposure.value)>0?(Number(reads.value)/Number(exposure.value)*100).toFixed(2):'—';
    reads.setCustomValidity(reads.value!==''&&Number(reads.value)>Number(exposure.value)?'阅读量不能大于曝光量，请核对':'');
  });
  const body = table.querySelector<HTMLElement>('[data-review-body]')!;
  const records = [...body.querySelectorAll<HTMLElement>('[data-row-href]')];
  const filters = document.querySelector<HTMLFormElement>('[data-review-filters]');
  const displaySwitch = document.querySelector<HTMLElement>('[data-review-display]');
  const overview=table.querySelector<HTMLElement>('[data-category-overview]')!;
  let sortState={key:table.dataset.view==='pending'?'due':'date',direction:table.dataset.view==='pending'?'ascending':'descending'};
  table.addEventListener('click',event=>{const button=(event.target as Element).closest<HTMLElement>('[data-post-open]');if(button)table.querySelector<HTMLElement>(`[data-inspector-key="${CSS.escape(button.dataset.postOpen!)}"] [data-inspector-trigger]`)?.click();});
  const arrange=()=>{
    const grouped=table.dataset.grouped==='true',focus=document.activeElement as HTMLElement|null;
    const compare=(left:HTMLElement,right:HTMLElement)=>{
      const key=sortState.key;
      if(key!=='date'&&(left.dataset[key]==='')!==(right.dataset[key]===''))return left.dataset[key]===''?1:-1;
      const delta=(key==='date'||key==='due')?left.dataset[key]!.localeCompare(right.dataset[key]!):Number(left.dataset[key])-Number(right.dataset[key]);
      return (sortState.direction==='ascending'?delta:-delta)||left.dataset.inspectorKey!.localeCompare(right.dataset.inspectorKey!);
    };
    const sorted=[...records].sort(compare);
    if(grouped){for(const group of table.querySelectorAll<HTMLElement>('[data-category-records]'))group.replaceChildren(...sorted.filter(row=>row.dataset.categoryKey===group.dataset.categoryRecords&&row.dataset.cohortEligible==='true'));}
    else if(table.dataset.mode==='standard')body.replaceChildren(...sorted);
    else if(table.dataset.view==='pending'){
      const groups=[...body.querySelectorAll<HTMLElement>('[data-review-group]')];
      for(const group of groups)group.append(...sorted.filter(row=>row.dataset.scheduleId===group.dataset.reviewGroup));
      groups.sort((a,b)=>(a.querySelector<HTMLElement>('[data-due]')?.dataset.due??'').localeCompare(b.querySelector<HTMLElement>('[data-due]')?.dataset.due??''));body.append(...groups);
    }
    for(const row of records){row.hidden=grouped?row.dataset.cohortEligible!=='true':row.dataset.rowMode!==table.dataset.mode;row.querySelectorAll<HTMLElement>('[data-review-common]').forEach(cell=>{cell.classList.remove('review-common-repeat');cell.removeAttribute('aria-hidden');});}
    const empty=table.closest('.table-pane')?.querySelector<HTMLElement>('.review-empty');if(empty)empty.hidden=grouped?!!overview.querySelector('[data-category-details]'):records.some(row=>!row.hidden);
    body.hidden=grouped;overview.hidden=!grouped;table.querySelector<HTMLElement>('[data-flat-head]')!.hidden=grouped||table.dataset.mode!=='standard';
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
  const refresh = async (reclaimed?:HTMLFormElement) => {
    const read=beginBusinessRead(table.closest<HTMLElement>('.table-pane')!);
    try {
    const response = await fetch(`/api/non-promotion-reviews${location.search}`, { headers: { Accept: 'application/json' },signal:read.signal });
    if (!response.ok) throw new Error('保存已成功，列表刷新失败，请刷新页面查看最新基准。');
    let data = await response.json() as Pick<ReviewModel,'tableRows'|'categoryGroups'|'sampleRows'>;
    if(reclaimed&&!data.tableRows.some(item=>reclaimed.dataset.collaborationResource===`schedule:${item.row.id}:non:${item.checkpoint.type}`)){const history=await fetch('/api/non-promotion-reviews?view=history&group=0',{cache:'no-store'});if(!history.ok)throw new Error('读取最新记录失败，请重试。');data=await history.json();}
    if(!read.isCurrent())return;
    if(reclaimed){
      const resource=reclaimed.dataset.collaborationResource!;
      const item=data.tableRows.find(item=>resource===`schedule:${item.row.id}:non:${item.checkpoint.type}`);
      if(item){
        const fingerprint=reclaimed.querySelector<HTMLInputElement>('[name=fingerprint]')!;
        if(inspector.dataset.dirty==='true'&&fingerprint.value!==item.fingerprint)throw new Error('这条记录已有新的保存内容，当前输入已保留。请核对后重新打开该记录。');
        if(inspector.dataset.dirty!=='true')for(const [name,value]of Object.entries({fingerprint:item.fingerprint,recordedThrough:item.metric?.recordedThrough,exposureCount:item.metric?.exposureCount,readCount:item.metric?.readCount,clickRate:item.metric?.clickRate,threeSecondReadRate:item.metric?.threeSecondReadRate,conclusion:item.review?.conclusion})){
          const control=reclaimed.elements.namedItem(name) as HTMLInputElement|HTMLTextAreaElement|null;if(control){control.value=name==='clickRate'&&item.metric&&value==null?'—':String(value??'');control.defaultValue=control.value;}
        }
      }
    }
    const refreshRows=[...data.tableRows,...data.sampleRows.filter(item=>!data.tableRows.some(row=>row.key===item.key))];
    for (const item of refreshRows) {
      const row = table.querySelector<HTMLElement>(`[data-inspector-key="${CSS.escape(item.key)}"]`);
      if (!row) continue;
      const reading=row.querySelector<HTMLElement>('[data-label=阅读量] strong');if(reading){reading.textContent=item.metric?.readCount==null?(item.metric?'未记录':'待录入'):item.metric.readCount.toLocaleString('zh-CN');reading.parentElement!.classList.toggle('has-value',item.metric?.readCount!=null);}
      for (const [key, field, cohort] of [['click','clickRate',item.click],['read','threeSecondReadRate',item.read]] as const) {
        const value = item.metric?.[field]==null?null:Number(item.metric[field]);
        row.dataset[key] = value == null ? '' : String(value);
        const cell = row.querySelector<HTMLElement>(`[data-label="${key === 'click' ? '点击率' : '3 秒阅读率'}"] .metric-cell`);
        if(!cell)continue;
        const delta = value == null || cohort.mean == null ? null : value - cohort.mean;
        cell.classList.toggle('has-value',value!=null);cell.toggleAttribute('data-result-metric',value!=null);
        cell.classList.remove('positive','negative','neutral');
        cell.classList.add(delta == null || Math.abs(delta)<.01 ? 'neutral' : delta>0 ? 'positive' : 'negative');
        cell.title = `${checkpointLabel(item.checkpoint.type)}同类均值 ${cohort.mean?.toFixed(2) ?? '—'}% · n=${cohort.count} 篇`;
        cell.querySelector('strong')!.textContent = value == null ? (item.metric?'未记录':'待录入') : `${value.toFixed(2)}%`;
        const track=cell.querySelector<HTMLElement>('.result-track')!;track.hidden=value==null;track.querySelector<HTMLElement>('i')!.style.width=`${value??0}%`;
        const em=cell.querySelector('em');if(em){em.hidden=cohort.mean==null;const label=document.createElement('span'),mean=document.createElement('span'),sample=document.createElement('span');label.className='metric-reference-label';label.textContent='同类均值 ';mean.textContent=cohort.mean==null?'— ':`${cohort.mean.toFixed(2)}% `;sample.textContent=`· ${cohort.count} 篇`;em.replaceChildren(label,mean,sample);}
        const difference=cell.querySelector('small');if(difference){difference.hidden=value==null||delta==null;difference.textContent=delta==null?'':`${delta>0?'+':''}${delta.toFixed(2)}pp`;}
      }
      const template = [...document.querySelectorAll<HTMLTemplateElement>('template[data-inspector-template]')].find(node => node.dataset.inspectorTemplate === item.key);
      const fingerprint=template?.content.querySelector<HTMLInputElement>('[name=fingerprint]');if(fingerprint)fingerprint.value=item.fingerprint;
      const active=inspector.querySelector<HTMLInputElement>(`[data-review-form][data-collaboration-resource="schedule:${CSS.escape(item.row.id)}:non:${item.checkpoint.type}"] [name=fingerprint]`);if(active)active.value=item.fingerprint;
      if (template) for (const [field, value] of Object.entries({ recordedThrough:item.metric?.recordedThrough,exposureCount:item.metric?.exposureCount,readCount:item.metric?.readCount,clickRate:item.metric?.clickRate,threeSecondReadRate:item.metric?.threeSecondReadRate,conclusion:item.review?.conclusion })) {
        const input = template.content.querySelector<HTMLInputElement|HTMLTextAreaElement>(`[name="${field}"]`);
        if (input) { input.value = field==='clickRate'&&item.metric&&value==null?'—':String(value ?? ''); input.defaultValue = input.value; }
      }
    }
    for(const group of data.categoryGroups){
      const summary=table.querySelector<HTMLElement>(`[data-category-group="${CSS.escape(group.key)}"]`);if(!summary)continue;
      for(const round of group.rounds){
        summary.querySelector(`[data-category-count="${round.type}"]`)!.textContent=`${round.count} 篇`;
        for(const [field,value,count]of [['reading',round.reading,round.readingCount],['click',round.click,round.clickCount],['read',round.read,round.readCount]] as const){
          const cell=summary.querySelector<HTMLElement>(`[data-category-metric="${field}"][data-round="${round.type}"]`)!;
          cell.classList.toggle('has-value',value!=null);cell.title=`有效样本 ${count} 篇`;
          cell.querySelector('strong')!.textContent=value==null?'—':field==='reading'?value.toLocaleString('zh-CN',{maximumFractionDigits:1}):value.toFixed(2)+'%';
          const sample=cell.querySelector('small')!;sample.hidden=count===round.count;sample.textContent=`有效 ${count} 篇`;
          const track=cell.querySelector<HTMLElement>('.result-track');if(track){track.hidden=value==null;track.querySelector<HTMLElement>('i')!.style.width=`${value??0}%`;}
        }
      }
    }
    for(const figure of table.querySelectorAll<HTMLElement>('[data-reading-trend]')){
      const points=data.tableRows.filter(item=>item.row.id===figure.dataset.readingTrend&&item.metric).map(item=>({key:item.key,through:item.metric!.recordedThrough,value:item.metric?.readCount??null})),trend=readingTrend(points);
      figure.hidden=!trend.visible;
      figure.querySelector('[data-trend-maximum]')!.textContent='最高 '+trend.maximum.toLocaleString('zh-CN');
      figure.querySelector('[data-trend-first]')!.textContent=trend.first;figure.querySelector('[data-trend-last]')!.textContent=trend.last;
      const svgNS='http://www.w3.org/2000/svg';
      figure.querySelector('[data-trend-lines]')!.replaceChildren(...trend.segments.map(d=>{const path=document.createElementNS(svgNS,'path');path.setAttribute('d',d);path.setAttribute('pathLength','1');path.setAttribute('data-result-line','');return path;}));
      figure.querySelector('[data-trend-points]')!.replaceChildren(...trend.points.filter(point=>point.y!=null).map(point=>{const dot=document.createElementNS(svgNS,'path');dot.setAttribute('class','trend-point');dot.setAttribute('d',`M${point.x},${point.y}h0.01`);const title=document.createElementNS(svgNS,'title');title.textContent=point.through+' · '+point.value!.toLocaleString('zh-CN');dot.append(title);return dot;}));
    }
    arrange();
    } catch(error) {if(!read.isCurrent())return;throw error;} finally {read.finish();}
  };
  const dateSaved=async(event:Event)=>{
   const read=beginBusinessRead(table.closest<HTMLElement>('.table-pane')!);
   try{
   const response=await fetch(location.href,{signal:read.signal});if(!response.ok)throw new Error('日期已保存，列表刷新失败，请刷新页面查看。');
   const html=new DOMParser().parseFromString(await response.text(),'text/html');if(!read.isCurrent())return;
   for(const incoming of html.querySelectorAll<HTMLElement>('[data-review-group]')){
    let group=body.querySelector<HTMLElement>(`[data-review-group="${CSS.escape(incoming.dataset.reviewGroup!)}"]`);
    if(!group&&table.dataset.mode!=='standard'){body.append(incoming);records.push(...incoming.querySelectorAll<HTMLElement>('[data-row-href]'));continue;}
    for(const row of incoming.querySelectorAll<HTMLElement>('[data-row-href]'))if(!records.some(existing=>existing.dataset.inspectorKey===row.dataset.inspectorKey)){records.push(row);(group??body).append(row);}
   }
   for(const template of html.querySelectorAll<HTMLTemplateElement>('template[data-inspector-template]'))if(!document.querySelector(`template[data-inspector-template="${CSS.escape(template.dataset.inspectorTemplate!)}"]`))inspector.after(template);
   if(body.querySelector('[data-inspector-key]'))document.querySelector<HTMLElement>('.review-empty')?.setAttribute('hidden','');
   const counts=html.querySelectorAll('.review-summary strong');document.querySelectorAll('.review-summary strong').forEach((node,index)=>{if(counts[index])node.textContent=counts[index].textContent;});
   const savedId=(event as CustomEvent).detail.scheduleId,waiting=document.querySelector<HTMLElement>(`[data-awaiting-review="${CSS.escape(savedId)}"]`);
   if(waiting&&!html.querySelector(`[data-awaiting-review="${CSS.escape(savedId)}"]`)){
    waiting.querySelector<HTMLElement>('[popover]')?.hidePopover();const details=waiting.closest('details')!;waiting.remove();const count=details.querySelectorAll('[data-awaiting-review]').length;if(!count)details.remove();else details.querySelector('summary')!.textContent=`持续复盘待安排 (${count})`;
   }
   const incomingUpcoming=html.querySelector<HTMLElement>('[data-upcoming-reviews]'),currentUpcoming=document.querySelector<HTMLElement>('[data-upcoming-reviews]');
   if(incomingUpcoming){if(currentUpcoming)currentUpcoming.replaceChildren(...incomingUpcoming.childNodes);else table.closest('.table-pane')!.append(incomingUpcoming);}else currentUpcoming?.remove();
   document.dispatchEvent(new Event('business:inspector-refresh'));document.dispatchEvent(new Event('business:promotion-fragment-updated'));arrange();
   }catch(error){if(!read.isCurrent())return;const output=document.querySelector<HTMLElement>('[data-shared-review-date-add] output');if(output)output.textContent=error instanceof Error?error.message:'日期已保存，列表刷新失败，请刷新页面查看。';}finally{read.finish();}
  };document.addEventListener('business:review-date-saved',dateSaved);document.addEventListener('astro:before-swap',()=>document.removeEventListener('business:review-date-saved',dateSaved),{once:true});
  inspector.addEventListener('business:edit-reclaimed' ,event=>{const target=event.target as HTMLFormElement;if(target.matches('[data-review-form]'))(event as CustomEvent).detail.waitUntil(refresh(target));});
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
    button.disabled = true; output.setAttribute('role','status');output.textContent = '正在保存…';
    try {
      const endpoint = form.matches('[data-id-correction]') ? form.action : form.matches('[data-checkpoint-form]') ? '/api/non-promotion-checkpoints' : '/api/non-promotion-reviews';
      const response = await fetch(endpoint, { method:'POST',body:new FormData(form),headers:{Accept:'application/json'} });
      const result = await response.json();
      if (!response.ok) { output.setAttribute('role','alert');output.textContent = result.message || '保存失败。'; return; }
      controller.setClean();
      if(form.matches('[data-review-form]')&&result.fingerprint){
        (form.elements.namedItem('fingerprint') as HTMLInputElement).value=result.fingerprint;
        const key=(form.elements.namedItem('scheduleId') as HTMLInputElement).value+':'+(form.elements.namedItem('checkpointType') as HTMLInputElement).value;
        const template=[...inspector.querySelectorAll<HTMLTemplateElement>('template[data-inspector-template]')].find(node=>node.dataset.inspectorTemplate===key);
        for(const input of form.querySelectorAll<HTMLInputElement|HTMLTextAreaElement>('input[name],textarea[name]')){
          const stored=template?.content.querySelector<HTMLInputElement|HTMLTextAreaElement>(`[name="${input.name}"]`);
          if(stored){stored.value=input.value;stored.defaultValue=input.value;}
        }
      }
      if (new URL(location.href).searchParams.get('view') === 'history' && form.matches('[data-review-form]')) {
        await refresh(); output.textContent = '已保存';
      } else await navigate(form.dataset.successHref || location.href);
    } catch (error) { output.setAttribute('role','alert');output.textContent = error instanceof Error && error.message.startsWith('保存已成功') ? error.message : '连接失败，当前输入已保留，请重试。'; }
    finally { button.disabled = false; }
  });
}
document.addEventListener('astro:page-load', initialize);
