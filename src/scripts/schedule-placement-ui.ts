import {businessDateTime} from './business-date';
import {mayOperate} from './business-permissions';
import {trackFormChanges} from './form-changes';
import {readBusiness} from './business-read';
import type {previewPlacement} from '../db/schedule-placement';
type Preview=Awaited<ReturnType<typeof previewPlacement>>;
type RecordRow={id:string;contentName:string;plannedPublishAt:string;actualPublishAt:string|null};
type Hooks={rows:RecordRow[];signal:AbortSignal;canLeave:()=>Promise<boolean>;show:(record:RecordRow)=>void;cancel:()=>Promise<void>;close:()=>Promise<void>;saved:(id:string,month:string)=>Promise<boolean>};
const mime='application/x-qiuyun-schedule-placement';
const local=(value:string)=>/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)?value:businessDateTime(value).replace(' ','T');
export function initializePlacement(hooks:Hooks){
 const view=document.querySelector<HTMLElement>('#placement-dialog')!,form=view.querySelector<HTMLFormElement>('form')!,message=view.querySelector<HTMLOutputElement>('[data-placement-message]')!,options=view.querySelector<HTMLElement>('[data-placement-options]')!,previewHost=view.querySelector<HTMLElement>('[data-placement-preview]')!,recheck=view.querySelector<HTMLButtonElement>('[data-placement-recheck]')!;
 const control=(name:string)=>form.elements.namedItem(name) as HTMLInputElement;
 const tracker=trackFormChanges(form),submit=form.querySelector<HTMLButtonElement>('[type=submit]')!;
 let current:Preview|undefined,record:RecordRow|undefined,selectedId='',fromDetail=false,requestKey='',busy=false,readGeneration=0,readAbort:AbortController|undefined,written=false,dragId='',suppressUntil=0,dropGeneration=0;
 let pendingRead:{id:string;month:string}|undefined;
 const body=view.querySelector<HTMLElement>('[data-placement-fields]')!;
 const feedback=document.createElement('div');feedback.className='schedule-placement-feedback';
 const status=document.createElement('output');status.className='schedule-placement-status';status.setAttribute('role','status');feedback.append(status);document.querySelector('.calendar')?.before(feedback);
 const readRetry=document.createElement('button');readRetry.type='button';readRetry.className='business-action-secondary';readRetry.textContent='重试读取';readRetry.hidden=true;feedback.append(readRetry);
 let statusTimer:ReturnType<typeof setTimeout>|undefined;
 const announce=(text:string,persistent=false)=>{clearTimeout(statusTimer);status.textContent=text;if(text&&!persistent)statusTimer=setTimeout(()=>{if(readRetry.hidden)status.textContent='';},4000);};
 hooks.signal.addEventListener('abort',()=>clearTimeout(statusTimer),{once:true});

 const eligible=(r:RecordRow)=>!r.actualPublishAt&&mayOperate(Date.now()-new Date(r.plannedPublishAt+'+08:00').getTime()>=7200000?'schedule.overdueReschedule':'schedule.reschedule');
 const choice=()=>form.querySelector<HTMLInputElement>('[name=placementChoice]:checked')?.value??'move';
 function configure(name:string,value:string){const hidden=control(name);hidden.closest('[data-datetime-field]')!.dispatchEvent(new CustomEvent('business:datetime-configure',{bubbles:true,detail:{value:local(value)}}));}
 function selectedTarget(){return current?.items.find(item=>item.id===choice());}
 function showPreview(resetTimes=true){
  if(!current)return;
  const target=selectedTarget(),sourceAt=local(current.source.at),next=target?local(target.at):current.day+'T'+sourceAt.slice(11);
  if(resetTimes){configure('placementNext',next);configure('placementReturn',sourceAt);}
  control('placementNextTime').disabled=false;
  control('placementNextDate').readOnly=true;control('placementReturnDate').readOnly=true;
  const back=view.querySelector<HTMLElement>('[data-placement-return]')!;back.hidden=!target;
  control('placementReturnTime').required=!!target;control('placementReturnTime').disabled=!target;control('placementReturnDate').disabled=!target;
  const reasonMessage=current.reasonMessage||target?.reasonMessage;
  view.querySelector<HTMLElement>('[data-placement-reason]')!.hidden=!reasonMessage&&!control('reason').value;
  control('reason').required=!!reasonMessage;view.querySelector<HTMLElement>('[data-placement-reason-hint]')!.textContent=reasonMessage??'';
  const lines=[{name:current.source.name,before:sourceAt,after:control('placementNextDate').value+' '+control('placementNextTime').value}];
  if(target)lines.push({name:target.name,before:local(target.at),after:control('placementReturnDate').value+' '+control('placementReturnTime').value});
  previewHost.replaceChildren(...lines.map(row=>{const p=document.createElement('p'),title=document.createElement('strong');title.textContent=row.name;p.append(title,document.createElement('br'),row.before.replace('T',' ')+' → '+row.after);return p;}));
 }
 function render(keepChoice='move'){
  if(!current)return;
  view.querySelector('[data-placement-source]')!.textContent=current.source.name+' · V'+current.source.version+' · 原应发 '+businessDateTime(current.source.at);
  options.replaceChildren();
  for(const item of [{id:'move',name:'加入当天',caption:current.items.length?'保留当天已有帖子，新增这一篇。':'当天没有其他排期。',disabled:false},...current.items.map(row=>({id:row.id,name:'与「'+row.name+'」对换',caption:'V'+row.version+' · '+businessDateTime(row.at)+(row.unavailableReason?' · '+row.unavailableReason:''),disabled:!!row.unavailableReason}))]){
   const label=document.createElement('label'),radio=document.createElement('input'),text=document.createElement('span'),caption=document.createElement('small');
   radio.type='radio';radio.name='placementChoice';radio.value=item.id;radio.disabled=item.disabled;radio.checked=keepChoice===item.id&&!item.disabled;text.textContent=item.name;caption.textContent=item.caption;text.append(caption);label.append(radio,text);options.append(label);
  }
  if(keepChoice==='move')options.querySelector<HTMLInputElement>('[value=move]')!.checked=true;
  showPreview();submit.disabled=keepChoice!=='move'&&!selectedTarget();
 }
 async function read(day:string,initial=false){
  if(!record)return;
  const seq=++readGeneration;readAbort?.abort();readAbort=new AbortController();const previousChoice=choice();
  submit.disabled=true;control('placementNextTime').disabled=true;control('placementReturnTime').disabled=true;recheck.hidden=true;message.textContent='';
  try{
   const value=await readBusiness(view.querySelector<HTMLElement>('.sheet-body')!,async read=>{
    const response=await fetch('/api/operations-content/'+record!.id+'/placement?date='+encodeURIComponent(day),{signal:read.signal,cache:'no-store'}),data=await response.json();if(!response.ok)throw Error(data.message);return data as Preview;
   },{signal:readAbort.signal,isCurrent:()=>seq===readGeneration,label:'正在核对目标日排期…'});
   if(!value)return;current=value;requestKey=crypto.randomUUID();render(initial?'move':previousChoice);
   form.dispatchEvent(new CustomEvent('business:form-rebase',{detail:{fields:['placementNextDate','placementNextTime','placementReturnDate','placementReturnTime',...(initial?['placementChoice']:[])]}}));
  }catch(error){if(seq!==readGeneration||readAbort.signal.aborted)return;message.textContent=error instanceof Error?error.message:'读取失败，当前输入已保留。';recheck.hidden=false;}
 }
 async function open(row:RecordRow,day:string,detail:boolean,value?:Preview){
  if(busy)return;
  if(!await hooks.canLeave())return;
  form.reset();current=undefined;options.replaceChildren();previewHost.replaceChildren();
  const initialChoice=document.createElement('input');initialChoice.type='radio';initialChoice.name='placementChoice';initialChoice.value='move';initialChoice.checked=true;initialChoice.hidden=true;options.append(initialChoice);
  record=row;fromDetail=detail;written=false;body.inert=false;requestKey=crypto.randomUUID();control('destination').value=day;control('reason').value='';message.textContent='';recheck.textContent='重新核对';recheck.hidden=true;
  view.querySelector('[data-placement-source]')!.textContent=row.contentName+' · 原应发 '+row.plannedPublishAt.replace('T',' ');
  tracker.capture();
  hooks.show(row);
  if(value){current=value;render();tracker.capture();}else await read(day,true);
  control('destination').focus({preventScroll:true});
 }
 async function finishRead(){
  if(!pendingRead)return;
  const saved=pendingRead;
  if(await hooks.saved(saved.id,saved.month)){
   pendingRead=undefined;readRetry.hidden=true;announce('排期已更新。');
   if(view.closest('dialog')?.open&&!view.hidden&&record?.id===saved.id){if(fromDetail)await hooks.cancel();else await hooks.close();}
  }else{announce('已保存，展示更新失败；重试只读取最新展示。',true);readRetry.hidden=false;message.textContent=status.textContent;recheck.textContent='重试读取';recheck.hidden=false;}
 }
 async function save(fast=false){
  if(!record||!current||busy||written)return;
  if(!fast&&!form.reportValidity())return;
  const target=selectedTarget();
  if(!fast&&choice()!=='move'&&!target){message.textContent='原对换候选已变化，请重新选择。';return;}
  const nextDefault=target?local(target.at):current.day+'T'+local(current.source.at).slice(11);
  const chosen=fast?nextDefault:control('placementNextDate').value+'T'+control('placementNextTime').value;
  const back=control('placementReturnDate').value+'T'+control('placementReturnTime').value;
  const invalid=[{name:current.source.name,at:chosen},...(target?[{name:target.name,at:back}]:[])].find(row=>new Date(row.at+':00+08:00').getTime()<=Date.now());
  if(invalid){message.textContent='「'+invalid.name+'」的 '+invalid.at.replace('T',' ')+' 已经过去，请选择未来的时刻。';return;}
  const payload={action:target?'swap':'move',day:current.day,...(target?{targetScheduleId:target.id,targetPlanRevision:target.planRevision}:{}),expectedPlanRevision:current.source.planRevision,fingerprint:current.fingerprint,requestKey,reason:control('reason').value,
   ...(!fast&&chosen!==nextDefault?{time:control('placementNextTime').value}:{}),
   ...(target&&back!==local(current.source.at)?{returnTime:control('placementReturnTime').value}:{})};
  busy=true;body.inert=true;submit.disabled=true;message.textContent='正在保存调整…';
  try{
   const response=await fetch('/api/operations-content/'+record.id+'/placement',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}),result=await response.json();
   if(!response.ok){
    if(fast){const preservedKey=requestKey;busy=false;body.inert=false;await open(record,current.day,false,current);requestKey=preservedKey;busy=true;}
    message.textContent=result.message??'保存失败，输入已保留。';
    if(['PLACEMENT_CHANGED','STALE_WRITE'].includes(result.code)){recheck.hidden=false;submit.disabled=true;return;}
    if(result.code==='SCHEDULE_REASON_REQUIRED'){view.querySelector<HTMLElement>('[data-placement-reason]')!.hidden=false;control('reason').required=true;control('reason').focus();}
    return;
   }
   written=true;tracker.capture();announce(target?'两篇排期已对换。':'排期已移到 '+current.day+'。');
   pendingRead={id:record.id,month:current.day.slice(0,7)};await finishRead();
  }catch{if(fast){const preservedKey=requestKey;busy=false;body.inert=false;await open(record,current.day,false,current);requestKey=preservedKey;busy=true;}message.textContent='无法连接服务，当前选择与输入已保留，可重试保存。';}
  finally{busy=false;body.inert=written;if(recheck.hidden&&!written)submit.disabled=false;}
 }
 async function drop(row:RecordRow,day:string,node:HTMLElement){
  if(busy||day===row.plannedPublishAt.slice(0,10)||!await hooks.canLeave())return;
  const generation=++dropGeneration;announce('');node.setAttribute('aria-busy','true');
  try{
   const result=await readBusiness(node,async read=>{const r=await fetch('/api/operations-content/'+row.id+'/placement?date='+day,{signal:read.signal,cache:'no-store'}),value=await r.json();if(!r.ok)throw Error(value.message);return value as Preview;},{signal:hooks.signal,isCurrent:()=>generation===dropGeneration,label:'正在核对目标日排期…'});
   if(!result||generation!==dropGeneration)return;
   const at=result.day+'T'+local(result.source.at).slice(11);
   if(!result.items.length&&!result.reasonMessage&&new Date(at+':00+08:00').getTime()>Date.now()){
    record=row;current=result;fromDetail=false;written=false;requestKey=crypto.randomUUID();control('reason').value='';render();tracker.capture();await save(true);
   }else await open(row,day,false,result);
  }catch(error){announce(error instanceof Error?error.message:'读取失败，请重试。');}finally{node.removeAttribute('aria-busy');}
 }
 const clearDrag=()=>{dragId='';document.querySelectorAll('[data-placement-over]').forEach(n=>n.removeAttribute('data-placement-over'));document.querySelectorAll('.placement-dragging').forEach(n=>n.classList.remove('placement-dragging'));};
 function bind(){
  for(const card of document.querySelectorAll<HTMLButtonElement>('.calendar-item[data-inspect-id]')){const row=hooks.rows.find(r=>r.id===card.dataset.inspectId);card.draggable=!!row&&eligible(row);}
 }
 document.addEventListener('dragstart',event=>{const card=(event.target as Element).closest<HTMLElement>('.calendar-item[data-inspect-id]');if(!card)return;const row=hooks.rows.find(r=>r.id===card.dataset.inspectId);if(busy||!row||!eligible(row)||!event.dataTransfer){event.preventDefault();return;}dragId=row.id;event.dataTransfer.setData(mime,row.id);event.dataTransfer.effectAllowed='move';card.classList.add('placement-dragging');},{signal:hooks.signal});
 document.addEventListener('dragover',event=>{if(!dragId||!event.dataTransfer?.types.includes(mime))return;const day=(event.target as Element).closest<HTMLElement>('[data-calendar-day]');if(!day)return;event.preventDefault();document.querySelectorAll('[data-placement-over]').forEach(n=>n.removeAttribute('data-placement-over'));day.dataset.placementOver='true';event.dataTransfer.dropEffect='move';},{signal:hooks.signal});
 document.addEventListener('drop',event=>{if(!dragId||!event.dataTransfer?.types.includes(mime))return;const day=(event.target as Element).closest<HTMLElement>('[data-calendar-day]'),row=hooks.rows.find(r=>r.id===dragId);event.preventDefault();suppressUntil=performance.now()+400;clearDrag();if(day&&row)void drop(row,day.dataset.calendarDay!,day);},{signal:hooks.signal});
 document.addEventListener('dragend',clearDrag,{signal:hooks.signal});
 document.addEventListener('click',event=>{if(performance.now()<suppressUntil&&(event.target as Element).closest('[data-calendar-day]')){event.preventDefault();event.stopImmediatePropagation();}},{capture:true,signal:hooks.signal});
 document.addEventListener('business:schedule-range-updated',bind,{signal:hooks.signal});
 document.addEventListener('business:schedule-selected',event=>{const row=(event as CustomEvent).detail as RecordRow,button=document.querySelector<HTMLButtonElement>('[data-inspector-placement]')!;++dropGeneration;selectedId=row.id;button.hidden=!eligible(row);},{signal:hooks.signal});
 document.querySelector('[data-inspector-placement]')?.addEventListener('click',()=>{const row=hooks.rows.find(r=>r.id===selectedId);if(row)void open(row,row.plannedPublishAt.slice(0,10),true);},{signal:hooks.signal});
 form.addEventListener('change',event=>{const name=(event.target as HTMLInputElement).name;if(name==='destination')void read(control('destination').value);else if(name==='placementChoice'){showPreview();submit.disabled=false;}else if(name==='placementNextTime'||name==='placementReturnTime')showPreview(false);});
 form.addEventListener('submit',event=>{event.preventDefault();void save();});
 recheck.addEventListener('click',()=>void(written?finishRead():read(control('destination').value)));readRetry.addEventListener('click',()=>void finishRead());
 view.querySelector('[data-placement-cancel]')!.addEventListener('click',()=>void(fromDetail?hooks.cancel():hooks.close()));
 view.querySelector('[data-placement-close]')!.addEventListener('click',()=>void hooks.close());
 document.addEventListener('business:schedule-panel-view',event=>{if((event as CustomEvent).detail.view!=='placement'){++readGeneration;readAbort?.abort();}},{signal:hooks.signal});
 bind();return {isDirty:()=>tracker.dirty&&!written,clean:()=>tracker.capture()};
}
