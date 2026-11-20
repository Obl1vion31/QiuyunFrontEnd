import {readableOperationError} from '../db/business-messages';
import {appendScheduleDelay} from './schedule-delay';
import {appendBusinessHistory,mergeInspectorHistory} from './schedule-business-history';
import {createResourceLinks} from './business-resource-links';
import '../styles/schedule-history.css';
import {closeBusinessDialog} from './business-dialog';
import {readBusiness} from './business-read';
import {businessDate,businessDateTime} from './business-date';
import {promotionActualLabels} from '../db/promotion-successors.mjs';
import {checkpointLabel} from '../db/non-promotion-nodes';
type Post={id:string;name:string;version:number;subject:string;category:string|null;planned:string;actual:string|null;promoted:boolean;noteId:string|null;document:string|null;publication:string|null;revision:string|null};
function initialize(){
 const dialog=document.querySelector<HTMLDialogElement>('[data-post-lookup]');if(!dialog||dialog.dataset.ready)return;dialog.dataset.ready='true';
 const form=dialog.querySelector<HTMLFormElement>('form')!,input=form.elements.namedItem('q') as HTMLInputElement,results=dialog.querySelector<HTMLElement>('[data-lookup-results]')!,detail=dialog.querySelector<HTMLElement>('[data-lookup-detail]')!,message=dialog.querySelector<HTMLOutputElement>('[data-lookup-message]')!,more=dialog.querySelector<HTMLButtonElement>('[data-lookup-more]')!,body=dialog.querySelector<HTMLElement>('.sheet-body')!;
 let opener:HTMLElement|null=null,next:number|null=null,query='',generation=0,resultScroll=0,resultId='';
 const back=dialog.querySelector<HTMLButtonElement>('[data-lookup-back]')!;
 const showHome=(visible:boolean)=>dialog.querySelectorAll<HTMLElement>('[data-assistant-home]').forEach(node=>node.hidden=!visible);
 const setExpanded=(expanded:boolean)=>document.querySelectorAll('[data-assistant-open]').forEach(node=>node.setAttribute('aria-expanded',String(expanded)));
 const returnToResults=()=>{generation++;detail.hidden=true;form.hidden=false;results.hidden=false;more.hidden=next===null;back.hidden=true;message.textContent='';body.scrollTop=resultScroll;results.querySelector<HTMLElement>(`[data-post-id="${resultId}"]`)?.focus({preventScroll:true});};
 back.addEventListener('click',returnToResults);
 const el=(tag:string,text?:string)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
 const link=(container:HTMLElement,label:string,href:string|null)=>{if(!href)return;const url=new URL(href,location.origin);if(!['http:','https:'].includes(url.protocol))return;const a=el('a',label) as HTMLAnchorElement;a.href=url.href;a.target='_blank';a.rel='noopener noreferrer';container.append(a);};
 const section=(name:string)=>{const node=el('section');node.className='lookup-detail-section';node.append(el('h3',name));detail.append(node);return node;};
 const p=(node:HTMLElement,text:string)=>node.append(el('p',text));
 const openPost=async(id:string)=>{
  const version=++generation;if(detail.hidden){resultScroll=body.scrollTop;resultId=id;}
  try{const data=await readBusiness(body,async read=>{const res=await fetch(`/api/content-search?id=${encodeURIComponent(id)}`,{signal:read.signal});const data=await res.json();if(!res.ok)throw new Error(data.message);return data;});if(!data||version!==generation||!dialog.open)return;
   detail.replaceChildren();back.hidden=false;
   const post=data.post as Post,identity=section(`${post.name} · V${post.version}`);identity.classList.add('lookup-identity');
   p(identity,`${post.subject} · ${post.category??'临时帖'} · ${post.promoted?'推广':'非推广'}`);
   const facts=el('dl');facts.className='lookup-facts';
   for(const[label,value]of [['应发',businessDateTime(post.planned)],['实发',post.actual?businessDateTime(post.actual):'尚未登记'],['笔记 ID',post.noteId??'未登记']]){
    const row=el('div');row.append(el('dt',label),el('dd',value));facts.append(row);
   }
   identity.append(facts,createResourceLinks({contentName:post.name,projectDocUrl:post.document,publicationUrl:post.publication,actualPublishAt:post.actual}));
   if(!(post as any).cancelledAt)link(identity,'查看排期详情 ↗',`/business/operations-schedule?month=${businessDate(post.planned).slice(0,7)}&row=${post.id}`);
   const versions=section('内容版本'),versionList=el('div');versionList.className='lookup-versions';versionList.setAttribute('aria-label','选择内容版本');
   for(const row of data.versions as Post[]){
    const button=el('button',`V${row.version}`) as HTMLButtonElement;button.type='button';button.className='business-action-secondary';
    button.disabled=row.id===id;button.setAttribute('aria-current',String(row.id===id));button.title=`V${row.version} · ${row.name} · 应发 ${businessDateTime(row.planned)}`;
    button.addEventListener('click',()=>void openPost(row.id));versionList.append(button);
   }
   versions.append(versionList);if(post.revision)p(versions,'改动说明：'+post.revision);
   if(post.promoted||data.stages.length||data.metrics.length){
    const promotion=section('推广过程');if(!data.stages.length)p(promotion,'暂无推广阶段');
    for(const stage of data.stages)p(promotion,`${stage.stageType==='testing'?'测试':'放量'} · ${stage.startedOn}—${stage.endedOn??'进行中'}`);
    if(data.metrics.length){
     const totals=el('dl');totals.className='lookup-totals';
     for(const[label,value]of [['累计消耗','¥'+Number(data.totals.spend).toFixed(2)],['实际开口',data.totals.actualOpenCount+' 人'],['实际留资',data.totals.actualLeadCount+' 人']]){const item=el('div');item.append(el('dt',label),el('dd',String(value)));totals.append(item);}promotion.append(totals);
     const daily=el('details');daily.append(el('summary',`已登记日度数据 (${data.metrics.length})`));
     for(const row of data.metrics){const item=el('p');item.className='lookup-daily';for(const value of [row.metricDate,promotionActualLabels[row.actualStatusSnapshot]??row.stageTypeSnapshot,`消耗 ¥${Number(row.spend).toFixed(2)}`,`开口 ${row.actualOpenCount}`,`留资 ${row.actualLeadCount}`])item.append(el('span',value));daily.append(item);}promotion.append(daily);
    }
    link(promotion,'推广历史与更正 ↗',`/business/daily-promotion-review?view=history&q=${encodeURIComponent(post.name)}`);
   }
   if(data.non.length||data.checkpointEvents.length){
    const non=section('非推广复盘');for(const row of data.non){p(non,`${checkpointLabel(row.checkpointType)} · 数据截至 ${row.recordedThrough}\n阅读量 ${row.readCount==null?'未记录':Number(row.readCount).toLocaleString('zh-CN')} · 点击率 ${row.clickRate==null?'—':Number(row.clickRate).toFixed(2)+'%'} · 3秒阅读率 ${Number(row.threeSecondReadRate).toFixed(2)}%`);link(non,'查看复盘 ↗',`/business/non-promotion-review?view=history&row=${row.scheduleId}:${row.checkpointType}`);}for(const row of data.checkpointEvents.filter((item:any)=>item.action==='skip'))p(non,`${checkpointLabel(row.checkpointType)}不复盘 · ${row.reason}`);
   }
   const delay=el('section');delay.className='lookup-detail-section';delay.setAttribute('aria-label','延期说明');detail.append(delay);appendScheduleDelay(delay,data.delayDays,post.planned);
   const history=el('section');history.className='lookup-detail-section';history.setAttribute('aria-label','业务历史');detail.append(history);appendBusinessHistory(history,mergeInspectorHistory(data.historyEvents,data.history));
    if(data.meetings.length){const meetings=section('相关例会');for(const row of data.meetings)link(meetings,`${row.name} · V${row.version}${row.status==='draft'?' · 草稿':''} ↗`,`/business/meeting-review?meeting=${row.id}&version=${row.version}`);}
    showHome(false);form.hidden=true;results.hidden=true;more.hidden=true;detail.hidden=false;message.textContent='';body.scrollTop=0;back.focus({preventScroll:true});
  }catch(error){if(version===generation)message.textContent=readableOperationError(error,'读取失败，请重试。');}
 };
 const search=async(append=false)=>{const version=++generation;if(!append){query=input.value.trim();next=null;detail.hidden=true;form.hidden=false;results.hidden=false;back.hidden=true;body.scrollTop=0;}showHome(!query);if(!query){results.replaceChildren();message.textContent='请输入名称或完整笔记 ID';more.hidden=true;return;}
  try{const data=await readBusiness(body,async read=>{const res=await fetch(`/api/content-search?q=${encodeURIComponent(query)}&offset=${append?next??0:0}`,{signal:read.signal});const data=await res.json();if(!res.ok)throw new Error(data.message);return data;});if(!data||version!==generation||!dialog.open)return;if(!append)results.replaceChildren();for(const post of data.rows as Post[]){const button=el('button') as HTMLButtonElement;button.type='button';button.className='lookup-result';button.dataset.postId=post.id;button.append(el('strong',post.name),el('span',`V${post.version}`),el('small',`${post.subject} · ${post.promoted?'推广':'非推广'} · 应发 ${businessDateTime(post.planned)} · 实发 ${post.actual?businessDateTime(post.actual):'尚未登记'}`));button.addEventListener('click',()=>void openPost(post.id));results.append(button);}next=data.next;more.hidden=next===null;message.textContent=results.children.length?'':'没有找到匹配的帖子';}catch(error){if(version===generation)message.textContent=readableOperationError(error,'查找失败，请重试。');}
 };
 setExpanded(false);dialog.addEventListener('close',()=>setExpanded(dialog.open));
 const abort=new AbortController();
 document.addEventListener('click',event=>{const button=(event.target as Element).closest<HTMLElement>('[data-post-lookup-open]');if(!button)return;const panel=button.closest<HTMLElement>('[popover]');opener=panel?document.querySelector<HTMLElement>(`[popovertarget="${panel.id}"],[aria-controls="${panel.id}"]`):button;panel?.hidePopover();dialog.showModal();setExpanded(true);if(detail.hidden)input.focus({preventScroll:true});else back.focus({preventScroll:true});},{signal:abort.signal});
 document.addEventListener('astro:before-swap',()=>{generation++;setExpanded(false);abort.abort();},{once:true,signal:abort.signal});
 const close=async()=>{generation++;await closeBusinessDialog(dialog);setExpanded(dialog.open);const target=opener?.getClientRects().length?opener:[...document.querySelectorAll<HTMLElement>('[data-post-lookup-open],[data-account-trigger]')].find(node=>node.getClientRects().length);target?.focus({preventScroll:true});};dialog.querySelector('[data-lookup-close]')!.addEventListener('click',()=>void close());dialog.dataset.dialogCancelManaged='true';dialog.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();void close();}});dialog.addEventListener('cancel',event=>{event.preventDefault();void close();});form.addEventListener('submit',event=>{event.preventDefault();void search();});more.addEventListener('click',()=>void search(true));
}
document.addEventListener('astro:page-load',initialize);initialize();
