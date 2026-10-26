import {businessConfirm} from './business-dialog';
import {getInspector} from './business-inspector';
import {readBusiness} from './business-read';
export const randomRequestKey=()=>crypto.randomUUID();
/** 更新数据不收起用户正在查看的本帖表格，也不重置横向比较位置。 */
function replacePromotionRow(old:Element,next:Element){
 const focused=document.activeElement as HTMLInputElement|HTMLSelectElement|null;
 const focusSelector=focused&&old.contains(focused)?focused.name?`[name="${CSS.escape(focused.name)}"]`:focused.matches('[data-edit-start]')?'[data-edit-start]':null:null;
 const focusDay=focused?.closest<HTMLElement>('[data-review-day]')?.dataset.reviewDay;
 const selection=focused instanceof HTMLInputElement&&['text','search','url','tel','password'].includes(focused.type)?[focused.selectionStart,focused.selectionEnd]:null;
 const dayStates=new Map([...old.querySelectorAll<HTMLDetailsElement>('details[data-review-day]')].map(node=>[node.dataset.reviewDay,node.open]));
 const clone=next.cloneNode(true) as HTMLElement;
 // 午夜换日若移除了正在编辑的安排，先保留这条有草稿的日期，保存／放弃后再归并。
 for(const source of old.querySelectorAll<HTMLFormElement>('form[data-timeline-form][data-dirty=true]')){
  const sourceDay=source.closest<HTMLElement>('[data-review-day]');if(!sourceDay)continue;
  const targetDay=clone.querySelector<HTMLElement>(`[data-review-day="${CSS.escape(sourceDay.dataset.reviewDay!)}"]`);
  if(targetDay&&[...targetDay.querySelectorAll('form')].some(form=>form.className===source.className))continue;
  const preserved=sourceDay.cloneNode(true) as HTMLElement;preserved.dataset.preservedArrangementDraft='true';
  for(const node of [preserved,...preserved.querySelectorAll<HTMLElement>('*')])for(const attribute of [...node.attributes])if(attribute.name==='data-ready'||attribute.name.endsWith('-ready'))node.removeAttribute(attribute.name);
  const hint=preserved.querySelector('.review-day-hint');if(hint)hint.textContent='安排修改未保存';
  if(targetDay)targetDay.replaceWith(preserved);else{const after=[...clone.querySelectorAll<HTMLElement>('[data-review-day]')].find(day=>day.dataset.reviewDate!>sourceDay.dataset.reviewDate!);clone.insertBefore(preserved,after??null);}
 }
 const previousCurrent=old.querySelector<HTMLElement>('.is-current[data-stage-node]')?.dataset.stageNode;
 const nextCurrent=clone.querySelector<HTMLElement>('.is-current[data-stage-node]');
 if(previousCurrent&&nextCurrent&&nextCurrent.dataset.stageNode!==previousCurrent)nextCurrent.dataset.phaseChanged='true';
 clone.querySelectorAll<HTMLDetailsElement>('details[data-review-day]').forEach(node=>{if(dayStates.has(node.dataset.reviewDay))node.open=dayStates.get(node.dataset.reviewDay)!;});
 for(const source of old.querySelectorAll<HTMLElement>('[data-review-day]')){
  const target=clone.querySelector<HTMLElement>(`[data-review-day="${CSS.escape(source.dataset.reviewDay!)}"]`);if(!target)continue;
  const nested=[...target.querySelectorAll<HTMLDetailsElement>('details')];source.querySelectorAll<HTMLDetailsElement>('details').forEach((node,index)=>{if(nested[index])nested[index].open=node.open;});
  for(const selector of ['[data-pending-panel]','[data-day-editor]']){const previous=[...source.querySelectorAll<HTMLElement>(selector)],next=[...target.querySelectorAll<HTMLElement>(selector)];previous.forEach((node,index)=>{if(next[index])next[index].hidden=node.hidden;});}
  const triggers=[...target.querySelectorAll<HTMLElement>('[aria-expanded]')];source.querySelectorAll<HTMLElement>('[aria-expanded]').forEach((node,index)=>{if(triggers[index])triggers[index].setAttribute('aria-expanded',node.getAttribute('aria-expanded')!);});
 }

 for(const source of old.querySelectorAll<HTMLFormElement>('form[data-dirty=true]')){
  const day=source.closest<HTMLElement>('[data-review-day]')?.dataset.reviewDay;
  const date=source.querySelector<HTMLInputElement>('[name=metricDate],[name=reviewDate]')?.value;
  const candidates=[...clone.querySelectorAll<HTMLFormElement>('form')];
  const target=candidates.find(form=>form.className===source.className&&(day?form.closest<HTMLElement>('[data-review-day]')?.dataset.reviewDay===day:form.querySelector<HTMLInputElement>('[name=metricDate],[name=reviewDate]')?.value===date));
  if(!target)continue;
  const sourceFields=[...source.querySelectorAll<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>('input:not([type=hidden]),select,textarea')],targetFields=[...target.querySelectorAll<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>('input:not([type=hidden]),select,textarea')];
  sourceFields.forEach((field,index)=>{const live=field.name?target.elements.namedItem(field.name):targetFields[index];if(live instanceof HTMLInputElement||live instanceof HTMLSelectElement||live instanceof HTMLTextAreaElement){live.value=field.value;if(live instanceof HTMLInputElement&&field instanceof HTMLInputElement)live.checked=field.checked;}});
  target.dataset.dirty='true';
 }

 const opened=new Set([...old.querySelectorAll<HTMLDetailsElement>('details[open][data-promotion-data]')].map(node=>node.dataset.promotionData));
 clone.querySelectorAll<HTMLDetailsElement>('details[data-promotion-data]').forEach(node=>node.open=opened.has(node.dataset.promotionData));
 const positions=[...old.querySelectorAll<HTMLElement>('.promotion-table-scroll')].map(node=>node.scrollLeft);
 old.replaceWith(clone);if(focusSelector&&focusDay){const field=clone.querySelector<HTMLInputElement>(`[data-review-day="${CSS.escape(focusDay)}"] ${focusSelector}`);field?.focus({preventScroll:true});if(field&&selection)field.setSelectionRange(selection[0],selection[1]);}clone.querySelectorAll<HTMLElement>('.promotion-table-scroll').forEach((node,index)=>node.scrollLeft=positions[index]??0);
 return clone;
}

