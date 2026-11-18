import {createRecordDisclosure} from './business-record-disclosure';
import {businessDateTime,delayDayLabel} from './business-date';
import {delayResponsibilityLabels} from '../db/schedule-rules.mjs';
import '../styles/schedule-delay.css';

type ReasonEntry={reason:string;responsibility:keyof typeof delayResponsibilityLabels;source:string;updatedAt:string;changedByName:string};
export type DelayDay={planRevision:number;dayNumber:number;dueAt:string;archived:boolean;saved:(ReasonEntry&{id:string;history:unknown[]})|null};
const el=<K extends keyof HTMLElementTagNameMap>(tag:K,text?:string)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
export function delayFields(entry:ReasonEntry){
 const list=el('dl');list.className='delay-facts';
 for(const[label,value]of [['原因归属',delayResponsibilityLabels[entry.responsibility]],['延期说明',entry.reason]]){const row=el('div');row.append(el('dt',label),el('dd',value));list.append(row);}
 return list;
}
export function delayMeta(entry:ReasonEntry){
 const meta=el('p');meta.className='delay-meta';
 if(entry.source!=='historical'){const time=el('time',businessDateTime(entry.updatedAt));time.dateTime=entry.updatedAt;meta.append(time,document.createTextNode(' · '+entry.changedByName));}
 return meta;
}
export function appendScheduleDelay(host:HTMLElement,days:DelayDay[],plannedAt:string,options:{prepare?:(day:DelayDay,row:HTMLElement,summary:HTMLElement,readOnly:HTMLElement)=>void;expanded?:Set<string>;open?:boolean}={}){
 host.replaceChildren();host.hidden=!days.length;if(!days.length)return;
 host.classList.add('schedule-delay');
 const fold=createRecordDisclosure('延期说明',days.length,options.open);fold.dataset.scheduleDelayFold='';
 const body=el('div');body.className='delay-fold-body';fold.append(body);host.append(fold);

 const pending=days.filter(d=>!d.saved),saved=days.filter(d=>d.saved).sort((a,b)=>b.dayNumber-a.dayNumber);
 if(pending.length){const count=el('p',`待填写 ${pending.length} 条`);count.className='delay-pending-count';body.append(count);}
 for(const day of [...pending,...saved]){
  const row=el(day.saved?'section':'details');row.className='delay-day';row.dataset.delayKey=`${day.planRevision}:${day.dayNumber}`;
  const heading=el(day.saved?'header':'summary');heading.className='delay-day-heading';
  const time=el('time',businessDateTime(day.dueAt));time.dateTime=day.dueAt;
  const phase=el('span',delayDayLabel(plannedAt,day.dueAt));phase.className='delay-day-phase';heading.append(time,phase);row.append(heading);
  const readOnly=el('div');readOnly.className='delay-current';
  if(day.saved)readOnly.append(delayFields(day.saved));else if(row instanceof HTMLDetailsElement)row.open=day===pending[0]||!!options.expanded?.has(row.dataset.delayKey);
  row.append(readOnly);
  options.prepare?.(day,row,heading,readOnly);
  if(day.saved){
   row.append(delayMeta(day.saved));
  }
  body.append(row);
 }
}
