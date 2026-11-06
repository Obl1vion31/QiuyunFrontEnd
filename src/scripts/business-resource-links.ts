/** 资料外观适配只消费已有排期摘要；不请求数据或改变业务状态。 */
export function resourceDomain(value:string){
 try{return new URL(value).hostname.replace(/^www\./,'');}catch{return '已登记链接';}
}
type ResourceRecord={contentName:string;projectDocUrl?:string|null;publicationUrl?:string|null;actualPublishAt?:string|null};
export function updateResourceLinks(root:HTMLElement,record:ResourceRecord){
 root.setAttribute('aria-label',record.contentName+'的资料与帖子');
 for(const [kind,url,missing]of [['document',record.projectDocUrl,'未登记'],['post',record.publicationUrl,record.actualPublishAt?'未登记':'尚未发布']] as const){
  const link=root.querySelector<HTMLAnchorElement>('[data-kind="'+kind+'"]')!;
  link.toggleAttribute('data-missing',!url);
  if(url){link.href=url;link.title=url;link.removeAttribute('aria-disabled');link.removeAttribute('tabindex');}
  else{link.removeAttribute('href');link.removeAttribute('title');link.setAttribute('aria-disabled','true');link.tabIndex=-1;}
  link.querySelector('small')!.textContent=url?resourceDomain(url):missing;
 }
}
let stop:(()=>void)|undefined;
export function mountScheduleResourceLinks(){
 if(typeof document==='undefined')return;
 const mount=()=>{
  stop?.();const root=document.querySelector<HTMLElement>('[data-schedule-resources]');if(!root)return;
  const abort=new AbortController();stop=()=>abort.abort();
  document.addEventListener('business:schedule-selected',((event:CustomEvent<ResourceRecord>)=>updateResourceLinks(root,event.detail)) as EventListener,{signal:abort.signal});
  // 兼容直接链接首次进入：共享Inspector可能已在本模块启动前完成选择。
  const selected=root.closest<HTMLElement>('[data-inspector]')?.dataset.selectedId,source=document.querySelector('[data-schedule-records]');
  if(selected&&source?.textContent){const row=(JSON.parse(source.textContent) as Array<ResourceRecord&{id:string}>).find(row=>row.id===selected);if(row)updateResourceLinks(root,row);}
 };
 mount();document.addEventListener('astro:page-load',mount);document.addEventListener('astro:before-swap',()=>stop?.());
}
