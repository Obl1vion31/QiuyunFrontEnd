import {operationTypeLabels,type OperationType} from '../db/operation-types';
import {readBusiness} from './business-read';
import {getInspector} from './business-inspector';
import {cumulativeDays,reviewModeLabels,type ReviewMode} from '../db/non-promotion-nodes';
import {businessDateTime} from './business-date';
type Change={at:string;actor:string;before?:{dueOn?:string};after?:{dueOn?:string;action?:string};reason?:string};
type View={operationType:OperationType|null;reviewActive:boolean;activatedOn:string|null;defaults?:{mode:ReviewMode;day7:boolean;day15:boolean};plan:{mode:ReviewMode;day7:boolean;day15:boolean;revision:number;draftDueOn:string|null;history:Array<{at:string;actor:string;before?:{operationType?:OperationType};after?:{operationType?:OperationType}}>}|null;anchorScheduleId:string;publishedOn:string|null;isPromoted:boolean;nodes:Array<{id:string;dueOn:string;revision:number;cancelledAt:string|null;completed:boolean;history:Change[]}>};
type RecordView={id:string;actualPublishAt:string;isPromoted:boolean;contentName:string};
const input=(host:HTMLElement,name:string)=>host.querySelector<HTMLInputElement|HTMLSelectElement>(`[name="${name}"]`)!;
const el=<K extends keyof HTMLElementTagNameMap>(tag:K,text?:string)=>{const node=document.createElement(tag);if(text!=null)node.textContent=text;return node;};
function initialize(){
 const panel=document.querySelector<HTMLElement>('[data-review-plan-panel]'),publication=document.querySelector<HTMLFormElement>('#publication-form');
 if(!panel||!publication||panel.dataset.ready)return;panel.dataset.ready='true';
 const events=new AbortController();document.addEventListener('astro:before-swap',()=>events.abort(),{once:true});const listen=(name:string,handler:(event:Event)=>void)=>document.addEventListener(name,handler,{signal:events.signal});
 const inspector=panel.closest<HTMLElement>('[data-inspector]')!,form=panel.querySelector<HTMLFormElement>('[data-review-plan-form]')!,add=panel.querySelector<HTMLFormElement>('[data-review-node-add]')!,list=panel.querySelector<HTMLElement>('[data-review-node-list]')!;
 const pubFields=publication.querySelector<HTMLElement>('[data-review-plan-fields]')!;
 let current:RecordView|undefined,view:View|undefined,publicationRecordId='' ;
 const updateFields=(fields:HTMLElement,published:string|null)=>{
  const mode=input(fields,'reviewMode').value as ReviewMode,options=fields.querySelector<HTMLElement>('[data-review-plan-options]')!,date=input(fields,'reviewDueOn') as HTMLInputElement;
  const separateDates=fields.closest('[data-review-plan-form]')&&mode==='continuous';
  options.hidden=mode==='standard';fields.querySelector<HTMLElement>('[data-review-date-group]')!.hidden=!!separateDates;date.required=mode==='instant'&&!(fields as HTMLFieldSetElement).disabled;date.disabled=mode==='standard'||!!separateDates||(fields as HTMLFieldSetElement).disabled;
  if(published)date.min=published;
  const days=published&&date.value?cumulativeDays(published,date.value):null;
  fields.querySelector('[data-review-days]')!.textContent=days&&days>0?`含发布当天，共 ${days} 天`:'';
  fields.querySelector('[data-review-plan-help]')!.textContent=fields.dataset.operationSummary??(mode==='standard'?'沿用原帖的7天、15天复盘。':mode==='instant'?'指定一次截止日期，次日起录入累计数据。':'可按需要追加复盘日期；未安排日期不产生待办。');
 };
 const fill=(fields:HTMLElement,data:View,disabled=false)=>{
  const plan=data.defaults??data.plan;input(fields,'reviewMode').value=plan?.mode??'standard';input(fields,'expectedReviewRevision').value=String(data.plan?.revision??-1);
  (input(fields,'reviewDay7') as HTMLInputElement).checked=plan?.day7??true;(input(fields,'reviewDay15') as HTMLInputElement).checked=plan?.day15??true;
  input(fields,'reviewDueOn').value=data.plan?.draftDueOn||data.nodes.find(n=>!n.cancelledAt)?.dueOn||'';
  (fields as HTMLFieldSetElement).disabled=disabled;updateFields(fields,data.publishedOn);
 };
 const read=async(record:RecordView,target:HTMLElement)=>readBusiness(target,async context=>{const response=await fetch('/api/non-promotion-checkpoints?'+new URLSearchParams({scheduleId:record.id}),{signal:context.signal});const result=await response.json();if(!response.ok)throw new Error(result.message||'读取复盘计划失败');return result as View;});
 const render=(data:View)=>{
  view=data;panel.hidden=!current?.actualPublishAt;if(panel.hidden)return;
  const mode=data.plan?.mode??data.defaults?.mode??'standard',owner=data.anchorScheduleId;
  panel.querySelector('[data-review-plan-summary]')!.textContent=`${data.operationType?operationTypeLabels[data.operationType]:reviewModeLabels[mode]} · ${data.reviewActive?(data.activatedOn?'持续复盘自 '+data.activatedOn+' 启用':'已启用'):data.operationType==='promotion_then_continuous'?'推广中，持续复盘尚未启用':'推广日度复盘'} · 累计数据起点 ${data.publishedOn??'未记录'}`;
  form.action=`/api/operations-content/${owner}`;form.dataset.collaborationResource=`schedule:${owner}`;form.dataset.collaborationLabel=current!.contentName;
  (form.closest('details') as HTMLDetailsElement).hidden=!!data.operationType||!data.reviewActive;
  if(form.dataset.dirty!=='true')fill(form.querySelector('[data-review-plan-fields]')!,data);
  add.hidden=mode!=='continuous'||!data.reviewActive;add.dataset.publishedOn=data.publishedOn??'';add.dataset.collaborationResource=`schedule:${owner}`;add.dataset.collaborationLabel=current!.contentName;input(add,'scheduleId').value=owner;(input(add,'dueOn') as HTMLInputElement).min=data.activatedOn??data.publishedOn??'';
  if(list.querySelector('form[data-dirty=true]'))return;
  list.replaceChildren();
  for(const node of data.nodes.filter(n=>!n.cancelledAt)){
   const block=el('div');block.className='non-plan-node';block.append(el('p',`截至 ${node.dueOn} · ${node.completed?'已录入':'待录入'}`));
   if(node.history.length>1){const history=el('details');history.append(el('summary','日期调整记录'));for(const change of node.history.slice(1))history.append(el('p',`${businessDateTime(change.at)} · ${change.actor} · ${change.before?.dueOn} → ${change.after?.dueOn} · ${change.reason??''}`));block.append(history);}
   if(node.completed||!data.reviewActive){block.append(el('small',node.completed?'已有结果，截止日只读保留':'当前阶段暂缓复盘'));list.append(block);continue;}
   const details=el('details'),summary=el('summary','调整或取消');details.append(summary);
   const edit=el('form');edit.className='business-form';edit.dataset.reviewNodeForm='';edit.dataset.collaborationResource=`schedule:${owner}`;edit.dataset.collaborationLabel=current!.contentName;edit.dataset.businessOperation='schedule.edit';
   for(const [name,value]of Object.entries({scope:'schedule',scheduleId:owner,nodeId:node.id,expectedRevision:node.revision})){const field=el('input');field.type='hidden';field.name=name;field.value=String(value);edit.append(field);}
   const actionLabel=el('label','操作'),action=el('select');action.name='action';for(const [value,label]of [['reschedule','调整日期'],['cancel','取消这次复盘']]){const option=el('option',label);option.value=value;action.append(option);}actionLabel.append(action);edit.append(actionLabel);
   const dateLabel=el('label','截止日期'),date=el('input');date.type='date';date.name='dueOn';date.value=node.dueOn;date.min=data.activatedOn??data.publishedOn??'';date.required=true;const days=el('small');days.dataset.reviewNodeDays='';days.textContent=data.publishedOn?'含发布当天，共 '+cumulativeDays(data.publishedOn,node.dueOn)+' 天':'';dateLabel.append(date,days);edit.append(dateLabel);
   action.addEventListener('change',()=>{dateLabel.hidden=action.value==='cancel';date.disabled=action.value==='cancel';});
   const reasonLabel=el('label','原因'),reason=el('textarea');reason.name='reason';reason.rows=2;reason.maxLength=500;reason.required=true;reasonLabel.append(reason);edit.append(reasonLabel,el('output'));
   const save=el('button','保存调整');save.type='submit';save.className='business-action-secondary';edit.append(save);details.append(edit);block.append(details);list.append(block);
  }
  const types=data.plan?.history.filter(c=>c.after?.operationType)??[];if(types.length){const history=el('details');history.append(el('summary','运营类型记录'));for(const change of types)history.append(el('p',businessDateTime(change.at)+' · '+change.actor+' · '+(change.before?.operationType?operationTypeLabels[change.before.operationType]+' → ':'设置为 ')+operationTypeLabels[change.after!.operationType!]));list.append(history);}
  const cancelled=data.nodes.filter(n=>n.cancelledAt);if(cancelled.length){const history=el('details');history.append(el('summary',`已取消的复盘 (${cancelled.length})`));for(const node of cancelled){const change=node.history.at(-1);history.append(el('p',`截至 ${node.dueOn} · 已取消${change?' · '+businessDateTime(change.at)+' · '+change.actor+' · '+(change.reason??''):''}`));}list.append(history);}
 };
 listen('business:schedule-selected',async event=>{
  const record=(event as CustomEvent<RecordView>).detail;current=record;view=undefined;panel.hidden=true;(form.querySelector('[data-review-plan-fields]') as HTMLFieldSetElement).disabled=true;add.hidden=true;list.replaceChildren();
  if(!record.actualPublishAt)return;
  try{const data=await read(record,panel);if(data&&current?.id===record.id)render(data);}catch(error){if(current?.id===record.id){panel.hidden=false;panel.querySelector('[data-review-plan-summary]')!.textContent=error instanceof Error?error.message:'读取失败，请重试';}}
 });
 listen('business:review-date-saved',async event=>{if(current&&current.id===(event as CustomEvent).detail.scheduleId){const data=await read(current,panel);if(data)render(data);}});
 listen('business:publication-opened',async event=>{
  const record=(event as CustomEvent<RecordView>).detail,host=pubFields.parentElement!;publicationRecordId=record.id;delete pubFields.dataset.operationSummary;host.hidden=!!record.actualPublishAt;pubFields.dataset.loaded='false';(pubFields as HTMLFieldSetElement).disabled=true;
  if(host.hidden){pubFields.dataset.loaded='true';return;}
  try{const data=await read(record,host);if(!data||publicationRecordId!==record.id||!publication.closest('dialog')?.open)return;fill(pubFields,data,data.anchorScheduleId!==record.id);pubFields.dataset.loaded='true';pubFields.dataset.publishedOn=data.publishedOn??'';if(data.operationType){(pubFields as HTMLFieldSetElement).disabled=false;pubFields.querySelector('legend')!.textContent='运营类型';pubFields.querySelector<HTMLLabelElement>('label:has([name=reviewMode])')!.hidden=true;input(pubFields,'reviewMode').disabled=true;const summary=pubFields.querySelector<HTMLElement>('[data-review-plan-help]')!;summary.textContent=pubFields.dataset.operationSummary=operationTypeLabels[data.operationType]+(data.plan?.day7?' · 含7天复盘':'')+(data.plan?.day15?' · 含15天复盘':'');pubFields.insertBefore(summary,pubFields.querySelector('[data-review-plan-options]'));pubFields.querySelector<HTMLElement>('.non-plan-checks')!.hidden=true;for(const name of ['reviewDay7','reviewDay15'])input(pubFields,name).disabled=true;pubFields.querySelector<HTMLElement>('[data-review-plan-options]')!.hidden=data.operationType!=='non_promotion_instant';(input(pubFields,'reviewDueOn') as HTMLInputElement).required=data.operationType==='non_promotion_instant';}else{delete pubFields.dataset.operationSummary;pubFields.querySelector('legend')!.textContent='复盘方式';pubFields.querySelector<HTMLLabelElement>('label:has([name=reviewMode])')!.hidden=false;pubFields.querySelector<HTMLElement>('.non-plan-checks')!.hidden=false;}if(data.anchorScheduleId!==record.id)pubFields.querySelector('[data-review-plan-help]')!.textContent='沿用原帖复盘计划；在帖子详情中管理。';}
  catch(error){pubFields.querySelector('[data-review-plan-help]')!.textContent=error instanceof Error?error.message:'读取失败，请关闭后重试';}
 });
 listen('input',event=>{
  const control=event.target as HTMLInputElement,fields=control.closest<HTMLElement>('[data-review-plan-fields]');if(!fields)return;
  if(control.name==='reviewMode'){(input(fields,'reviewDay7') as HTMLInputElement).checked=control.value==='standard';(input(fields,'reviewDay15') as HTMLInputElement).checked=control.value==='standard';}
  const publicationDate=(publication.elements.namedItem('actualPublishDate') as HTMLInputElement)?.value;
  updateFields(fields,fields===pubFields?(pubFields.dataset.publishedOn||publicationDate):view?.publishedOn??null);
 });
 publication.addEventListener('input',()=>{if(!pubFields.parentElement!.hidden)updateFields(pubFields,pubFields.dataset.publishedOn||(publication.elements.namedItem('actualPublishDate') as HTMLInputElement).value);});
 publication.addEventListener('submit',event=>{if(!pubFields.parentElement!.hidden&&pubFields.dataset.loaded!=='true'){event.preventDefault();event.stopImmediatePropagation();publication.querySelector('[data-publication-message]')!.textContent='复盘计划尚未读取完成，请稍后重试。';}},{capture:true});
 panel.addEventListener('input',event=>{const control=event.target as HTMLInputElement,target=control.closest<HTMLFormElement>('form');if(target)target.dataset.dirty='true';if(control.name==='dueOn'&&view?.publishedOn){const helper=control.parentElement?.querySelector('[data-review-node-days]');if(helper)helper.textContent=control.value?'含发布当天，共 '+cumulativeDays(view.publishedOn,control.value)+' 天':'';}});
 panel.addEventListener('submit',async event=>{
  const target=event.target as HTMLFormElement;if(!target.matches('form'))return;event.preventDefault();if(!target.reportValidity())return;
  const output=target.querySelector('output')!,button=target.querySelector<HTMLButtonElement>('button[type=submit]')!;button.disabled=true;output.setAttribute('role','status');output.textContent='正在保存…';
  try{const response=await fetch(target===form?target.action:'/api/non-promotion-checkpoints',{method:target===form?'PATCH':'POST',body:new FormData(target)}),json=await response.json();if(!response.ok)throw new Error(json.message||'保存失败');target.dataset.dirty='false';
   if(!panel.querySelector('form[data-dirty=true]'))getInspector(inspector).setClean();
   output.textContent=response.status===202?'已提交管理员审核':'已保存';
   if(response.status!==202&&current){const data=await read(current,panel);if(data)render(data);}
  }catch(error){output.setAttribute('role','alert');output.textContent=(error instanceof Error?error.message:'连接失败')+'；当前输入已保留。';}finally{button.disabled=false;}
 });
 const selected=inspector.dataset.selectedId,records=document.querySelector('[data-schedule-records]');if(selected&&records){const record=JSON.parse(records.textContent||'[]').find((r:RecordView)=>r.id===selected);if(record)document.dispatchEvent(new CustomEvent('business:schedule-selected',{detail:record}));}
}
document.addEventListener('astro:page-load',initialize);if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initialize,{once:true});else initialize();
