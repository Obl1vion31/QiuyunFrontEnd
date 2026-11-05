import type {MonthlyCalendarView} from '../db/monthly-plan-links';
import {weekOf} from '../db/monthly-plan-types';
import {getInspector} from './business-inspector';
type Group=MonthlyCalendarView['linkGroups'][number];
type Candidate={id:string;name:string;plannedAt:string;writeVersion:string};
function initialize(){
 const pool=document.querySelector<HTMLElement>('[data-monthly-plan-pool]'),data=document.querySelector('[data-monthly-calendar-plan]'),grid=document.querySelector<HTMLElement>('.calendar-grid');
 if(!pool||!data||!grid||pool.dataset.linksInitialized)return;pool.dataset.linksInitialized='true';
 const lifecycle=new AbortController(),{signal}=lifecycle;
 let plan:MonthlyCalendarView=JSON.parse(data.textContent||'null'),active:Group|null=null,candidates:Candidate[]=[],selected=new Set<string>(),initial=new Set<string>(),requestId='',busy=false,sequence=0,request:AbortController|undefined,entry:HTMLElement|null=null;
 const actions=pool.querySelector<HTMLElement>('[data-monthly-link-actions]')!,status=pool.querySelector<HTMLElement>('[data-monthly-link-status]')!,message=pool.querySelector<HTMLOutputElement>('[data-monthly-link-message]')!,save=pool.querySelector<HTMLButtonElement>('[data-monthly-link-save]')!,cancel=pool.querySelector<HTMLButtonElement>('[data-monthly-link-cancel]')!,reasonField=pool.querySelector<HTMLElement>('[data-monthly-link-reason-field]')!,reason=reasonField.querySelector<HTMLInputElement>('input')!;
 const clearHidden=pool.querySelector<HTMLButtonElement>('[data-monthly-link-clear-hidden]')!;
 const cards=[...grid.querySelectorAll<HTMLButtonElement>('.calendar-item[data-inspect-id]')];
 const original=new Map(cards.map(card=>[card,{role:card.getAttribute('role'),label:card.getAttribute('aria-label'),tabindex:card.getAttribute('tabindex'),disabled:card.getAttribute('aria-disabled')}]));
 for(const card of cards){const check=document.createElement('span');check.className='monthly-card-check';check.setAttribute('aria-hidden','true');check.innerHTML='<svg viewBox="0 0 16 16"><path d="m3 8 3 3 7-7"/></svg>';card.append(check);}
 const sameSelection=()=>selected.size===initial.size&&[...selected].every(id=>initial.has(id));
 const dirty=()=>!!active&&(!sameSelection()||!!reason.value.trim());
 const changed=()=>{document.documentElement.dataset.unsaved=String(dirty()||!!document.querySelector('[data-inspector][data-dirty=true]'));};
 const tell=(text:string,success=false)=>{message.textContent=text;message.hidden=!text;message.toggleAttribute('data-success',success);};
 function eligible(id:string){return !!active&&candidates.some(c=>c.id===id)&&(initial.has(id)||!plan.occupiedScheduleIds.includes(id)&&!plan.reservedScheduleIds.includes(id));}
 function needsReason(){return [...initial].some(id=>!selected.has(id))||[...selected].some(id=>!initial.has(id)&&weekOf(dateKey(candidates.find(c=>c.id===id)!.plannedAt))!==active!.week);}
 function dateKey(value:string){return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));}
 function paintSelection(){
  grid!.classList.toggle('monthly-link-selecting',!!active);actions.classList.toggle('is-selecting',!!active);
  for(const card of cards){
   const id=card.dataset.inspectId!,before=original.get(card)!;
   if(active){const allowed=eligible(id);card.dataset.monthlyEligible=String(allowed);card.setAttribute('role','checkbox');card.setAttribute('aria-checked',String(selected.has(id)));card.setAttribute('aria-disabled',String(!allowed||busy));card.tabIndex=allowed?0:-1;card.setAttribute('aria-label',(candidates.find(c=>c.id===id)?.name??card.title)+(selected.has(id)?'，已选':'，未选'));}
   else{delete card.dataset.monthlyEligible;card.removeAttribute('aria-checked');for(const [name,value] of [['role',before.role],['aria-label',before.label],['tabindex',before.tabindex],['aria-disabled',before.disabled]]){if(value===null)card.removeAttribute(name!);else card.setAttribute(name!,value!);}}
  }
  save.hidden=cancel.hidden=!active;save.disabled=busy||sameSelection()||!!active&&needsReason()&&!reason.value.trim();cancel.disabled=busy;reason.disabled=busy;
  reasonField.hidden=!active||!needsReason();reason.required=!!active&&needsReason();
  const hiddenSelected=[...selected].filter(id=>!cards.some(card=>card.dataset.inspectId===id));clearHidden.hidden=!active||!hiddenSelected.length;clearHidden.disabled=busy;
  if(active)status.textContent='已选 '+selected.size+'/'+active.quantity+(hiddenSelected.length?'（含未显示 '+hiddenSelected.length+' 篇）':'');
  changed();
 }
 function render(){
  for(const group of plan.linkGroups){
   const button=[...pool!.querySelectorAll<HTMLButtonElement>('[data-monthly-link-group]')].find(b=>b.dataset.monthlyLinkGroup===group.key);if(!button)continue;
   const open=group.remaining>0||group.pending>0;
   button.querySelector('[data-group-count]')!.textContent='×'+(open?group.remaining:group.quantity);
   button.querySelector('[data-group-state]')!.textContent='Week '+group.week+(group.addition?' · 追加':'')+(group.pending?' · 待审':!open?' · 更正关联':group.overdue?' · 超过48h未提交':'');
   button.disabled=pool!.dataset.canManage!=='true'||group.pending>0;button.setAttribute('aria-pressed',String(active?.key===group.key));
   pool!.querySelector(open?'[data-monthly-open-groups]':'[data-monthly-done-groups]')!.append(button);
  }
  const complete=plan.linkGroups.filter(g=>!g.remaining&&!g.pending).length;
  pool!.querySelector<HTMLElement>('[data-monthly-completed]')!.hidden=!complete;pool!.querySelector('[data-monthly-completed-count]')!.textContent=String(complete);
  pool!.querySelector<HTMLElement>('[data-monthly-open-section]')!.hidden=!plan.linkGroups.some(g=>g.remaining||g.pending);
  const linked=(item:MonthlyCalendarView['items'][number])=>item.linked;
  pool!.querySelector('[data-monthly-overall]')!.textContent=plan.items.filter(linked).length+'/'+plan.items.length+' 已关联';
  for(const row of pool!.querySelectorAll<HTMLElement>('[data-monthly-week]')){
   const items=plan.items.filter(i=>i.week===Number(row.dataset.monthlyWeek)),pending=items.filter(i=>i.pending).length;
   row.querySelector('[data-week-total]')!.textContent=String(items.length);row.querySelector('[data-week-linked]')!.textContent=String(items.filter(linked).length);
   const pendingNode=row.querySelector<HTMLElement>('[data-week-pending]')!;pendingNode.hidden=!pending;pendingNode.querySelector('b')!.textContent=String(pending);
  }
  for(const card of cards){
   const item=plan.items.find(i=>i.schedule?.id===card.dataset.inspectId);
   let label=card.querySelector<HTMLElement>('.monthly-card-membership');
   if(item){if(!label){label=document.createElement('small');label.className='monthly-card-membership';card.append(label);}label.textContent='计划 W'+item.week+(item.pending?' · 待审':'');label.title='月计划 · Week '+item.week;}
   else label?.remove();
  }
  data!.textContent=JSON.stringify(plan);document.dispatchEvent(new CustomEvent('business:monthly-plan-updated',{detail:{plan}}));
 }
 function setSource(itemId=''){pool!.dataset.selectedItem=itemId;pool!.dataset.scheduleId='';document.dispatchEvent(new CustomEvent('business:monthly-link-source',{detail:{itemId}}));}
 function finish(clearSource=true,restoreFocus=true){
  ++sequence;request?.abort();active=null;selected.clear();initial.clear();candidates=[];reason.value='';busy=false;
  if(clearSource){delete pool!.dataset.selectedItem;delete pool!.dataset.scheduleId;setSource();}
  paintSelection();for(const b of pool!.querySelectorAll('[data-monthly-link-group]'))b.setAttribute('aria-pressed','false');
  status.textContent=pool!.dataset.canManage==='true'?'点击计划，在月历中勾选已有帖子。':'当前账号可查看计划，关联需排期编辑权限。';
  if(restoreFocus&&entry?.isConnected)entry.focus({preventScroll:true});
 }
 async function mayDiscard(){return !dirty()||await window.businessConfirm('有尚未保存的计划关联，是否放弃？');}
 async function choose(key:string,trigger:HTMLElement){
  if(busy||!await mayDiscard())return;
  const inspector=document.querySelector<HTMLElement>('[data-inspector][data-inspector-parameter=row]');
  if(inspector?.classList.contains('is-open')&&!await getInspector(inspector).close())return;
  finish();entry=trigger;tell('');const group=plan.linkGroups.find(g=>g.key===key);if(!group)return;
  const seq=++sequence;request=new AbortController();
  const timer=setTimeout(()=>{if(seq===sequence)status.textContent='正在读取可关联排期…';},500);
  try{
   const response=await fetch('/api/monthly-plans?id='+plan.id+'&choices=1&group='+encodeURIComponent(group.groupId)+'&week='+group.week,{signal:request.signal}),result=await response.json();
   if(seq!==sequence)return;if(!response.ok)throw new Error(result.message||'读取失败，请重试。');
   plan=result.plan;render();active=plan.linkGroups.find(g=>g.key===key)??null;if(!active||active.pending){finish();tell('这项计划已有待审核关联，请先处理。');return;}
   candidates=result.candidates;initial=new Set(active.scheduleIds);selected=new Set(initial);requestId=crypto.randomUUID();
   setSource(active.itemIds.find(id=>!plan.items.find(i=>i.id===id)?.schedule)??'');
   paintSelection();trigger.setAttribute('aria-pressed','true');
   if(!candidates.some(c=>eligible(c.id)&&cards.some(card=>card.dataset.inspectId===c.id)))tell('当前月历没有可勾选的同类帖子，可检查筛选或点击日期新建。',true);
  }catch(error){if((error as Error).name!=='AbortError'){status.textContent='点击计划，在月历中勾选已有帖子。';tell((error as Error).message);}}finally{clearTimeout(timer);}
 }
 function toggle(id:string){
  if(!active||busy)return;if(!eligible(id)){tell('该帖子不匹配，或已占用其他计划名额。');return;}
  if(selected.has(id))selected.delete(id);else{if(selected.size>=active.quantity){tell('已选满 '+active.quantity+' 个名额，请先取消一篇。');return;}selected.add(id);}
  requestId=crypto.randomUUID();tell('');paintSelection();
 }
 pool.addEventListener('click',event=>{const button=(event.target as Element).closest<HTMLElement>('[data-monthly-link-group]');if(button&&!button.hasAttribute('disabled'))void choose(button.dataset.monthlyLinkGroup!,button);},{signal});
 grid.addEventListener('click',event=>{if(!active)return;const card=(event.target as Element).closest<HTMLElement>('.calendar-item[data-inspect-id]');if(card){event.preventDefault();event.stopImmediatePropagation();toggle(card.dataset.inspectId!);}},{capture:true,signal});
 grid.addEventListener('keydown',event=>{if(!active||![' ','Enter'].includes(event.key))return;const card=(event.target as Element).closest<HTMLElement>('.calendar-item[data-inspect-id]');if(card){event.preventDefault();event.stopImmediatePropagation();toggle(card.dataset.inspectId!);}},{capture:true,signal});
 const newPost=async(target:HTMLElement)=>{if(busy||!await mayDiscard())return;const itemId=active?.itemIds.find(id=>!plan.items.find(i=>i.id===id)?.schedule)??'';finish(false,false);setSource(itemId);target.click();};
 document.addEventListener('click',event=>{
  if(!active)return;const target=(event.target as Element).closest<HTMLElement>('[data-calendar-new],[data-open-new]')??((event.target as Element).closest('[data-calendar-day]')&&!(event.target as Element).closest('button,a')?event.target as HTMLElement:null);
  if(target){event.preventDefault();event.stopImmediatePropagation();void newPost(target);}
 },{capture:true,signal});
 clearHidden.addEventListener('click',()=>{if(!active||busy)return;for(const id of selected)if(!cards.some(card=>card.dataset.inspectId===id))selected.delete(id);requestId=crypto.randomUUID();tell('');paintSelection();},{signal});
 cancel.addEventListener('click',()=>{void(async()=>{if(!busy&&await mayDiscard()){finish();tell('');}})();},{signal});
 reason.addEventListener('input',()=>{requestId=crypto.randomUUID();paintSelection();},{signal});
 save.addEventListener('click',()=>{void(async()=>{
  if(!active||busy||sameSelection())return;if(needsReason()&&!reason.value.trim()){reason.focus();return;}
  if([...initial].some(id=>!selected.has(id))&&!await window.businessConfirm('更正后将更新计划关联，帖子和计划数量保持不变。',{title:'确认更正关联',confirmLabel:'确认保存',cancelLabel:'继续选择'}))return;
  busy=true;paintSelection();save.textContent='正在保存…';tell('');
  const input={requestId,groupId:active.groupId,week:active.week,expectedRevision:plan.revision,expectedAssignmentVersion:active.assignmentVersion,
   scheduleIds:[...selected],versions:Object.fromEntries(candidates.filter(c=>initial.has(c.id)||selected.has(c.id)).map(c=>[c.id,c.writeVersion])),reason:reason.value.trim()};
  try{
   const response=await fetch('/api/monthly-plans/'+plan.id+'/links',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(input)}),result=await response.json();
   if(!response.ok)throw new Error(result.message||'保存失败，请重试。');
   const pending=response.status===202;
   if(result.plan)plan=result.plan;else{const latest=await fetch('/api/monthly-plans?id='+plan.id);const value=await latest.json();if(!latest.ok)throw new Error('已提交审核，结果读取失败。请刷新查看。');plan=value.plan;}
   finish();render();const focusTarget=entry?.closest('details:not([open])')?.querySelector<HTMLElement>('summary')??entry;focusTarget?.focus({preventScroll:true});tell(pending?'已提交管理员审核，名额已预留。':'已保存关联，计划数量保持不变。',true);
  }catch(error){tell((error as Error).message||'无法连接服务，请重试。');}
  finally{busy=false;save.textContent='保存关联';paintSelection();}
 })();},{signal});
 document.addEventListener('business:navigation-discard',()=>finish(true,false),{signal});
 document.addEventListener('astro:before-swap',()=>{request?.abort();lifecycle.abort();},{once:true});
 render();
}
initialize();document.addEventListener('astro:page-load',initialize);
