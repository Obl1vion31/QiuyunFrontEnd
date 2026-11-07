import {businessDateTime} from './business-date';
import type {ScheduleHistoryGroups} from '../db/schedule-history';
export function appendScheduleHistoryGroups(host:HTMLElement,groups:ScheduleHistoryGroups){
 for(const group of groups){
  if(!group.items.length)continue;
  const fold=document.createElement('details');fold.dataset.scheduleHistoryGroup=group.key;fold.className='schedule-history-group';
  const summary=document.createElement('summary');summary.textContent=`${group.title} (${group.items.length})`;fold.append(summary);
  for(const entry of group.items){
   const row=document.createElement('section');row.className='workflow-plan-history';
   const main=document.createElement('p');main.textContent=entry.fromAt&&entry.toAt?`${businessDateTime(entry.fromAt)} → ${businessDateTime(entry.toAt)}`:entry.label;row.append(main);
   for(const text of entry.details??[]){const p=document.createElement('p');p.textContent=text;row.append(p);}
   if(entry.reason){const reason=document.createElement('p');reason.textContent=entry.reason;row.append(reason);}
   const text=[entry.at?businessDateTime(entry.at):null,entry.actor,entry.revision!=null?`R${entry.revision} → R${entry.revision+1}`:null].filter(Boolean).join(' · ');
   if(text){const meta=document.createElement('small');meta.textContent=text;row.append(meta);}
   fold.append(row);
  }
  host.append(fold);
 }
}
export type {ScheduleExecutionEvent as ExecutionEntry} from '../db/schedule-history';