/** 活动日期按稳定键合并；保留仍可编辑的原生输入和焦点。 */
function reconcileDailySchedule(scheduleId:string,fresh:Document){
 const body=document.querySelector<HTMLElement>('[data-promotion-pending-body]'),source=fresh.querySelector<HTMLElement>('[data-promotion-pending-body]');
 if(!body||!source)return;
 const selector=`[data-review-record][data-review-post="${CSS.escape(scheduleId)}"]`;
 const existing=new Map([...body.querySelectorAll<HTMLElement>(selector)].map(row=>[row.dataset.reviewRecord!,row]));
 const ensureContainer=(next:HTMLElement)=>{
  const name=next.parentElement!.dataset.reviewContainer!;
  let container=body.querySelector<HTMLElement>(`[data-review-container="${CSS.escape(name)}"]`);
  if(!container&&name.startsWith('upcoming:')){
   const sourceGroup=next.closest<HTMLElement>('[data-review-opening-group]')!,group=sourceGroup.cloneNode(true) as HTMLElement;
   group.querySelectorAll('[data-review-record]').forEach(row=>row.remove());body.querySelector('[data-review-opening-groups]')?.append(group);
   container=group.querySelector<HTMLElement>('[data-review-container]');
  }
  return container;
 };
 for(const next of source.querySelectorAll<HTMLElement>(selector)){
  const key=next.dataset.reviewRecord!,old=existing.get(key),container=ensureContainer(next);if(!container)continue;
  let live:HTMLElement;
  const oldForm=old?.querySelector<HTMLFormElement>('[data-metric-form]'),nextForm=next.querySelector<HTMLFormElement>('[data-metric-form]');
  if(old&&oldForm&&nextForm){
   live=old;
   for(const [key,value]of Object.entries(next.dataset))live.dataset[key]=value;
   const changed=oldForm.dataset.actualStatus!==nextForm.dataset.actualStatus;
   const oldDecision=oldForm.querySelector('.review-decision'),nextDecision=nextForm.querySelector('.review-decision');
   const meetingChanged=!!(nextDecision?.querySelector('[data-meeting-change]')||oldDecision?.querySelector('[data-meeting-change]'));
   if(meetingChanged&&nextDecision)oldDecision?.replaceWith(nextDecision.cloneNode(true));
   for(const [key,value]of Object.entries(nextForm.dataset))if(!['dailyReady','dirty'].includes(key))oldForm.dataset[key]=value;
   for(const input of nextForm.querySelectorAll<HTMLInputElement>('input[type=hidden][name]')){const field=oldForm.elements.namedItem(input.name) as HTMLInputElement|null;if(field&&(input.name!=='platformNoteId'||input.value||!field.value))field.value=input.value;}
   if(changed){
    if(nextForm.dataset.defaultZero==='true'&&oldForm.dataset.dirty!=='true'&&['spend','platformOpenCount','actualOpenCount','platformLeadCount','actualLeadCount'].every(name=>(oldForm.elements.namedItem(name) as HTMLInputElement).value===''))for(const name of ['spend','platformOpenCount','actualOpenCount','platformLeadCount','actualLeadCount'])(oldForm.elements.namedItem(name) as HTMLInputElement).value='0';
    const trigger=oldForm.querySelector<HTMLButtonElement>('[data-toggle-day-state]')!,newTrigger=nextForm.querySelector<HTMLButtonElement>('[data-toggle-day-state]')!;
    trigger.replaceChildren(...[...newTrigger.childNodes].map(node=>node.cloneNode(true)));trigger.disabled=newTrigger.disabled;
    oldForm.className=nextForm.className;
    const decision=oldForm.querySelector<HTMLSelectElement>('[data-review-decision]'),newDecision=nextForm.querySelector<HTMLSelectElement>('[data-review-decision]');
    if(decision&&newDecision){const value=decision.value;decision.replaceChildren(...Array.from(newDecision.options).map(option=>option.cloneNode(true)));decision.value=Array.from(decision.options).some(option=>option.value===value)?value:'';}
    else {const replacement=nextForm.querySelector('.review-decision');if(replacement)oldForm.querySelector('.review-decision')?.replaceWith(replacement.cloneNode(true));}
    oldForm.dispatchEvent(new Event('business:metric-context-updated'));
   }else if(meetingChanged)oldForm.dispatchEvent(new Event('business:metric-context-updated'));
  }else if(old){live=replacePromotionRow(old,next);}else live=next.cloneNode(true) as HTMLElement;
  existing.delete(key);
  if(live.parentElement!==container)container.append(live);
 }
 for(const old of existing.values()){
  if(old.querySelector('form[data-dirty=true]')){old.dataset.preservedArrangementDraft='true';continue;}
  old.remove();
 }
 // 分类外壳保持原节点与开合；只同步实际条目、数量和开放时间。
 for(const section of body.querySelectorAll<HTMLElement>('[data-review-section]')){
  const next=source.querySelector<HTMLElement>(`[data-review-section="${section.dataset.reviewSection}"]`);if(!next)continue;
  const count=section.querySelectorAll('[data-review-record]').length;section.hidden=!count;
  const heading=section.querySelector('[data-review-section-label]'),nextHeading=next.querySelector('[data-review-section-label]');if(heading&&nextHeading)heading.textContent=nextHeading.textContent;
  const hint=section.querySelector('[data-review-opening-hint]'),nextHint=next.querySelector('[data-review-opening-hint]');if(hint)hint.textContent=nextHint?.textContent??'';
 }
 for(const group of body.querySelectorAll('[data-review-opening-group]'))if(!group.querySelector('[data-review-record]'))group.remove();
 const ready=body.querySelector<HTMLElement>('[data-review-container=ready]'),empty=body.querySelector<HTMLElement>('[data-review-empty]');
 if(ready)ready.hidden=!ready.querySelector('[data-review-record]');if(empty)empty.hidden=!!ready?.querySelector('[data-review-record]');
 // 仅在顺序真实变化时移动节点，日常输入和其他帖子的节点保持连续。
 for(const container of body.querySelectorAll<HTMLElement>('[data-review-container]')){
  const name=container.dataset.reviewContainer!,target=source.querySelector<HTMLElement>(`[data-review-container="${CSS.escape(name)}"]`);
  if(!target)continue;
  let cursor=container.querySelector<HTMLElement>(':scope>[data-review-record]');
  for(const next of target.querySelectorAll<HTMLElement>(':scope>[data-review-record]')){
   const live=container.querySelector<HTMLElement>(`:scope>[data-review-record="${CSS.escape(next.dataset.reviewRecord!)}"]`);if(!live)continue;
   if(live===cursor)cursor=cursor.nextElementSibling as HTMLElement|null;else container.insertBefore(live,cursor);
  }
 }
 body.dataset.serverNow=source.dataset.serverNow;body.dataset.dueCount=source.dataset.dueCount;
}
/** 仅替换本篇业务行；其他帖子输入、公共表头、工具栏与滚动保持原样。 */
export async function refreshPromotionSchedule(scheduleId:string,freshDocument?:Document){
 const paneHost=document.querySelector<HTMLElement>(`[data-promotion-state-history]:has([data-timeline-row="${CSS.escape(scheduleId)}"])`);
 if(paneHost){const html=await readBusiness(paneHost,async read=>{const response=await fetch(`/api/operations-content/${scheduleId}/promotion-timeline`,{cache:'no-store',signal:read.signal});if(!response.ok)throw new Error('状态刷新失败');return response.text();},{isCurrent:()=>paneHost.closest<HTMLElement>('[data-inspector]')?.dataset.selectedId===scheduleId});if(html===undefined)return;if(paneHost.closest<HTMLElement>('[data-inspector]')?.dataset.selectedId===scheduleId){paneHost.innerHTML=html;const state=paneHost.querySelector<HTMLElement>('[data-timeline-row]');paneHost.closest('[data-inspector]')?.dispatchEvent(new CustomEvent('business:promotion-state-updated',{detail:{id:scheduleId,label:state?.dataset.promotionLabel,status:state?.dataset.promotionStatus}}));document.dispatchEvent(new CustomEvent('business:promotion-fragment-updated'));}if(!document.querySelector('[data-promotion-pending-body]'))return;}
 let fresh=freshDocument;
 if(!fresh){const target=document.querySelector<HTMLElement>(`[data-lifecycle-schedule="${CSS.escape(scheduleId)}"]`)??document.querySelector<HTMLElement>('[data-promotion-pending-body]')??document.body;fresh=await readBusiness(target,async task=>{const response=await fetch(location.href,{headers:{Accept:'text/html'},cache:'no-store',signal:task.signal});if(!response.ok)throw new Error('列表刷新失败');const html=await response.text();if(!task.isCurrent())throw new DOMException('旧读取已取消','AbortError');return new DOMParser().parseFromString(html,'text/html');});}
 if(!fresh)return;
 const key=CSS.escape(scheduleId),scroll=window.scrollY;
 reconcileDailySchedule(scheduleId,fresh);
 for(const node of document.querySelectorAll('[data-promotion-pending-count]'))node.textContent=fresh.querySelector('[data-promotion-pending-count]')?.textContent??'';
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
  row.addEventListener('keydown',event=>{if(row.closest('[data-inspector]'))return;if(event.key!=='Escape'||!(event.target as Element).closest('[data-pending-panel]'))return;event.preventDefault();const panel=(event.target as Element).closest<HTMLElement>('[data-pending-panel]')!;toggle(panel.dataset.pendingPanel!);row.querySelector<HTMLButtonElement>(`[data-pending-toggle="${panel.dataset.pendingPanel}"]`)?.focus();});
 });
 document.querySelectorAll<HTMLFormElement>('[data-timeline-form]:not([data-ready])').forEach(form=>{
 form.dataset.ready='true';const requestKey=crypto.randomUUID();
 const sync=()=>{
  const action=(form.elements.namedItem('action') as HTMLSelectElement)?.value,waiting=action==='wait'||action==='pause'||form.hasAttribute('data-pending-editor')&&action==='next';
  const through=form.querySelector<HTMLElement>('[data-timeline-through]');
  if(through){through.hidden=!waiting;through.querySelectorAll<HTMLInputElement>('input').forEach(input=>{input.disabled=!waiting;input.required=waiting;});}
  if(form.hasAttribute('data-pending-editor')){
   const startField=form.querySelector<HTMLElement>('[data-edit-start-field]')!,start=startField.querySelector<HTMLInputElement>('input')!;
   startField.hidden=waiting;start.disabled=waiting;start.required=!waiting;
   (form.elements.namedItem('reviewDate') as HTMLInputElement).value=waiting?form.dataset.waitDate!:start.value;
   const next=form.querySelector<HTMLInputElement>('[data-edit-wait-decision]');if(next)next.disabled=!waiting;
   (form.elements.namedItem('reason') as HTMLInputElement).maxLength=waiting?500:2000;
  }
 };
 sync();form.addEventListener('change',sync);form.addEventListener('input',()=>{sync();form.dataset.dirty='true';document.documentElement.dataset.unsaved='true';const pane=form.closest<HTMLElement>('[data-inspector]');if(pane)pane.dataset.dirty='true';});
 form.addEventListener('submit',async event=>{event.preventDefault();if(form.dataset.pendingDue==='false')return;const out=form.querySelector('output')!,button=form.querySelector<HTMLButtonElement>('button[type=submit]')!;
  const otherDrafts=[...(form.closest('[data-pending-row]')?.querySelectorAll<HTMLFormElement>('form[data-dirty=true]')??[])].filter(other=>other!==form);
  if(otherDrafts.length&&!await businessConfirm('本条还有其他未保存修改。继续保存会更新整条记录，是否放弃这些修改？',{confirmLabel:'继续保存'}))return;
  const payload={...Object.fromEntries(new FormData(form)),requestKey,fingerprint:form.dataset.fingerprint,confirmImpact:false};button.disabled=true;out.textContent='正在保存…';
  const send=()=>fetch('/api/promotion-timeline',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  let saved=false;
  try{let response=await send(),result=await response.json();if(result.confirmationRequired&&await businessConfirm(`更正会归档 ${result.impact.dates.join('、')} 的 ${result.impact.dailyMetrics} 条冲突指标并重新开放补录，是否继续？`,{title:'确认历史影响',confirmLabel:'确认更正'})){payload.confirmImpact=true;response=await send();result=await response.json();}
   if(!response.ok){out.textContent=result.message??result.impact?.message??'保存失败，输入已保留。';return;}
   saved=true;const scheduleId=String(new FormData(form).get('scheduleId'));const pane=form.closest<HTMLElement>('[data-inspector]');if(pane)getInspector(pane).setClean();delete form.dataset.dirty;document.dispatchEvent(new CustomEvent('business:promotion-arrangement-saving',{detail:{scheduleId}}));await refreshPromotionSchedule(scheduleId);document.dispatchEvent(new CustomEvent('business:promotion-arrangement-saved',{detail:{scheduleId}}));document.documentElement.dataset.unsaved=String(!!document.querySelector('form[data-dirty=true]'));
  }catch{out.textContent=saved?'已保存，列表刷新失败，请刷新页面核对。':'连接失败，输入已保留。';}finally{button.disabled=saved;}
 });
});}
initialize();document.addEventListener('astro:page-load',initialize);document.addEventListener('business:inspector-render',initialize);document.addEventListener('business:promotion-fragment-updated',initialize);
