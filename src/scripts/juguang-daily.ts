import {readBusiness} from './business-read';
import {businessDateTime} from './business-date';
import {juguangMetricFields,promotionClickRate,type JuguangMetricPreview,type JuguangMetricSource} from '../integrations/juguang-metric-types';

type Batch={rows:Array<JuguangMetricPreview|{key:string;metricId:string|null;message:string;waiting?:boolean}>;message?:string};
const inflight=new Map<string,Promise<Batch>>();
// 各日期共用同一应用授权锁；页面内顺序读取，避免不同日期互相报“正在读取”。
let readQueue:Promise<unknown>=Promise.resolve();
function readBatch(date:string){
 const campaigns=[...new Set([...document.querySelectorAll<HTMLElement>('form[data-juguang-date]')].filter(f=>f.dataset.juguangDate===date).map(f=>f.dataset.juguangCampaign!))].sort();
 const query=new URLSearchParams({date});for(const campaign of campaigns)query.append('campaignId',campaign);
 for(const form of document.querySelectorAll<HTMLFormElement>('form[data-juguang-date]')){const draft=form.querySelector<HTMLInputElement>('[name=platformNoteId]')?.value;if(form.dataset.juguangDate===date&&!form.dataset.noteId&&draft&&form.dataset.juguangCampaign)query.set('noteId:'+form.dataset.juguangCampaign,draft);}
 const key=query.toString();let pending=inflight.get(key);
 if(!pending){pending=readQueue.catch(()=>{}).then(()=>fetch('/api/promotion-daily/juguang-preview?'+query,{cache:'no-store',headers:{Accept:'application/json','X-Business-Feedback':'local'}})).then(async response=>{const value=await response.json();if(!response.ok)throw new Error(value.message??'聚光读取失败，原数据已保留。');return value as Batch;}).finally(()=>inflight.delete(key));inflight.set(key,pending);readQueue=pending;}
 return pending;
}
function initialize() {
  for(const form of document.querySelectorAll<HTMLFormElement>('form[data-juguang-pilot]:not([data-juguang-ready])')) {
    form.dataset.juguangReady='true';
    const host=form.querySelector<HTMLElement>('[data-juguang-traffic]')!,message=form.querySelector<HTMLElement>('[data-juguang-message]')!,retry=form.querySelector<HTMLButtonElement>('[data-retry-juguang]')!,feedback=form.querySelector<HTMLElement>('[data-juguang-feedback]')!;
    const field=(name:string)=>form.elements.namedItem(name) as HTMLInputElement;
    const persistedSource=JSON.parse(form.dataset.juguangSource??'null') as JuguangMetricSource|null;
    let source=persistedSource;
    const touched=new Set<string>(source?.overriddenFields??[]);
    let busy=false,readError='',waiting=false;
    const render=()=>{
      const overridden=juguangMetricFields.filter(name=>source && field(name).value!=='' && Number(field(name).value)!==source.original[name]);
      for(const name of juguangMetricFields) {
        const label=form.querySelector<HTMLElement>(`[data-juguang-field="${name}"]`)!;
        label.dataset.juguangOrigin=source?(overridden.includes(name)?'override':'api'):'manual';
        label.querySelector<HTMLElement>('[data-juguang-badge]')!.textContent=source?(overridden.includes(name)?'人工覆盖':'聚光'):'手填';
        const restore=label.querySelector<HTMLButtonElement>('[data-restore-juguang]');
        if(restore){restore.hidden=!overridden.includes(name);restore.disabled=field(name).disabled;restore.setAttribute('aria-label',`恢复${field(name).getAttribute('aria-label')??name}的聚光值`);}
      }
      const reason=host.querySelector<HTMLElement>('[data-juguang-reason]')!;reason.hidden=!overridden.length;field('juguangOverrideReason').required=!!overridden.length;
      const impressions=field('impressionCount').value,clicks=field('clickCount').value,rate=promotionClickRate(impressions===''?null:Number(impressions),clicks===''?null:Number(clicks));
      host.querySelector<HTMLOutputElement>('[data-juguang-ctr]')!.value=rate==null?'—':rate.toFixed(2)+'%';
      retry.disabled=busy || form.dataset.juguangSaving==='true';
      message.textContent=readError || (source?`聚光 ${businessDateTime(source.fetchedAt)} · ${form.dataset.juguangPending==='true'?'待保存':'已保存'}`:'尚未读取，保留手填值');
      message.dataset.error=String(!!readError&&!waiting);
      const summary=form.querySelector<HTMLElement>('[data-juguang-summary]');if(summary){summary.textContent=readError?(waiting?'暂无报表':'读取失败'):source?(form.dataset.juguangPending==='true'?'待保存':'已保存'):'待读取';summary.hidden=summary.textContent==='已保存';summary.dataset.error=String(!!readError&&!waiting);summary.title=message.textContent;}
    };
    const read=async()=>{
      if(busy || form.dataset.juguangSaving==='true')return;
      const noteAtStart=field('platformNoteId')?.value??'';
      busy=true;readError='';waiting=false;render();
      try {
        const result=await readBusiness(feedback,()=>readBatch(form.dataset.juguangDate!),{label:form.classList.contains('review-pilot-grid')?'读取':'读取中…'});
        if(!result || !form.isConnected || form.dataset.juguangSaving==='true'||(field('platformNoteId')?.value??'')!==noteAtStart)return;
        const row=result.rows.find(row=>row.key===form.dataset.juguangPilot);
        if(!row || !('source' in row)){readError=row?.message??'尚无对应报表，原数据已保留。';waiting=!!row?.waiting;return;}
        source=row.source;const filled:string[]=[];
        for(const name of juguangMetricFields)if(!touched.has(name)){field(name).value=name==='spend'?source.original[name].toFixed(2):String(source.original[name]);filled.push(name);}
        field('juguangReceipt').value=row.receipt;
        const original=source.original;
        form.dataset.juguangPending=String(!persistedSource || persistedSource.noteId!==source.noteId || persistedSource.mappingFingerprint!==source.mappingFingerprint || juguangMetricFields.some(name=>persistedSource.original[name]!==original[name]));
        // 来源刷新只移动被实际回填字段的基线，不把人的其他输入清为干净。
        form.dispatchEvent(new CustomEvent('business:juguang-preview',{detail:{fields:[...filled,'juguangReceipt']}}));
      } catch(error) {readError=error instanceof Error?error.message:'聚光读取失败，原数据已保留。';}
      finally{busy=false;if(form.isConnected){render();if((field('platformNoteId')?.value??'')!==noteAtStart)void read();}}
    };
    form.addEventListener('business:note-id-draft',()=>void read());
    form.addEventListener('business:juguang-retry',()=>void read());
    form.addEventListener('input',event=>{const input=event.target as HTMLInputElement;if(juguangMetricFields.includes(input.name as typeof juguangMetricFields[number]))touched.add(input.name);render();});
    form.addEventListener('business:juguang-render',()=>render());
    form.addEventListener('business:juguang-reset',()=>{touched.clear();for(const name of source?.overriddenFields??[])touched.add(name);render();});
    for(const button of form.querySelectorAll<HTMLButtonElement>('[data-restore-juguang]'))button.addEventListener('click',()=>{
      if(!source || button.disabled)return;
      const name=button.dataset.restoreJuguang as typeof juguangMetricFields[number];field(name).value=String(source.original[name]);touched.delete(name);field(name).dispatchEvent(new Event('input',{bubbles:true}));touched.delete(name);render();
    });
    retry.addEventListener('click',()=>void read());
    render();
    const dialog=form.closest<HTMLDialogElement>('dialog');
    if(dialog){const observer=new MutationObserver(()=>{if(dialog.open)void read();});observer.observe(dialog,{attributes:true,attributeFilter:['open']});if(dialog.open)void read();document.addEventListener('astro:before-swap',()=>observer.disconnect(),{once:true});}
    else void read();
  }
}
document.addEventListener('astro:page-load',initialize);
document.addEventListener('business:promotion-fragment-updated',initialize);
document.addEventListener('business:inspector-render',initialize);

document.addEventListener('business:juguang-form-added',initialize);
