import {businessDateTime} from './business-date';
import type {ScheduleHistoryGroups} from '../db/schedule-history';
export function appendScheduleHistoryGroups(host:HTMLElement,groups:ScheduleHistoryGroups){
 for(const group of groups){
  if(!group.items.length)continue;
  const fold=document.createElement('details');fold.dataset.scheduleHistoryGroup=group.key;fold.className='schedule-history-group';
  const summary=document.createElement('summary');summary.textContent=`${group.title} (${group.items.length})`;fold.append(summary);
  for(const entry of group.items){
   const row=document.createElement('section');row.className='workflow-plan-history';
   const heading=document.createElement('div');heading.className='schedule-history-heading';
   const main=document.createElement('p');main.textContent=entry.fromAt&&entry.toAt?`${businessDateTime(entry.fromAt)} → ${businessDateTime(entry.toAt)}`:entry.label;heading.append(main);row.append(heading);
   for(const text of entry.details??[]){const p=document.createElement('p');p.textContent=text;row.append(p);}
   // 初次保存的系统兜底文案不再重复事件名称，业务原因和原始历史仍保留。
   const reasonText=entry.reason==='首轮排期填写'&&['建立排期','初始内容与设置'].includes(entry.label)?'':entry.reason;
   if(reasonText){const reason=document.createElement('p');reason.textContent=reasonText;row.append(reason);}
   const text=[entry.at?businessDateTime(entry.at):null,entry.actor,entry.revision!=null?`R${entry.revision} → R${entry.revision+1}`:null].filter(Boolean).join(' · ');
   if(text){const meta=document.createElement('small');meta.textContent=text;(group.key==='execution'?heading:row).append(meta);}
   fold.append(row);
  }
  host.append(fold);
 }
}
export type {ScheduleExecutionEvent as ExecutionEntry} from '../db/schedule-history';
