/** 资料外观适配只消费已有排期摘要；不请求数据或改变业务状态。 */
export function resourceDomain(value:string){
 try{return new URL(value).hostname.replace(/^www\./,'');}catch{return '已登记链接';}
}
type ResourceRecord={contentName:string;projectDocUrl?:string|null;publicationUrl?:string|null;actualPublishAt?:string|null};
export const resourceDefinitions=[
 {kind:'document',label:'项目资料',path:'M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6Z M14 3v6h6 M8 13h8 M8 17h6'},
 {kind:'post',label:'已发布帖子',path:'m9 15 6-6 M7.5 13.5l-2 2a3.54 3.54 0 0 0 5 5l4-4a3.54 3.54 0 0 0 0-5 M16.5 10.5l2-2a3.54 3.54 0 0 0-5-5l-4 4a3.54 3.54 0 0 0 0 5'},
] as const;
export function createResourceLinks(record:ResourceRecord){
 const root=document.createElement('nav');root.className='surface-resources';root.dataset.resourceLinks='';
 root.innerHTML=resourceDefinitions.map(item=>`<a class="surface-resource" data-kind="${item.kind}" data-surface-press="directional" target="_blank" rel="noopener noreferrer"><span class="surface-resource-icon" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="${item.path}"/></svg></span><span class="surface-resource-copy"><strong>${item.label}</strong><small></small></span><svg class="surface-resource-arrow" aria-hidden="true" width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M5 15 15 5M5 5h10v10"/></svg></a>`).join('');
 updateResourceLinks(root,record);return root;
}
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
