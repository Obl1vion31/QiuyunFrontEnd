import MonthlyPlanSummary from './MonthlyPlanSummary';
import WeeklyCardDetails from './WeeklyCardDetails';
import {useEffect,useState,useRef,type CSSProperties} from 'react';
import type {MonthlyPlanDraft} from '../db/monthly-plans';
import type {MonthlyMeetingMaterial} from '../db/monthly-meeting';
import {businessDate,businessDateTime} from '../scripts/business-date';
import {monthWeeks,compactPlanItems,type PlanContent,type PlanGroup,type PlanItem} from '../db/monthly-plan-types';

type Step='quantity'|'weeks'|'confirmed';
type Batch={key:string;id?:string;content:PlanContent;canEdit:boolean;canQuantity:boolean;step:Step};
const closePopover=(node:HTMLElement)=>node.closest<HTMLElement>('[data-popover-panel]')?.hidePopover();
function PlanQuantity({name,value,max,disabled,onChange}:{name:string;value:number;max:number;disabled:boolean;onChange:(value:string)=>void}){
 const [input,setInput]=useState<string|null>(null);
 const change=(next:string)=>{if(next!==''&&(!/^\d+$/.test(next)||Number(next)>max))return;setInput(next);onChange(next);};
 return <div className="monthly-plan-quantity" data-plan-quantity role="group" aria-label={name+'待分配数量'} draggable={false} onDragStart={e=>{e.preventDefault();e.stopPropagation();}}>
  <button type="button" disabled={disabled||value===0} aria-label={'减少'+name+'待分配篇数'} title="减少待分配篇数" draggable={false} onClick={()=>{setInput(null);onChange(String(value-1));}}><svg aria-hidden="true" width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 8h10"/></svg></button>
  <input type="number" inputMode="numeric" min="0" max={max} step="1" aria-label={name+'待分配篇数'} value={input??value} disabled={disabled} onChange={e=>change(e.target.value)} onBlur={()=>setInput(null)}/>
  <button type="button" disabled={disabled||value>=max} aria-label={'增加'+name+'待分配篇数'} title="增加待分配篇数" draggable={false} onClick={()=>{setInput(null);onChange(String(value+1));}}><svg aria-hidden="true" width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 8h10M8 3v10"/></svg></button>
 </div>;
}
export default function MonthlyPlanEditor({draft,material,editable,onChange,onConfirm}:{draft:MonthlyPlanDraft;material:MonthlyMeetingMaterial;editable:boolean;onChange:(next:MonthlyPlanDraft)=>void;onConfirm?:(next:MonthlyPlanDraft)=>Promise<boolean>}){
 const [locked,setLocked]=useState(!!material.plan?.lockedAt),[finalized,setFinalized]=useState(!!material.plan?.firstFinalizedAt);
 const [effectiveBatches,setEffectiveBatches]=useState(material.plan?.effectiveBatchIds??[]),[execution,setExecution]=useState(material.executionPlan?.items);
 const [revision,setRevision]=useState(material.plan?.revision??draft.expectedRevision),[canonicalAdditions,setCanonicalAdditions]=useState<MonthlyPlanDraft['additions']>([]);
 const [message,setMessage]=useState(''),[busy,setBusy]=useState(false),[holding,setHolding]=useState<Record<string,Step>>({});
 const [drag,setDrag]=useState<string|null>(null),[dragTarget,setDragTarget]=useState<string|null>(null),[annualSource,setAnnualSource]=useState('');
 const taxonomy=material.operations.taxonomy,host=useRef<HTMLElement>(null);
 const [temporary,setTemporary]=useState({name:'',subjectId:taxonomy.subjects[0]?.id??'',categoryId:'',reason:''});
 useEffect(()=>{
  if(!editable)return;
  const controller=new AbortController();
  void(async()=>{
   const {readBusiness}=await import('../scripts/business-read');
   const result=await readBusiness(host.current!,async read=>{
    const response=await fetch('/api/monthly-plans?month='+material.executionMonth,{signal:read.signal}),result=await response.json();
    if(!response.ok)throw new Error(result.message);return result;
   },{signal:controller.signal});
   if(result?.plan){setExecution(result.plan.items);setLocked(!!result.plan.lockedAt);setFinalized(!!result.plan.firstFinalizedAt);setCanonicalAdditions(result.plan.additions);setEffectiveBatches(result.plan.additions.map((b:{id:string})=>b.id));setRevision(result.plan.revision);}
  })().catch(e=>setMessage('读取计划状态失败：'+e.message+'，输入已保留。'));
  return()=>controller.abort();
 },[editable,draft.id]);
 const additions=editable?[...canonicalAdditions,...draft.additions.filter(b=>!canonicalAdditions.some(c=>c.id===b.id))]:draft.additions;
 const current=()=>({...draft,additions,expectedRevision:revision});
 const update=(next:MonthlyPlanDraft)=>{setMessage('');onChange({...next,expectedRevision:revision});};
 const phase=(content:PlanContent,key:string):Step=>holding[key]??draft.editorSteps?.[key]??(content.groups.some(g=>g.quantity==null)?'quantity':content.items.some(i=>!i.week)?'weeks':'confirmed');
 const batches:Batch[]=[{key:'original',id:undefined as string|undefined,content:draft.content},...additions.map(b=>({key:b.id,id:b.id,content:b.content}))].map(b=>{
  const canEdit=editable&&(!b.id||!effectiveBatches.includes(b.id))&&(!locked||!!b.id);
  return {...b,canEdit,canQuantity:canEdit&&(!finalized||!!b.id),step:phase(b.content,b.key)};
 });
 const active=batches.filter(b=>b.canEdit),step:Step=active.some(b=>b.step==='quantity')?'quantity':active.some(b=>b.step==='weeks')?'weeks':'confirmed';
 const separate=new Set(execution?.filter(item=>item.submittedAt||item.pending||item.schedule||item.history.length).map(item=>item.id));
 const combined:PlanContent={groups:batches.flatMap(b=>b.content.groups),items:batches.flatMap(b=>b.content.items)};
 const weeks=monthWeeks(material.executionMonth),used=new Set(combined.items.flatMap(i=>i.scheduleId?[i.scheduleId]:[]));
 const apply=(next:MonthlyPlanDraft,b:Batch,content:PlanContent):MonthlyPlanDraft=>b.id?{...next,additions:next.additions.map(row=>row.id===b.id?{...row,content}:row)}:{...next,content};
 const updateContent=(b:Batch,content:PlanContent,nextStep:Step=b.step)=>update({...apply(current(),b,content),editorSteps:{...draft.editorSteps,[b.key]:nextStep}});
 const closePoolDetails=()=>host.current?.querySelectorAll<HTMLElement>('.monthly-plan-pool [data-popover-panel]:popover-open').forEach(panel=>panel.hidePopover());
 async function confirmStep(next:Step){
  const targets=active.filter(b=>next==='weeks'?b.step==='quantity':b.step==='weeks');
  closePoolDetails();
  let value=current();const oldSteps=Object.fromEntries(targets.map(b=>[b.key,b.step]));
  for(const b of targets)value=apply(value,b,next==='weeks'?{...b.content,groups:b.content.groups.map(g=>({...g,quantity:g.quantity??0}))}:b.content);
  value={...value,editorSteps:{...value.editorSteps,...Object.fromEntries(targets.map(b=>[b.key,next]))}};
  setHolding(oldSteps);setBusy(true);setMessage('');
  try{
   if(!onConfirm||!await onConfirm(value)){onChange({...value,editorSteps:{...value.editorSteps,...oldSteps}});setMessage('安排尚未确认，输入及分配已保留。请核对保存反馈后重试。');return;}
   setHolding({});
   requestAnimationFrame(()=>{if(next==='confirmed'){host.current?.querySelector<HTMLElement>('.monthly-plan-step-actions button')?.focus({preventScroll:true});return;}const scroll=host.current?.querySelector<HTMLElement>('.monthly-pool-scroll');if(scroll)scroll.scrollTop=0;host.current?.querySelector<HTMLElement>('.monthly-plan-pool [data-plan-source][draggable=true] [data-popover-trigger]')?.focus({preventScroll:true});});
  }catch(e){onChange({...value,editorSteps:{...value.editorSteps,...oldSteps}});setMessage((e as Error).message||'保存失败，当前输入已保留。');}
  finally{setBusy(false);}
 }
 function quantity(b:Batch,g:PlanGroup,value:string){
  if(!b.canQuantity||busy)return;
  const n=Number(value);if(!Number.isInteger(n)||n<0||n>1000)return;
  const old=b.content.items.filter(i=>i.groupId===g.id),free=old.filter(i=>i.kind==='new'&&!i.scheduleId&&!i.week),kept=old.filter(i=>!free.includes(i));
  if(kept.length+n>1000){setMessage('该来源计划总量不能超过1000篇。');return;}
  const items=free.slice(0,n);
  while(items.length<n)items.push({id:crypto.randomUUID(),groupId:g.id,week:null,kind:'new',scheduleId:null});
  const removed=new Set(free.slice(n).map(i=>i.id));
  updateContent(b,{...b.content,groups:b.content.groups.map(row=>row.id===g.id?{...row,quantity:kept.length+n}:row),items:[...b.content.items.filter(i=>!removed.has(i.id)),...items.slice(free.length)]},b.step==='confirmed'?'weeks':b.step);
 }
 function include(b:Batch,g:PlanGroup,scheduleId:string){
  if(!b.canQuantity||busy)return;
  const candidate=material.candidates.find(c=>c.id===scheduleId);if(!candidate)return;
  const selected=b.content.items.find(i=>i.scheduleId===scheduleId);
  if(selected){
   if(selected.week||execution?.some(i=>i.id===selected.id&&i.submittedAt)){setMessage('已分周或已提交的关联须先核对详情，不能直接移除。');return;}
   updateContent(b,{...b.content,items:b.content.items.map(i=>i.id===selected.id?{...i,scheduleId:null,kind:'new'}:i)});return;
  }
  if(used.has(scheduleId)){setMessage('该帖子已纳入月计划。');return;}
  const slot=b.content.items.find(i=>i.groupId===g.id&&!i.scheduleId&&!i.week&&i.kind==='new');
  if(!slot){setMessage('本月已有帖子占用新做名额，请先填写足够的新做数量。');return;}
  updateContent(b,{...b.content,items:b.content.items.map(i=>i.id===slot.id?{...i,scheduleId,kind:'existing'}:i)});
 }
 function distribute(b:Batch,item:PlanItem,week:number|null){
  if(!b.canEdit||step==='quantity'||b.step==='quantity'||busy)return;
  updateContent(b,{...b.content,items:b.content.items.map(i=>i.id===item.id?{...i,week}:i)},'weeks');
 }
 const selectedCarries=batches.flatMap(batch=>batch.content.items.filter(item=>item.kind==='carry'&&item.scheduleId).map(item=>({batch,item,group:batch.content.groups.find(g=>g.id===item.groupId)!})));
 const carryCandidates=new Map(material.candidates.filter(c=>c.kind==='carry'&&(!used.has(c.id)||selectedCarries.some(row=>row.item.scheduleId===c.id))).map(c=>[c.id,{...c,versionNumber:c.versionNumber as number|null}]));
 for(const row of selectedCarries){const id=row.item.scheduleId!,schedule=execution?.find(i=>i.id===row.item.id)?.schedule;if(!carryCandidates.has(id)&&schedule&&!schedule.actualAt)carryCandidates.set(id,{...schedule,subjectId:row.group.subjectId,categoryId:row.group.categoryId,versionNumber:material.candidates.find(c=>c.id===id)?.versionNumber??null,kind:'carry'});}
 const carryRows=[...carryCandidates.values()].sort((a,b)=>a.plannedAt.localeCompare(b.plannedAt)||a.id.localeCompare(b.id));
 function toggleCarry(id:string){
  if(busy)return;
  const selected=selectedCarries.find(row=>row.item.scheduleId===id);
  if(selected){
   const {batch,item,group}=selected;if(!batch.canQuantity)return;
   if(item.week||execution?.some(i=>i.id===item.id&&i.submittedAt)){setMessage('已分周或已提交的遗留须先移回并核对原记录。');return;}
   const remaining=batch.content.items.filter(i=>i.id!==item.id),independent=group.id.startsWith('carry:')&&!remaining.some(i=>i.groupId===group.id);
   const content={groups:independent?batch.content.groups.filter(g=>g.id!==group.id):batch.content.groups.map(g=>g.id===group.id?{...g,quantity:(g.quantity??0)-1}:g),items:remaining};
   let value=apply(current(),batch,content);if(batch.id&&!content.groups.length)value={...value,additions:value.additions.filter(b=>b.id!==batch.id)};
   update(value);return;
  }
  const candidate=carryCandidates.get(id);if(!candidate||!candidate.categoryId||used.has(id))return;
  const reason='上月未登记，纳入本月计划',group:PlanGroup={id:'carry:'+crypto.randomUUID(),annualPlanId:null,annualVersion:null,name:candidate.name,subjectId:candidate.subjectId,categoryId:candidate.categoryId,quantity:1,note:'',reason};
  const item:PlanItem={id:crypto.randomUUID(),groupId:group.id,week:null,kind:'carry',scheduleId:id};
  if(finalized){const batchId=crypto.randomUUID();update({...current(),editorSteps:{...draft.editorSteps,[batchId]:'quantity'},additions:[...additions,{id:batchId,reason,content:{groups:[group],items:[item]}}]});}
  else update({...current(),content:{groups:[...draft.content.groups,group],items:[...draft.content.items,item]},editorSteps:{...draft.editorSteps,original:'quantity'}});
 }
 function drop(id:string,week:number|null){
  const b=batches.find(b=>b.content.items.some(i=>i.id===id)),item=b?.content.items.find(i=>i.id===id);
  if(b&&item)distribute(b,item,week);setDrag(null);setDragTarget(null);
 }
 async function resetWeeks(){
  const targets=active.filter(b=>b.step==='confirmed'&&b.content.items.length);
  if(!await window.businessConfirm('将清空可修改计划的Week分配；数量、补帖、已有排期和审批记录保留。',{title:'重新排期',confirmLabel:'重新排期',cancelLabel:'保留当前安排'}))return;
  let value=current();for(const b of targets)value=apply(value,b,{...b.content,items:b.content.items.map(i=>({...i,week:null}))});
  setHolding({});update({...value,editorSteps:{...value.editorSteps,...Object.fromEntries(targets.map(b=>[b.key,'weeks' as Step]))}});
 }
 function addGroup(button:HTMLElement){
  const original=draft.content.groups.find(g=>g.id===annualSource);
  if((!original&&(!temporary.name.trim()||!temporary.categoryId))||!temporary.reason.trim()){setMessage('请选择内容并填写增加原因。');return;}
  const group:PlanGroup=original?{...original,id:crypto.randomUUID(),quantity:null,reason:temporary.reason.trim()}:{id:crypto.randomUUID(),annualPlanId:null,annualVersion:null,name:temporary.name.trim(),subjectId:temporary.subjectId,categoryId:temporary.categoryId,note:'',reason:temporary.reason.trim(),quantity:null};
  let value=current();
  if(finalized){const id=crypto.randomUUID();value={...value,editorSteps:{...value.editorSteps,[id]:'quantity'},additions:[...value.additions,{id,reason:temporary.reason.trim(),content:{groups:[group],items:[]}}]};}
  else value={...value,content:{...value.content,groups:[...value.content.groups,group]},editorSteps:{...value.editorSteps,original:'quantity'}};
  closePopover(button);setHolding({});update(value);setAnnualSource('');setTemporary({...temporary,name:'',reason:''});
 }
 function evidence(b:Batch,g:PlanGroup,item?:PlanItem){
  const known=item&&execution?.find(p=>p.id===item.id),schedule=item&&(known?.schedule??material.candidates.find(c=>c.id===item.scheduleId));
  return <div className="monthly-chip-evidence">{item&&<p>{item.kind==='carry'?'上月未登记':item.kind==='existing'?'本月已有排期':'本月新做'}{b.id?' · 追加':''}</p>}{schedule&&<><p>应发 {businessDateTime(schedule.plannedAt)}</p><p>{schedule.actualAt?'已登记 '+businessDateTime(schedule.actualAt):'尚未登记'}</p></>}{item?.scheduleId&&<a href={'/business/operations-schedule?display=ledger&row='+item.scheduleId} target="_blank" rel="noreferrer">原排期 ↗</a>}{known?.pending&&<p>已提交待审</p>}{known?.status==='rejected'&&<p>驳回待处理</p>}{known?.deadline&&<p>落实截止 {businessDateTime(known.deadline)}</p>}{g.annualPlanId&&<a href={'/business/annual-plan?year='+material.executionMonth.slice(0,4)+'&row='+g.annualPlanId} target="_blank" rel="noreferrer">年度来源 V{g.annualVersion} ↗</a>}{(g.reason||g.note)&&<p>{g.reason||g.note}</p>}</div>;
 }
 function quantityInput(b:Batch,g:PlanGroup){
  const items=b.content.items.filter(i=>i.groupId===g.id),available=items.filter(i=>i.kind==='new'&&!i.scheduleId&&!i.week).length;
  return <PlanQuantity name={g.name} value={available} max={1000-(items.length-available)} disabled={!b.canQuantity||busy} onChange={value=>quantity(b,g,value)}/>;
 }
 function sourceInfo(b:Batch,g:PlanGroup){
  const items=b.content.items.filter(i=>i.groupId===g.id),candidates=material.candidates.filter(c=>c.kind==='existing'&&c.subjectId===g.subjectId&&c.categoryId===g.categoryId&&(!used.has(c.id)||items.some(i=>i.scheduleId===c.id)));
  return <>{evidence(b,g)}{b.canQuantity&&<>{candidates.length>0&&<fieldset className="monthly-candidate-picker"><legend>本月已有排期</legend>{candidates.map(c=><label key={c.id}><input type="checkbox" disabled={busy} checked={items.some(i=>i.scheduleId===c.id)} onChange={()=>include(b,g,c.id)}/><span>{c.name}<small>V{c.versionNumber} · {businessDate(c.plannedAt)} · 占新做名额</small></span></label>)}</fieldset>}</>}</>;
 }
 function choices(b:Batch,item?:PlanItem){
  if(!item||!b.canEdit||b.step==='quantity'||step==='quantity')return null;
  const move=(button:HTMLElement,week:number|null)=>{closePopover(button);distribute(b,item,week);requestAnimationFrame(()=>host.current?.querySelector<HTMLElement>(week?`[data-plan-item="${item.id}"] [data-popover-trigger]`:`[data-plan-source="${item.scheduleId??item.groupId}"] [data-popover-trigger]`)?.focus({preventScroll:true}));};
  return <div className="monthly-chip-week-choices" aria-label="选择周次">{weeks.map(w=><button type="button" key={w.week} data-plan-week-choice={w.week} disabled={busy||item.week===w.week} onClick={e=>move(e.currentTarget,w.week)}>Week {w.week}</button>)}{item.week&&<button type="button" disabled={busy} onClick={e=>move(e.currentTarget,null)}>移回待分配</button>}</div>;
 }
 function focusPool(g:PlanGroup,item:PlanItem){requestAnimationFrame(()=>{(host.current?.querySelector<HTMLElement>(`[data-plan-source="${item.scheduleId??g.id}"] [data-popover-trigger]`)??host.current?.querySelector<HTMLElement>('.monthly-plan-pool [data-popover-trigger]'))?.focus({preventScroll:true});});}
 function card(b:Batch,g:PlanGroup,items:PlanItem[],pool=false){
  const left=items.filter(i=>!i.week),item=pool?left[0]:items[0],bound=items[0]?.scheduleId;
  const known=bound&&(execution?.find(p=>p.id===items[0].id)?.schedule??material.candidates.find(c=>c.id===bound));
  const name=known?known.name:g.name,carry=items[0]?.kind==='carry',text=(carry?'遗留 ':'新 ')+name,canDrag=!!item&&b.canEdit&&b.step!=='quantity'&&step!=='quantity'&&!busy;
  return <div className={'monthly-plan-chip'+(pool?' monthly-pool-chip':'')} key={pool?(bound??g.id):item!.id} data-plan-count={pool?left.length:items.length} data-plan-item={pool?undefined:item!.id} data-plan-source={pool?(bound??g.id):undefined} data-plan-kind={items[0]?.kind??'new'} data-exhausted={pool&&!left.length||undefined} draggable={canDrag}
   onDragStart={e=>{if(!canDrag||(e.target as Element).closest('[data-plan-quantity],[data-plan-return]')){e.preventDefault();return;}setDrag(item!.id);e.dataTransfer.setData('text/plain',item!.id);e.dataTransfer.effectAllowed='move';const nameNode=e.currentTarget.querySelector<HTMLElement>('.weekly-detail-trigger>span')!;e.dataTransfer.setDragImage(nameNode,Math.min(60,nameNode.clientWidth/2),nameNode.clientHeight/2);}} onDragEnd={()=>{setDrag(null);setDragTarget(null);}}>
   <WeeklyCardDetails boundary={pool?'.monthly-plan-pool':'.monthly-week'} label={pool?text+'，剩余'+left.length+'篇':text+'，Week '+item!.week} triggerContent={<><span className="monthly-chip-name"><span className="monthly-plan-kind" data-kind={carry?'carry':'new'}>{carry?'遗留':'新'}</span><span className="monthly-chip-title">{name}</span></span>{((pool&&bound)||!pool&&items.length>1)&&<b>×{pool?left.length:items.length}</b>}</>}>
    <strong>{text}</strong>{choices(b,item)}{bound?evidence(b,g,items[0]):pool?sourceInfo(b,g):evidence(b,g,items[0])}
   </WeeklyCardDetails>
   {pool&&!bound&&quantityInput(b,g)}
   {!pool&&item&&b.canEdit&&step!=='quantity'&&<button type="button" className="monthly-chip-return" data-plan-return aria-label={'移回1篇'+name+'到待分配'} title="移回待分配" disabled={busy} draggable={false} onClick={()=>{distribute(b,item,null);if(items.length>1)requestAnimationFrame(()=>host.current?.querySelector<HTMLElement>(`[data-plan-item="${items[1].id}"] [data-plan-return]`)?.focus({preventScroll:true}));else focusPool(g,item);}}><svg aria-hidden="true" width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="m3 3 10 10M13 3 3 13"/></svg></button>}
   {pool&&carry&&<WeeklyCardDetails variant="info" boundary=".monthly-plan-pool" label={'查看'+name+'遗留资料'}>{evidence(b,g,items[0])}</WeeklyCardDetails>}
  </div>;
 }
 const remaining=active.reduce((n,b)=>n+b.content.items.filter(i=>!i.week).length,0);
 const visibleGroup=(g:PlanGroup)=>!g.id.startsWith('carry:');
 const subjects=[...new Set(combined.groups.filter(visibleGroup).map(g=>g.subjectId))];
 return <section className="monthly-section monthly-plan-compact" ref={host} data-monthly-plan-editor><header><div className="monthly-plan-heading"><h2>{material.executionMonth} 执行月计划</h2>{locked&&editable&&<span className="monthly-status">原计划已锁定</span>}</div></header>
  {!editable?<MonthlyPlanSummary cards month={material.executionMonth} content={combined} execution={material.executionPlan?.items} progressKnown={'executionPlan' in material} candidates={material.candidates}/>:<div className="monthly-plan-workflow" data-plan-workflow="original" data-plan-step={step}>
   <div className="monthly-planner" style={{'--monthly-week-count':weeks.length} as CSSProperties}><div className="monthly-plan-board">{weeks.map(w=><section className="monthly-week" key={w.week} data-week={w.week} data-drop-target={dragTarget===String(w.week)||undefined}
    onDragEnter={()=>{if(step!=='quantity'&&drag)setDragTarget(String(w.week));}} onDragLeave={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node))setDragTarget(null);}} onDragOver={e=>{if(step!=='quantity'&&drag)e.preventDefault();}} onDrop={e=>{e.preventDefault();drop(drag??e.dataTransfer.getData('text/plain'),w.week);}}>
    <header><h3>Week {w.week}</h3><span>{w.from.slice(5)} 至 {w.through.slice(5)}</span><b>{combined.items.filter(i=>i.week===w.week).length}篇</b></header>
    {combined.items.some(i=>i.week===w.week)&&<div className="monthly-week-items">{batches.flatMap(b=>compactPlanItems(b.content.items.filter(i=>i.week===w.week),separate).map(items=>card(b,b.content.groups.find(g=>g.id===items[0].groupId)!,items)))}</div>}
   </section>)}</div>
   <div className="monthly-pool-shell"><aside className="monthly-plan-pool" id={"monthly-plan-pool-"+draft.id} aria-label="待分配来源" data-drop-target={dragTarget==='pool'||undefined}
    onDragEnter={()=>{if(step!=='quantity'&&drag)setDragTarget('pool');}} onDragLeave={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node))setDragTarget(null);}} onDragOver={e=>{if(step!=='quantity'&&drag)e.preventDefault();}} onDrop={e=>{e.preventDefault();drop(drag??e.dataTransfer.getData('text/plain'),null);}}>
    <header><h3>{step==='quantity'?'计划数量':'待分配'}</h3><span className="monthly-status">{step==='quantity'?`共 ${combined.items.length} 篇`:`剩余 ${remaining} 篇`}</span></header>
    <div className="monthly-pool-scroll" data-popover-scroll-boundary>
    {step==='quantity'&&carryRows.length>0&&<section className="monthly-carry-choices"><h4>未登记</h4>{carryRows.map(candidate=>{const selected=selectedCarries.find(row=>row.item.scheduleId===candidate.id);const invalid=!candidate.categoryId||!taxonomy.subjectCategoryMappings.some(m=>m.subjectId===candidate.subjectId&&m.categoryId===candidate.categoryId);return <div className="monthly-carry-option" key={candidate.id} data-carry-candidate={candidate.id}><label><input type="checkbox" aria-label={'纳入遗留 '+candidate.name} checked={!!selected} disabled={busy||invalid||!!selected&&(!selected.batch.canQuantity||!!selected.item.week||!!execution?.some(i=>i.id===selected.item.id&&i.submittedAt))} onChange={()=>toggleCarry(candidate.id)}/><span className="monthly-plan-kind" data-kind="carry">遗留</span><span>{candidate.name}</span></label><WeeklyCardDetails variant="info" boundary=".monthly-plan-pool" label={'查看'+candidate.name+'遗留资料'}><strong>{candidate.name}</strong>{candidate.versionNumber!=null&&<p>V{candidate.versionNumber}</p>}<p>原应发 {businessDateTime(candidate.plannedAt)}</p><a href={'/business/operations-schedule?display=ledger&row='+candidate.id} target="_blank" rel="noreferrer">原排期 ↗</a>{invalid&&<p>请先在原排期补全学科与分类。</p>}</WeeklyCardDetails></div>;})}</section>}
    {step!=='quantity'&&selectedCarries.length>0&&<div className="monthly-pool-carries">{selectedCarries.map(({batch,item,group})=>card(batch,group,[item],true))}</div>}
    {subjects.map(subject=><div className="monthly-pool-subject" key={subject}><h4>{taxonomy.subjects.find(s=>s.id===subject)?.name??subject}</h4>{batches.flatMap(b=>b.content.groups.filter(g=>g.subjectId===subject&&visibleGroup(g)).map(g=>{
     const items=b.content.items.filter(i=>i.groupId===g.id&&i.kind!=='carry'),free=items.filter(i=>!i.scheduleId),bound=items.filter(i=>!!i.scheduleId);
     return <div className="monthly-source-card" data-source-group={g.id} data-source-batch={b.key} key={g.id}>{card(b,g,free,true)}{bound.map(i=>card(b,g,[i],true))}</div>;
    }))}</div>)}
    </div><div className="monthly-plan-add"><WeeklyCardDetails boundary=".monthly-plan-pool" label="新增月计划" triggerContent={<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 4v16M4 12h16"/></svg>}>
     <div className="monthly-temporary"><strong>新增月计划</strong>{draft.content.groups.some(g=>g.annualPlanId)&&<label>来源<select aria-label="来源" value={annualSource} onChange={e=>setAnnualSource(e.target.value)}><option value="">年度规划外内容</option>{draft.content.groups.filter(g=>g.annualPlanId).map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select></label>}{!annualSource&&<><label>内容名称<input aria-label="内容名称" value={temporary.name} onChange={e=>setTemporary({...temporary,name:e.target.value})}/></label><label>学科<select aria-label="学科" value={temporary.subjectId} onChange={e=>setTemporary({...temporary,subjectId:e.target.value,categoryId:''})}>{taxonomy.subjects.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label><label>帖子分类<select aria-label="帖子分类" value={temporary.categoryId} onChange={e=>setTemporary({...temporary,categoryId:e.target.value})}><option value="">请选择</option>{taxonomy.postCategories.filter(c=>taxonomy.subjectCategoryMappings.some(m=>m.subjectId===temporary.subjectId&&m.categoryId===c.id)).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label></>}<label>原因<textarea aria-label="原因" value={temporary.reason} onChange={e=>setTemporary({...temporary,reason:e.target.value})}/></label><button type="button" disabled={busy} onClick={e=>addGroup(e.currentTarget)}>添加内容</button></div>
    </WeeklyCardDetails></div>
   </aside></div></div>
   <div className="monthly-plan-step-actions">{step==='quantity'?<button type="button" className="business-action-primary" disabled={busy} onClick={()=>void confirmStep('weeks')}>{busy?'正在保存…':'保存数量安排'}</button>:step==='weeks'?<button type="button" className="business-action-primary" disabled={busy} onClick={()=>void confirmStep('confirmed')}>{busy?'正在保存…':remaining?'暂时确认安排':'确认安排'}</button>:active.some(b=>b.content.items.length>0)&&<button type="button" disabled={busy} onClick={()=>void resetWeeks()}>重新排期</button>}</div>
  </div>}
  {message&&<p role="alert" className="monthly-plan-alert">{message}</p>}
 </section>;
}
