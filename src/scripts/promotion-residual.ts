import {readBusiness} from './business-read';
import {randomRequestKey,refreshPromotionSchedule} from './promotion-timeline';
import {businessConfirm} from './business-dialog';
type Candidate={campaignId:string;scheduleId:string;contentName:string;versionNumber:number;startedOn:string;endedOn:string;sourceStageStartedOn:string;earliestDate:string;latestDate:string};
function initialize(){
 const editor=document.querySelector<HTMLElement>('[data-residual-editor]');if(!editor||editor.dataset.ready)return;editor.dataset.ready='true';
 const search=editor.querySelector<HTMLFormElement>('[data-residual-search]')!,choices=editor.querySelector<HTMLFormElement>('[data-residual-candidates]')!,rows=editor.querySelector<HTMLElement>('[data-residual-rows]')!,select=choices.elements.namedItem('campaignId') as HTMLSelectElement,date=choices.elements.namedItem('metricDate') as HTMLInputElement,message=search.querySelector('output')!;
 let candidates:Candidate[]=[];
 document.querySelector('[data-residual-trigger]')?.addEventListener('click',()=>{editor.hidden=false;search.querySelector('input')?.focus({preventScroll:true});});
 editor.querySelector('[data-residual-close]')?.addEventListener('click',async()=>{if(editor.querySelector('form[data-dirty=true]')&&!await businessConfirm('补录内容尚未保存，是否放弃？'))return;rows.querySelectorAll('[data-residual-form]').forEach(row=>row.remove());editor.hidden=true;document.documentElement.dataset.unsaved=String(!!document.querySelector('form[data-dirty=true]'));document.querySelector<HTMLElement>('[data-residual-trigger]')?.focus({preventScroll:true});});
 search.addEventListener('submit',async event=>{
  event.preventDefault();if(!search.reportValidity())return;const button=search.querySelector<HTMLButtonElement>('[type=submit]')!;button.disabled=true;message.textContent='';choices.hidden=true;
  try{const result=await readBusiness(editor,async read=>{const response=await fetch(`/api/promotion-daily?noteId=${encodeURIComponent(String(new FormData(search).get('noteId')))}`,{signal:read.signal,cache:'no-store'}),result=await response.json();if(!response.ok)throw new Error(result.message??'查询失败');return result;});
   if(!result)return;candidates=result.residualCandidates;select.replaceChildren(new Option('请选择活动及版本',''));for(const item of candidates)select.add(new Option(`${item.contentName} · V${item.versionNumber} · ${item.startedOn} — ${item.endedOn}`,item.campaignId));choices.hidden=!candidates.length;message.textContent=candidates.length?'':'未找到已测试淘汰的活动，请核对笔记 ID。';
  }catch(error){message.textContent=error instanceof Error?error.message:'查询失败，请重试。';}finally{button.disabled=false;}
 });
 select.addEventListener('change',()=>{const candidate=candidates.find(item=>item.campaignId===select.value);date.min=candidate?.earliestDate??'';date.max=candidate?.latestDate??'';date.value='';});
 choices.addEventListener('submit',event=>{
  event.preventDefault();if(!choices.reportValidity())return;const candidate=candidates.find(item=>item.campaignId===select.value);if(!candidate)return;
  const key=`${candidate.campaignId}:${date.value}`;if(rows.querySelector(`[data-residual-key="${CSS.escape(key)}"]`)){message.textContent='该日期已有补录行。';return;}
  const template=editor.querySelector<HTMLTemplateElement>('[data-residual-template]')!,form=template.content.firstElementChild!.cloneNode(true) as HTMLFormElement;
  form.dataset.residualKey=key;for(const [name,value]of Object.entries({campaignId:candidate.campaignId,metricDate:date.value,sourceStageStartedOn:candidate.sourceStageStartedOn}))(form.elements.namedItem(name) as HTMLInputElement).value=value;
  form.querySelector('[data-residual-name]')!.textContent=candidate.contentName;form.querySelector('[data-residual-version]')!.textContent=`V${candidate.versionNumber}`;const time=form.querySelector('time')!;time.dateTime=date.value;time.textContent=`${Number(date.value.slice(5,7))}月${Number(date.value.slice(8))}日`;
  const requestKey=randomRequestKey(),feedback=form.querySelector<HTMLElement>('[data-form-message]')!,submit=form.querySelector<HTMLButtonElement>('[type=submit]')!;let busy=false;
  form.addEventListener('input',()=>{form.dataset.dirty='true';document.documentElement.dataset.unsaved='true';const values=Object.fromEntries(new FormData(form)),complete=['spend','platformOpenCount','actualOpenCount','platformLeadCount','actualLeadCount'].every(name=>values[name]!==''),spend=Number(values.spend);for(const [selector,name]of [['[data-open-cost]','actualOpenCount'],['[data-lead-cost]','actualLeadCount']])form.querySelector(selector)!.textContent=complete&&Number(values[name])>0?`¥${(spend/Number(values[name])).toFixed(2)}`:'—';});
  form.addEventListener('submit',async event=>{
   event.preventDefault();if(busy||!form.reportValidity())return;busy=true;submit.disabled=true;submit.textContent='正在保存…';feedback.textContent='';
   try{const data=new FormData(form);data.set('requestKey',requestKey);const response=await fetch('/api/promotion-daily',{method:'POST',body:data,headers:{Accept:'application/json'}}),result=await response.json();if(!response.ok){feedback.textContent=result.message??'补录失败，输入已保留。';return;}
    form.dataset.dirty='false';submit.textContent='已补录';submit.dataset.success='';feedback.textContent='补录已完成';await refreshPromotionSchedule(candidate.scheduleId);document.documentElement.dataset.unsaved=String(!!document.querySelector('form[data-dirty=true]'));for(const field of form.querySelectorAll<HTMLInputElement>('input'))field.disabled=true;submit.disabled=true;return;
   }catch{feedback.textContent='连接失败，输入已保留。';}finally{busy=false;if(form.dataset.dirty!=='false'){submit.disabled=false;submit.textContent='完成补录';}}
  });rows.hidden=false;rows.append(form);form.querySelector<HTMLInputElement>('[name=spend]')?.focus({preventScroll:true});message.textContent='';
 });
}
document.addEventListener('astro:page-load',initialize);initialize();
