import type {HistoryChange} from '../db/schedule-business-history';
import type {InspectorHistoryCategory,InspectorHistoryEvent} from '../db/inspector-history';
import {businessDateTime} from './business-date';
import '../styles/business-view-switch.css';
import '../styles/schedule-history.css';

export type HistoryViewState={open:boolean;category:string;limit:number;expanded:string[]};
export function historyViewState(host:HTMLElement):HistoryViewState|undefined{
 const root=host.querySelector<HTMLDetailsElement>('[data-business-history-timeline]');
 return root?{open:root.open,category:root.dataset.category??'all',limit:Number(root.dataset.limit??10),expanded:[...root.querySelectorAll<HTMLDetailsElement>('[data-history-evidence][open]')].map(d=>d.dataset.historyEvidence!)}:undefined;
}
let sequence=0;
const el=<K extends keyof HTMLElementTagNameMap>(tag:K,text?:string)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
const names:Record<InspectorHistoryCategory,string>={schedule:'排期',publication:'发布',settings:'内容与复盘',promotion:'推广执行'};
export function mergeInspectorHistory(events:InspectorHistoryEvent[],extra:InspectorHistoryEvent[]):InspectorHistoryEvent[]{
 const combined=new Map<string,InspectorHistoryEvent>();
 for(const event of [...events,...extra]){
  const existing=combined.get(event.id);
  if(existing){existing.categories=[...new Set([...existing.categories,...event.categories])];existing.evidence=[...new Set([...existing.evidence,...event.evidence])];if(event.summary)existing.summary=event.summary;}
  else combined.set(event.id,{...event,categories:[...event.categories],evidence:[...event.evidence]});
 }
 return [...combined.values()].sort((a,b)=>(b.at??'').localeCompare(a.at??''));
}
function renderChange(list:HTMLElement,change:HistoryChange,initial:boolean){
 const row=el('div'),term=el('dt',change.label),description=el('dd');
 const show=(value:string|null,prefix:string)=>{
  if(change.format==='url'&&value){try{const url=new URL(value);if(['http:','https:'].includes(url.protocol)){const a=el('a',prefix+change.label+' ↗');a.href=url.href;a.title=value;a.target='_blank';a.rel='noopener noreferrer';return a;}}catch{/* 无效的旧链接保持可读原文。 */}}
  return el('span',value==null?'未填写':change.format==='datetime'?businessDateTime(value):value);
 };
 if((!initial||change.before!=null)&&change.before!==change.after){description.append(show(change.before,'原'));const arrow=el('span','→');arrow.className='business-history-arrow';arrow.setAttribute('aria-label','更正为');description.append(arrow);}
 description.append(show(change.after,initial?'查看':'现'));row.append(term,description);list.append(row);
}
export function appendBusinessHistory(host:HTMLElement,events:InspectorHistoryEvent[],options:{state?:HistoryViewState;appendAction?:(event:InspectorHistoryEvent,host:HTMLElement)=>void}={}){
 if(!events.length){const empty=el('p','暂无业务历史');empty.className='schedule-history-status';host.append(empty);return;}
 const root=el('details');root.className='business-history-timeline';root.dataset.businessHistoryTimeline='';root.open=options.state?.open??true;
 const heading=el('summary');heading.append(el('span',`业务历史 (${events.length})`));const toggle=el('span');toggle.className='business-history-toggle';toggle.setAttribute('aria-hidden','true');toggle.append(el('span','展开'),el('span','收起'));heading.append(toggle);root.append(heading);
 const body=el('div');body.className='business-history-body';
 const filter=el('fieldset');filter.className='business-view-switch business-history-filters';filter.append(el('legend','历史类别'));
 // 阅读筛选不属于表单修改，不触发详情的未保存保护；事件内的理由表单照常冒泡。
 filter.addEventListener('input',event=>event.stopPropagation());
 const categoryOptions=[['all','全部'],...Object.entries(names).filter(([key])=>events.some(e=>e.categories.includes(key as InspectorHistoryCategory)))];filter.hidden=categoryOptions.length<3;
 let category=categoryOptions.some(([key])=>key===options.state?.category)?options.state!.category:'all',limit=options.state?.limit??10;
 const name='business-history-filter-'+(++sequence);
 for(const[key,label]of categoryOptions){const wrap=el('label'),input=el('input');input.type='radio';input.name=name;input.value=key;input.checked=key===category;const count=key==='all'?events.length:events.filter(e=>e.categories.includes(key as InspectorHistoryCategory)).length;wrap.append(input,el('span',`${label} (${count})`));input.addEventListener('change',()=>{category=key;limit=10;render();});filter.append(wrap);}
 const list=el('ol');list.className='business-history-events';
 const rows=events.map(event=>{
  const row=el('li');row.dataset.historyEvent=event.id;
  const header=el('header');header.append(el('strong',event.title));const tags=el('span');tags.className='business-history-tags';for(const c of event.categories)tags.append(el('span',names[c]));header.append(tags);row.append(header);
  const diff=el('dl');diff.className='business-history-changes';
  if(event.summary){const summary=el('p',event.summary);summary.className='business-history-summary';row.append(summary);}
  const primary=event.summary?[]:event.changes;
  for(const c of primary)renderChange(diff,c,event.initial??false);if(primary.length)row.append(diff);
  if(event.reason&&!event.summary){const reason=el('p',event.reason);reason.className='business-history-reason';row.append(reason);}
  const meta=el('p');meta.className='business-history-meta';if(event.at){const time=el('time',businessDateTime(event.at));time.dateTime=event.at;meta.append(time);}else meta.append(el('span','时间未记录'));if(event.actor)meta.append(el('span','· '+event.actor));row.append(meta);
  const secondary=event.summary?event.changes:event.initial?event.changes.filter(c=>!primary.includes(c)):[];
  if(secondary.length||event.evidence.length){const evidence=el('details');evidence.dataset.historyEvidence=event.id;evidence.open=options.state?.expanded.includes(event.id)??false;evidence.className='business-history-evidence';evidence.append(el('summary',event.initial?'初始信息':'详细依据'));const details=el('div');if(secondary.length){const dl=el('dl');dl.className='business-history-changes';for(const c of secondary)renderChange(dl,c,true);details.append(dl);}if(event.summary&&event.reason)details.append(el('p','原因：'+event.reason));for(const text of event.evidence)details.append(el('p',text));evidence.append(details);row.append(evidence);}
  options.appendAction?.(event,row);list.append(row);return {event,row};
 });
 const more=el('button','查看更多');more.type='button';more.className='business-history-more';more.addEventListener('click',()=>{limit+=10;render();});
 const render=()=>{let visible=0;for(const {event,row}of rows){const match=category==='all'||event.categories.includes(category as InspectorHistoryCategory);row.hidden=!match||visible++>=limit;}more.hidden=visible<=limit;root.dataset.category=category;root.dataset.limit=String(limit);};
 body.append(filter,list,more);root.append(body);host.append(root);render();
}
