import MonthlyPlanSummary from './MonthlyPlanSummary';
import WeeklyCardDetails from './WeeklyCardDetails';
import {useEffect,useState,useRef} from 'react';
import type {MonthlyPlanDraft} from '../db/monthly-plans';
import type {MonthlyMeetingMaterial} from '../db/monthly-meeting';
import {businessDate,businessDateTime} from '../scripts/business-date';
import {monthWeeks,type PlanContent,type PlanGroup,type PlanItem} from '../db/monthly-plan-types';

type Step='quantity'|'weeks'|'confirmed';
type Batch={key:string;id?:string;content:PlanContent;canEdit:boolean;canQuantity:boolean;step:Step};
const closePopover=(node:HTMLElement)=>node.closest<HTMLElement>('[data-popover-panel]')?.hidePopover();
export default function MonthlyPlanEditor({draft,material,editable,onChange,onConfirm}:{draft:MonthlyPlanDraft;material:MonthlyMeetingMaterial;editable:boolean;onChange:(next:MonthlyPlanDraft)=>void;onConfirm?:(next:MonthlyPlanDraft)=>Promise<boolean>}){
 const [locked,setLocked]=useState(!!material.plan?.lockedAt),[finalized,setFinalized]=useState(!!material.plan?.firstFinalizedAt);
 const [effectiveBatches,setEffectiveBatches]=useState(material.plan?.effectiveBatchIds??[]),[execution,setExecution]=useState(material.executionPlan?.items);
 const [revision,setRevision]=useState(material.plan?.revision??draft.expectedRevision),[canonicalAdditions,setCanonicalAdditions]=useState<MonthlyPlanDraft['additions']>([]);
 const [message,setMessage]=useState(''),[busy,setBusy]=useState(false),[holding,setHolding]=useState<Record<string,Step>>({});
 const [drag,setDrag]=useState<string|null>(null),[dragTarget,setDragTarget]=useState<string|null>(null),[annualSource,setAnnualSource]=useState('');
 const [quantityGroups,setQuantityGroups]=useState(()=>new Set([draft.content,...draft.additions.map(b=>b.content)].flatMap(c=>c.groups.filter(g=>g.quantity==null||!c.items.some(i=>i.groupId===g.id&&i.week)).map(g=>g.id))));
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
 const combined:PlanContent={groups:batches.flatMap(b=>b.content.groups),items:batches.flatMap(b=>b.content.items)};
 const weeks=monthWeeks(material.executionMonth),used=new Set(combined.items.flatMap(i=>i.scheduleId?[i.scheduleId]:[]));
 const apply=(next:MonthlyPlanDraft,b:Batch,content:PlanContent):MonthlyPlanDraft=>b.id?{...next,additions:next.additions.map(row=>row.id===b.id?{...row,content}:row)}:{...next,content};
 const updateContent=(b:Batch,content:PlanContent)=>update({...apply(current(),b,content),editorSteps:{...draft.editorSteps,[b.key]:b.step}});
 async function confirmStep(next:Step){
  const targets=active.filter(b=>next==='weeks'?b.step==='quantity':b.step==='weeks');
  if(next==='confirmed'&&targets.some(b=>b.content.items.some(i=>!i.week))){setMessage('请先分配完右侧的全部内容。');return;}
  let value=current();const oldSteps=Object.fromEntries(targets.map(b=>[b.key,b.step]));
  for(const b of targets)value=apply(value,b,next==='weeks'?{...b.content,groups:b.content.groups.map(g=>({...g,quantity:g.quantity??0}))}:b.content);
  value={...value,editorSteps:{...value.editorSteps,...Object.fromEntries(targets.map(b=>[b.key,next]))}};
  setHolding(oldSteps);setBusy(true);setMessage('');
  try{
   if(!onConfirm||!await onConfirm(value)){onChange({...value,editorSteps:{...value.editorSteps,...oldSteps}});setMessage('安排尚未确认，输入及分配已保留。请核对保存反馈后重试。');return;}
   setHolding({});if(next==='weeks')setQuantityGroups(new Set());requestAnimationFrame(()=>host.current?.querySelector<HTMLElement>('.monthly-plan-pool :is(input,button:not(:disabled))')?.focus({preventScroll:true}));
  }catch(e){onChange({...value,editorSteps:{...value.editorSteps,...oldSteps}});setMessage((e as Error).message||'保存失败，当前输入已保留。');}
  finally{setBusy(false);}
 }
 function quantity(b:Batch,g:PlanGroup,value:string){
  if(!b.canQuantity||busy)return;
  const n=value===''?null:Number(value);if(n!==null&&(!Number.isInteger(n)||n<0||n>1000))return;
  const old=b.content.items.filter(i=>i.groupId===g.id&&i.kind!=='carry'),kept=old.filter(i=>i.scheduleId||i.week);
  if((n??0)<kept.length){setMessage('数量不能少于已关联或已分周的名额，请先移回并核对关联记录。');return;}
  const items=[...kept,...old.filter(i=>!kept.includes(i))].slice(0,n??0);
  while(items.length<(n??0))items.push({id:crypto.randomUUID(),groupId:g.id,week:null,kind:'new',scheduleId:null});
  const carries=b.content.items.filter(i=>i.groupId===g.id&&i.kind==='carry');
  updateContent(b,{...b.content,groups:b.content.groups.map(row=>row.id===g.id?{...row,quantity:n==null&&!carries.length?null:(n??0)+carries.length}:row),items:[...b.content.items.filter(i=>i.groupId!==g.id),...carries,...items]});
 }
 function include(b:Batch,g:PlanGroup,scheduleId:string){
  if(!b.canQuantity||busy)return;
  const candidate=material.candidates.find(c=>c.id===scheduleId);if(!candidate)return;
  const selected=b.content.items.find(i=>i.scheduleId===scheduleId);
  if(selected){
   if(selected.week||execution?.some(i=>i.id===selected.id&&i.submittedAt)){setMessage('已分周或已提交的关联须先核对详情，不能直接移除。');return;}
   updateContent(b,{...b.content,groups:b.content.groups.map(row=>row.id===g.id&&selected.kind==='carry'?{...row,quantity:(row.quantity??0)-1}:row),items:selected.kind==='carry'?b.content.items.filter(i=>i.id!==selected.id):b.content.items.map(i=>i.id===selected.id?{...i,scheduleId:null,kind:'new'}:i)});return;
  }
  if(used.has(scheduleId)){setMessage('该帖子已纳入月计划。');return;}
  if(candidate.kind==='carry'){
   updateContent(b,{...b.content,groups:b.content.groups.map(row=>row.id===g.id?{...row,quantity:(row.quantity??0)+1}:row),items:[...b.content.items,{id:crypto.randomUUID(),groupId:g.id,week:null,kind:'carry',scheduleId}]});return;
  }
  const slot=b.content.items.find(i=>i.groupId===g.id&&!i.scheduleId&&!i.week&&i.kind==='new');
  if(!slot){setMessage('本月已有帖子占用新做名额，请先填写足够的新做数量。');return;}
  updateContent(b,{...b.content,items:b.content.items.map(i=>i.id===slot.id?{...i,scheduleId,kind:'existing'}:i)});
 }
 function distribute(b:Batch,item:PlanItem,week:number|null){
  if(!b.canEdit||step!=='weeks'||b.step!=='weeks'||busy)return;
  updateContent(b,{...b.content,items:b.content.items.map(i=>i.id===item.id?{...i,week}:i)});
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
  closePopover(button);setQuantityGroups(new Set([...(step==='quantity'?quantityGroups:[]),group.id]));setHolding({});update(value);setAnnualSource('');setTemporary({...temporary,name:'',reason:''});
 }
 function evidence(b:Batch,g:PlanGroup,item?:PlanItem){
  const known=item&&execution?.find(p=>p.id===item.id),schedule=item&&(known?.schedule??material.candidates.find(c=>c.id===item.scheduleId));
  return <div className="monthly-chip-evidence">{item&&<p>{item.kind==='carry'?'上月未登记 · 补帖':item.kind==='existing'?'本月已有排期':'本月新做'}{b.id?' · 追加':''}</p>}{schedule&&<><p>应发 {businessDateTime(schedule.plannedAt)}</p><p>{schedule.actualAt?'已登记 '+businessDateTime(schedule.actualAt):'尚未登记'}</p></>}{item?.scheduleId&&<a href={'/business/operations-schedule?display=ledger&row='+item.scheduleId} target="_blank" rel="noreferrer">原排期 ↗</a>}{known?.pending&&<p>已提交待审</p>}{known?.status==='rejected'&&<p>驳回待处理</p>}{known?.deadline&&<p>落实截止 {businessDateTime(known.deadline)}</p>}{g.annualPlanId&&<a href={'/business/annual-plan?year='+material.executionMonth.slice(0,4)+'&row='+g.annualPlanId} target="_blank" rel="noreferrer">年度来源 V{g.annualVersion} ↗</a>}{(g.reason||g.note)&&<p>{g.reason||g.note}</p>}</div>;
 }
 function quantityInput(b:Batch,g:PlanGroup){
  const carries=b.content.items.filter(i=>i.groupId===g.id&&i.kind==='carry').length;
  return <label className="monthly-chip-quantity"><span>新做</span><input aria-label={g.name+'新做篇数'} disabled={!b.canQuantity||busy} type="number" min="0" max="1000" value={g.quantity==null?'':g.quantity-carries} onChange={e=>quantity(b,g,e.target.value)}/><span>篇</span>{carries>0&&<small>＋补帖 {carries}</small>}</label>;
 }
 function sourceInfo(b:Batch,g:PlanGroup){
  const items=b.content.items.filter(i=>i.groupId===g.id),candidates=material.candidates.filter(c=>c.subjectId===g.subjectId&&c.categoryId===g.categoryId&&(!used.has(c.id)||items.some(i=>i.scheduleId===c.id)));
  return <>{evidence(b,g)}{b.canQuantity&&<>{step==='weeks'&&quantityInput(b,g)}{candidates.length>0&&<fieldset className="monthly-candidate-picker"><legend>纳入已有帖子</legend>{candidates.map(c=><label key={c.id}><input type="checkbox" disabled={busy} checked={items.some(i=>i.scheduleId===c.id)} onChange={()=>include(b,g,c.id)}/><span>{c.name}<small>V{c.versionNumber} · {businessDate(c.plannedAt)} · {c.kind==='carry'?'上月未登记':'占新做名额'}</small></span></label>)}</fieldset>}</>}</>;
 }
 function choices(b:Batch,item?:PlanItem){
  if(!item||!b.canEdit||b.step!=='weeks'||step!=='weeks')return null;
  const move=(button:HTMLElement,week:number|null)=>{closePopover(button);distribute(b,item,week);requestAnimationFrame(()=>host.current?.querySelector<HTMLElement>(week?`[data-plan-item="${item.id}"] [data-popover-trigger]`:`[data-plan-source="${item.scheduleId??item.groupId}"] [data-popover-trigger]`)?.focus({preventScroll:true}));};
  return <div className="monthly-chip-week-choices" aria-label="选择周次">{weeks.map(w=><button type="button" key={w.week} data-plan-week-choice={w.week} disabled={busy||item.week===w.week} onClick={e=>move(e.currentTarget,w.week)}>Week {w.week}</button>)}{item.week&&<button type="button" disabled={busy} onClick={e=>move(e.currentTarget,null)}>移回待分配</button>}</div>;
 }
 function card(b:Batch,g:PlanGroup,items:PlanItem[],pool=false){
  const left=items.filter(i=>!i.week),item=pool?left[0]:items[0],bound=items[0]?.scheduleId;
  const known=bound&&(execution?.find(p=>p.id===items[0].id)?.schedule??material.candidates.find(c=>c.id===bound));
  const name=known?known.name:g.name,carry=items[0]?.kind==='carry',text=name+(carry?'（补帖）':''),canDrag=!!item&&b.canEdit&&b.step==='weeks'&&step==='weeks'&&!busy;
  return <div className={'monthly-plan-chip'+(pool?' monthly-pool-chip':'')} key={pool?(bound??g.id):item!.id} data-plan-item={pool?undefined:item!.id} data-plan-source={pool?(bound??g.id):undefined} data-plan-kind={items[0]?.kind??'new'} data-exhausted={pool&&!left.length||undefined} draggable={canDrag}
   onDragStart={e=>{if(!canDrag){e.preventDefault();return;}setDrag(item!.id);e.dataTransfer.setData('text/plain',item!.id);e.dataTransfer.effectAllowed='move';const nameNode=e.currentTarget.querySelector<HTMLElement>('.weekly-detail-trigger>span')!;e.dataTransfer.setDragImage(nameNode,Math.min(60,nameNode.clientWidth/2),nameNode.clientHeight/2);}} onDragEnd={()=>{setDrag(null);setDragTarget(null);}}>
   <WeeklyCardDetails boundary={pool?'.monthly-plan-pool':'.monthly-week'} label={pool?text+'，剩余'+left.length+'篇':text+'，Week '+item!.week} triggerContent={<><span>{name}{carry&&<span className="monthly-chip-carry">（补帖）</span>}</span>{pool&&<b>×{left.length}</b>}</>}>
    <strong>{text}</strong>{choices(b,item)}{bound?evidence(b,g,items[0]):pool?sourceInfo(b,g):evidence(b,g,items[0])}
   </WeeklyCardDetails>
   {pool&&carry&&<WeeklyCardDetails variant="info" boundary=".monthly-plan-pool" label={'查看'+name+'补帖资料'}>{evidence(b,g,items[0])}</WeeklyCardDetails>}
  </div>;
 }
 const remaining=active.filter(b=>b.step==='weeks').reduce((n,b)=>n+b.content.items.filter(i=>!i.week).length,0);
 const visibleGroup=(g:PlanGroup)=>step==='quantity'&&quantityGroups.has(g.id)||(g.quantity??0)>0||combined.items.some(i=>i.groupId===g.id);
 const subjects=[...new Set(combined.groups.filter(visibleGroup).map(g=>g.subjectId))];
 return <section className="monthly-section monthly-plan-compact" ref={host} data-monthly-plan-editor><header><h2>{material.executionMonth} 执行月计划</h2>{locked&&editable&&<span className="monthly-status">原计划已锁定</span>}</header>
  {!editable?<MonthlyPlanSummary cards month={material.executionMonth} content={combined} execution={material.executionPlan?.items} progressKnown={'executionPlan' in material} candidates={material.candidates}/>:<div className="monthly-plan-workflow" data-plan-workflow="original" data-plan-step={step}>
   <div className="monthly-planner"><div className="monthly-plan-board">{weeks.map(w=><section className="monthly-week" key={w.week} data-week={w.week} data-drop-target={dragTarget===String(w.week)||undefined}
    onDragEnter={()=>{if(step==='weeks'&&drag)setDragTarget(String(w.week));}} onDragLeave={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node))setDragTarget(null);}} onDragOver={e=>{if(step==='weeks'&&drag)e.preventDefault();}} onDrop={e=>{e.preventDefault();drop(drag??e.dataTransfer.getData('text/plain'),w.week);}}>
    <header><h3>Week {w.week}</h3><span>{w.from.slice(5)} 至 {w.through.slice(5)}</span><b>{combined.items.filter(i=>i.week===w.week).length}篇</b></header>
    {combined.items.some(i=>i.week===w.week)&&<div className="monthly-week-items">{batches.flatMap(b=>b.content.items.filter(i=>i.week===w.week).map(i=>card(b,b.content.groups.find(g=>g.id===i.groupId)!,[i])))}</div>}
   </section>)}</div>
   <aside className="monthly-plan-pool" aria-label="待分配来源" data-drop-target={dragTarget==='pool'||undefined}
    onDragEnter={()=>{if(step==='weeks'&&drag)setDragTarget('pool');}} onDragLeave={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node))setDragTarget(null);}} onDragOver={e=>{if(step==='weeks'&&drag)e.preventDefault();}} onDrop={e=>{e.preventDefault();drop(drag??e.dataTransfer.getData('text/plain'),null);}}>
    <header><h3>{step==='quantity'?'新做数量':'待分配'}</h3><span className="monthly-status">{step==='quantity'?`共 ${combined.items.length} 篇`:`剩余 ${remaining} 篇`}</span></header>
    {subjects.map(subject=><div className="monthly-pool-subject" key={subject}><h4>{taxonomy.subjects.find(s=>s.id===subject)?.name??subject}</h4>{batches.flatMap(b=>b.content.groups.filter(g=>g.subjectId===subject&&visibleGroup(g)).map(g=>{
     const items=b.content.items.filter(i=>i.groupId===g.id),free=items.filter(i=>!i.scheduleId),bound=items.filter(i=>!!i.scheduleId),editQuantity=step==='quantity'&&b.canQuantity&&b.step==='quantity'&&quantityGroups.has(g.id);
     return <div className="monthly-source-card" data-source-group={g.id} data-source-batch={b.key} key={g.id}>{editQuantity?<div className="monthly-source-quantity-row"><strong>{g.name}</strong><WeeklyCardDetails variant="info" boundary=".monthly-plan-pool" label={'查看'+g.name+'来源及补帖'}>{sourceInfo(b,g)}</WeeklyCardDetails>{quantityInput(b,g)}</div>:<>{(free.length>0||!bound.length)&&card(b,g,free,true)}{bound.map(i=>card(b,g,[i],true))}</>}</div>;
    }))}</div>)}
    <div className="monthly-plan-add"><WeeklyCardDetails boundary=".monthly-plan-pool" label="新增月计划" triggerContent={<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 4v16M4 12h16"/></svg>}>
     <div className="monthly-temporary"><strong>新增月计划</strong>{draft.content.groups.some(g=>g.annualPlanId)&&<label>来源<select aria-label="来源" value={annualSource} onChange={e=>setAnnualSource(e.target.value)}><option value="">年度规划外内容</option>{draft.content.groups.filter(g=>g.annualPlanId).map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select></label>}{!annualSource&&<><label>内容名称<input aria-label="内容名称" value={temporary.name} onChange={e=>setTemporary({...temporary,name:e.target.value})}/></label><label>学科<select aria-label="学科" value={temporary.subjectId} onChange={e=>setTemporary({...temporary,subjectId:e.target.value,categoryId:''})}>{taxonomy.subjects.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label><label>帖子分类<select aria-label="帖子分类" value={temporary.categoryId} onChange={e=>setTemporary({...temporary,categoryId:e.target.value})}><option value="">请选择</option>{taxonomy.postCategories.filter(c=>taxonomy.subjectCategoryMappings.some(m=>m.subjectId===temporary.subjectId&&m.categoryId===c.id)).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label></>}<label>原因<textarea aria-label="原因" value={temporary.reason} onChange={e=>setTemporary({...temporary,reason:e.target.value})}/></label><button type="button" disabled={busy} onClick={e=>addGroup(e.currentTarget)}>添加内容</button></div>
    </WeeklyCardDetails></div>
   </aside></div>
   <div className="monthly-plan-step-actions">{step==='quantity'?<button type="button" className="business-action-primary" disabled={busy} onClick={()=>void confirmStep('weeks')}>{busy?'正在保存…':'保存数量安排'}</button>:step==='weeks'?<button type="button" className="business-action-primary" disabled={busy||remaining>0} onClick={()=>void confirmStep('confirmed')}>{busy?'正在保存…':'确认安排'}</button>:active.some(b=>b.content.items.length>0)&&<button type="button" disabled={busy} onClick={()=>void resetWeeks()}>重新排期</button>}</div>
  </div>}
  {message&&<p role="alert" className="monthly-plan-alert">{message}</p>}
 </section>;
}
