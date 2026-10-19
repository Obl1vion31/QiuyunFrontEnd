import {businessConfirm} from './business-dialog';
import {getInspector} from './business-inspector';
import {promotionIntervalPreview} from '../db/promotion-pending';
export const randomRequestKey=()=>crypto.randomUUID();
/** 更新数据不收起用户正在查看的本帖表格，也不重置横向比较位置。 */
function replacePromotionRow(old:Element,next:Element){
 const clone=next.cloneNode(true) as HTMLElement;
 const opened=new Set([...old.querySelectorAll<HTMLDetailsElement>('details[open][data-promotion-data]')].map(node=>node.dataset.promotionData));
 clone.querySelectorAll<HTMLDetailsElement>('details[data-promotion-data]').forEach(node=>node.open=opened.has(node.dataset.promotionData));
 const positions=[...old.querySelectorAll<HTMLElement>('.promotion-table-scroll')].map(node=>node.scrollLeft);
 old.replaceWith(clone);clone.querySelectorAll<HTMLElement>('.promotion-table-scroll').forEach((node,index)=>node.scrollLeft=positions[index]??0);
 return clone;
}
/** 仅替换本篇业务行；其他帖子输入、公共表头、工具栏与滚动保持原样。 */
export async function refreshPromotionSchedule(scheduleId:string){
 const paneHost=document.querySelector<HTMLElement>(`[data-promotion-state-history]:has([data-timeline-row="${CSS.escape(scheduleId)}"])`);
 if(paneHost){const response=await fetch(`/api/operations-content/${scheduleId}/promotion-timeline`,{cache:'no-store'});if(!response.ok)throw new Error('状态刷新失败');const html=await response.text();if(paneHost.closest<HTMLElement>('[data-inspector]')?.dataset.selectedId===scheduleId){paneHost.innerHTML=html;const state=paneHost.querySelector<HTMLElement>('[data-timeline-row]');paneHost.closest('[data-inspector]')?.dispatchEvent(new CustomEvent('business:promotion-state-updated',{detail:{id:scheduleId,label:state?.dataset.promotionLabel,status:state?.dataset.promotionStatus}}));document.dispatchEvent(new CustomEvent('business:promotion-fragment-updated'));}return;}
 const response=await fetch(location.href,{headers:{Accept:'text/html'},cache:'no-store'});if(!response.ok)throw new Error('列表刷新失败');
 const fresh=new DOMParser().parseFromString(await response.text(),'text/html'),key=CSS.escape(scheduleId),scroll=window.scrollY;
 const dailyBody=document.querySelector<HTMLElement>('[data-promotion-pending-body]');
 const oldArticles=[...document.querySelectorAll<HTMLElement>(`[data-timeline-row="${key}"]`)],newArticles=[...fresh.querySelectorAll<HTMLElement>(`[data-timeline-row="${key}"]`)];
 oldArticles.forEach((node,index)=>{if(newArticles[index])node.replaceWith(newArticles[index].cloneNode(true));else node.remove();});
 if(!oldArticles.length&&newArticles.length){let host=document.querySelector<HTMLElement>('.promotion-timeline');if(!host){const source=fresh.querySelector('.promotion-timeline');if(source&&dailyBody){host=source.cloneNode(false) as HTMLElement;dailyBody.insertBefore(host,dailyBody.querySelector('.daily-table-wrap,.empty-state'));}}for(const node of newArticles)host?.append(node.cloneNode(true));}
 const selector=`[data-metric-form][data-schedule-id="${key}"],[data-locked-schedule="${key}"]`;
 const oldRows=[...document.querySelectorAll(selector)],newRows=[...fresh.querySelectorAll(selector)];
 const grid=document.querySelector('.daily-grid');
 if(grid){const anchor=oldRows[0]??null;for(const row of newRows)grid.insertBefore(row.cloneNode(true),anchor);oldRows.forEach(row=>row.remove());}
 else if(newRows.length){dailyBody?.querySelector('.empty-state')?.remove();const wrap=fresh.querySelector('.daily-table-wrap');if(wrap)dailyBody?.append(wrap.cloneNode(true));}
 for(const node of document.querySelectorAll('[data-promotion-pending-count]'))node.textContent=fresh.querySelector('[data-promotion-pending-count]')?.textContent??'';
 const empty=fresh.querySelector('[data-promotion-pending-body]>.empty-state');dailyBody?.querySelector('.empty-state')?.remove();if(empty)dailyBody?.append(empty.cloneNode(true));
 const cardSelector=`[data-lifecycle-schedule="${key}"]`,oldCard=document.querySelector(cardSelector),newCard=fresh.querySelector(cardSelector);
 if(oldCard){if(newCard)replacePromotionRow(oldCard,newCard);else oldCard.remove();}else if(newCard){let list=document.querySelector('.lifecycle-list');if(!list){const source=fresh.querySelector('.lifecycle-list');if(source){list=source.cloneNode(false) as HTMLElement;document.querySelector('.calendar-section>.empty-state')?.remove();document.querySelector('.calendar-section')?.append(list);}}list?.append(newCard.cloneNode(true));}
 const lifecycle=document.querySelector('.lifecycle-list');if(lifecycle&&!lifecycle.children.length){lifecycle.remove();const empty=fresh.querySelector('.calendar-section>.empty-state');if(empty)document.querySelector('.calendar-section')?.append(empty.cloneNode(true));}
 const historySelector=`[data-history-row][data-history-schedule="${key}"]`,oldHistory=[...document.querySelectorAll<HTMLElement>(historySelector)],newHistory=[...fresh.querySelectorAll<HTMLElement>(historySelector)];
 for(const old of oldHistory){const next=newHistory.find(row=>row.dataset.metricId===old.dataset.metricId);if(next){const group=next.closest<HTMLElement>('[data-history-group]')?.dataset.historyGroup;replacePromotionRow(old,next);if(group){const target=document.querySelector(`[data-history-group="${group}"]`);const node=document.querySelector(historySelector);if(node&&target&&!target.contains(node))target.append(node);}}else old.remove();}
 for(const next of newHistory.filter(row=>!oldHistory.some(old=>old.dataset.metricId===row.dataset.metricId))){const group=next.closest<HTMLElement>('[data-history-group]')?.dataset.historyGroup;const host=group?document.querySelector(`[data-history-group="${group}"]`):document.querySelector(`[data-day-group="${next.dataset.historyDate}"]`);host?.append(next.cloneNode(true));}
 for(const group of document.querySelectorAll<HTMLElement>('[data-history-group]')){const source=fresh.querySelector(`[data-history-group="${group.dataset.historyGroup}"]`);const title=group.querySelector('h2'),next=source?.querySelector('h2');if(title&&next)title.replaceChildren(...[...next.childNodes].map(n=>n.cloneNode(true)));group.querySelector('.promotion-group-empty')?.remove();const empty=source?.querySelector('.promotion-group-empty');if(empty)group.append(empty.cloneNode(true));}
 const templateSelector=`template[data-history-schedule="${key}"]`,oldTemplates=[...document.querySelectorAll<HTMLTemplateElement>(templateSelector)],newTemplates=[...fresh.querySelectorAll<HTMLTemplateElement>(templateSelector)];
 for(const template of oldTemplates){const next=newTemplates.find(row=>row.dataset.inspectorTemplate===template.dataset.inspectorTemplate);if(next)template.replaceWith(next.cloneNode(true));else template.remove();}
 for(const template of newTemplates.filter(row=>!oldTemplates.some(old=>old.dataset.inspectorTemplate===row.dataset.inspectorTemplate)))document.querySelector('[data-promotion-inspector]')?.parentElement?.append(template.cloneNode(true));
 const pane=document.querySelector<HTMLElement>('[data-promotion-inspector]');if(pane&&oldTemplates.some(row=>row.dataset.inspectorTemplate===pane.dataset.selectedId)){const controller=getInspector(pane),selected=controller.selected;if(selected&&pane.dataset.dirty!=='true'){const next=newTemplates.some(row=>row.dataset.inspectorTemplate===selected)?selected:newTemplates[0]?.dataset.inspectorTemplate;controller.close(false);if(next)controller.open(next,null,next!==selected);}}
 for(const group of document.querySelectorAll<HTMLElement>('.day-group')){if(!group.querySelector('[data-inspector-key]')){group.remove();continue;}const date=group.querySelector('[data-history-date]')?.getAttribute('data-history-date'),source=date?fresh.querySelector(`[data-history-date="${CSS.escape(date)}"]`)?.closest('.day-group'):null;if(source){const totals=group.querySelector('[data-promotion-table-totals]'),next=source.querySelector('[data-promotion-table-totals]');if(totals&&next)totals.replaceChildren(...[...next.childNodes].map(node=>node.cloneNode(true)));const count=group.querySelector(':scope>summary>span'),freshCount=source.querySelector(':scope>summary>span');if(count&&freshCount)count.textContent=freshCount.textContent;}}
 document.dispatchEvent(new CustomEvent('business:promotion-fragment-updated'));document.dispatchEvent(new CustomEvent('business:workflow-updated'));window.scrollTo({top:scroll});
}
function initialize(){
 document.querySelectorAll<HTMLElement>('[data-pending-row]:not([data-pending-ready])').forEach(row=>{
  row.dataset.pendingReady='true';
  const toggle=(name:string)=>{
   const target=row.querySelector<HTMLElement>(`[data-pending-panel="${name}"]`),opening=!!target?.hidden;
   row.querySelectorAll<HTMLElement>('[data-pending-panel]').forEach(panel=>panel.hidden=panel!==target||!opening);
   row.querySelectorAll<HTMLButtonElement>('[data-pending-toggle]').forEach(button=>button.setAttribute('aria-expanded',String(opening&&button.dataset.pendingToggle===name)));
   if(opening)target?.querySelector<HTMLElement>('input:not([type=hidden]),select,[tabindex]')?.focus({preventScroll:true});
  };
  row.addEventListener('click',event=>{const button=(event.target as Element).closest<HTMLButtonElement>('[data-pending-toggle]');if(button)toggle(button.dataset.pendingToggle!);});
  row.addEventListener('keydown',event=>{if(event.key!=='Escape'||!(event.target as Element).closest('[data-pending-panel]'))return;event.preventDefault();const panel=(event.target as Element).closest<HTMLElement>('[data-pending-panel]')!;toggle(panel.dataset.pendingPanel!);row.querySelector<HTMLButtonElement>(`[data-pending-toggle="${panel.dataset.pendingPanel}"]`)?.focus();});
 });
 document.querySelectorAll<HTMLFormElement>('[data-timeline-form]:not([data-ready])').forEach(form=>{
 form.dataset.ready='true';const requestKey=crypto.randomUUID();
 const sync=()=>{const action=(form.elements.namedItem('action') as HTMLSelectElement)?.value;const through=form.querySelector<HTMLElement>('[data-timeline-through]');if(through){through.hidden=action!=='wait';through.querySelectorAll<HTMLInputElement>('input').forEach(input=>{input.disabled=action!=='wait';input.required=action==='wait';});}const preview=form.querySelector<HTMLElement>('[data-pending-preview]');if(preview){preview.hidden=action!=='wait';preview.textContent=promotionIntervalPreview(form.dataset.pendingStart!,String((form.elements.namedItem('waitingThrough') as HTMLInputElement)?.value))??'请选择不早于安排日期的截止日。';}};
 sync();form.addEventListener('change',sync);form.addEventListener('input',()=>{sync();form.dataset.dirty='true';document.documentElement.dataset.unsaved='true';const pane=form.closest<HTMLElement>('[data-inspector]');if(pane)pane.dataset.dirty='true';});
 form.addEventListener('submit',async event=>{event.preventDefault();const out=form.querySelector('output')!,button=form.querySelector<HTMLButtonElement>('button[type=submit]')!;
  const otherDrafts=[...(form.closest('[data-pending-row]')?.querySelectorAll<HTMLFormElement>('form[data-dirty=true]')??[])].filter(other=>other!==form);
  if(otherDrafts.length&&!await businessConfirm('本条还有其他未保存修改。继续保存会更新整条记录，是否放弃这些修改？',{confirmLabel:'继续保存'}))return;
  const payload={...Object.fromEntries(new FormData(form)),requestKey,fingerprint:form.dataset.fingerprint,confirmImpact:false};button.disabled=true;out.textContent='正在保存…';
  const send=()=>fetch('/api/promotion-timeline',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  let saved=false;
  try{let response=await send(),result=await response.json();if(result.confirmationRequired&&await businessConfirm(`更正会归档 ${result.impact.dates.join('、')} 的 ${result.impact.dailyMetrics} 条冲突指标并重新开放补录，是否继续？`,{title:'确认历史影响',confirmLabel:'确认更正'})){payload.confirmImpact=true;response=await send();result=await response.json();}
   if(!response.ok){out.textContent=result.message??result.impact?.message??'保存失败，输入已保留。';return;}
   saved=true;const pane=form.closest<HTMLElement>('[data-inspector]');if(pane)getInspector(pane).setClean();delete form.dataset.dirty;await refreshPromotionSchedule(String(new FormData(form).get('scheduleId')));document.documentElement.dataset.unsaved=String(!!document.querySelector('form[data-dirty=true]'));
  }catch{out.textContent=saved?'已保存，列表刷新失败，请刷新页面核对。':'连接失败，输入已保留。';}finally{button.disabled=saved;}
 });
});}
initialize();document.addEventListener('astro:page-load',initialize);document.addEventListener('business:inspector-render',initialize);document.addEventListener('business:promotion-fragment-updated',initialize);
