import {writeResources} from '../db/collaboration-resources';
import {businessConfirm} from './business-dialog';
type Lease={resource:string;token:string;expiresAt:string};
type Occupant={resource:string;own:boolean;name:string;role:string;revision:string;expiresAt:string;field:string|null};
type Presence={name:string;role:string;page:string;resource:string|null;field:string|null;visible:boolean};
type Scope={resource:string;label:string;element:HTMLElement};
type Control=HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement|HTMLButtonElement;
const state=window as typeof window&{__collaborationReady?:boolean};
export const shortName=(name:string)=>{const first=name.trim().split(/\s+/)[0]||name;return [...first].length>10?[...first].slice(0,10).join('')+'…':first;};
const overlaps=(a:string,b:string)=>a===b||a.startsWith(b+':')||b.startsWith(a+':')||a.startsWith('campaign:')&&b.includes(':'+a)||b.startsWith('campaign:')&&a.includes(':'+b);
if(!state.__collaborationReady){
 state.__collaborationReady=true;
 const tabId=crypto.randomUUID(),baseFetch=window.fetch.bind(window),leases=new Map<string,Lease>(),aliases=new Map<string,string[]>(),sources=new Map<string,HTMLElement>(),pending=new Map<string,Promise<void>>(),lost=new Set<string>();
 let active:Scope|undefined,field:string|null=null,lastPresence=0,polling=false,occupants:Occupant[]=[],confirming=false;
 const page=()=>location.pathname.split('/').at(-1)!;
 const admin=()=>document.querySelector<HTMLElement>('[data-user-role]')?.dataset.userRole==='admin';
 const visible=(element:HTMLElement)=>element.isConnected&&element.dataset.collaborationActive!=='false'&&!element.closest('[hidden],dialog:not([open])')&&element.getClientRects().length>0;
 const json=async(path:string,method:string,body?:unknown)=>{const res=await baseFetch(path,{method,headers:{'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});const data=await res.json();if(!res.ok)throw Object.assign(new Error(data.message??'协作服务暂时不可用'),{status:res.status});return data;};
 const fieldName=(node:Element)=>(node.getAttribute('aria-label')??node.closest('label')?.childNodes[0]?.textContent??node.getAttribute('name')??'字段').trim().slice(0,80);
 const isField=(node:Element)=>node.matches('input:not([type=hidden]):not([type=search]):not([readonly]),textarea:not([readonly]),select');
 function scopeFor(node:Element):Scope|undefined{
  const element=node.closest<HTMLElement>('[data-collaboration-resource]');
  if(!element?.dataset.collaborationResource||element.dataset.collaborationActive==='false')return;
  return {resource:element.dataset.collaborationResource,label:element.dataset.collaborationLabel??'当前记录',element};
 }
 const scopes=()=>[...document.querySelectorAll<HTMLElement>('[data-collaboration-resource]')].filter(visible).map(element=>scopeFor(element)!);
 const isLost=(resource:string)=>[...lost].some(key=>overlaps(key,resource));
 const renderRelated=(resource:string)=>{for(const scope of scopes())if(overlaps(scope.resource,resource))render(scope);};
 const remote=(scope:Scope)=>occupants.filter(row=>!row.own&&overlaps(row.resource,scope.resource));
 const controls=(scope:Scope)=>[...scope.element.querySelectorAll<Control>('input:not([type=hidden]):not([type=search]):not([readonly]),textarea:not([readonly]),select,button')].filter(node=>{
  if(node.closest('[data-collaboration-resource]')!==scope.element||node.matches('[data-editor-badge]'))return false;
  return !(node instanceof HTMLButtonElement)||!node.matches('[data-close-inspector],[data-close-publication],[data-close-dialog],.close-button')&&!/取消|关闭|返回|查看|资料/.test(node.textContent??'');
 });
 const disable=(scope:Scope,blocked:boolean)=>{
  for(const node of controls(scope)){
   if(blocked&&!node.disabled){node.dataset.lockDisabled='true';node.disabled=true;}
   if(!blocked&&node.dataset.lockDisabled){delete node.dataset.lockDisabled;node.disabled=false;}
  }
 };
 const owned=(scope:Scope)=>{const keys=aliases.get(scope.resource);return !!keys?.length&&keys.every(key=>leases.has(key)&&Date.parse(leases.get(key)!.expiresAt)>Date.now());};
 function render(scope:Scope){
  const rows=remote(scope),blocked=rows.length>0||isLost(scope.resource);
  disable(scope,blocked||pending.has(scope.resource));
  scope.element.dataset.editLock=blocked?'blocked':pending.has(scope.resource)?'pending':owned(scope)?'owned':'available';
  let badge=scope.element.querySelector<HTMLButtonElement>(':scope > [data-editor-badge]');
  if(!blocked){badge?.remove();return;}
  if(!badge){badge=document.createElement('button');badge.type='button';badge.dataset.editorBadge='';badge.className='editor-badge';scope.element.append(badge);badge.addEventListener('click',()=>void reclaim(scope));}
  const row=rows[0];badge.textContent=row?shortName(row.name):'重新取得编辑权';badge.title=row?`${row.name} 正在编辑 · 重新取得编辑权`:'输入已保留，重新取得编辑权';badge.setAttribute('aria-label',badge.title);
  const target=row?.field?[...scope.element.querySelectorAll<Control>('input,textarea,select')].find(node=>fieldName(node)===row.field):undefined;
  if(target){const box=target.getBoundingClientRect(),root=scope.element.getBoundingClientRect();badge.style.top=`${Math.max(2,box.top-root.top+scope.element.scrollTop-8)}px`;badge.style.right=`${Math.max(4,root.right-box.right)}px`;badge.dataset.remoteField='true';}
  else{badge.style.top='2px';badge.style.right='6px';delete badge.dataset.remoteField;}
 }
 const markLost=(key:string)=>{
  leases.delete(key);
  for(const [raw,keys]of aliases)if(keys.includes(key)){lost.add(raw);const element=sources.get(key);if(element)render({resource:raw,label:element.dataset.collaborationLabel??'当前记录',element});}
  lost.add(key);renderRelated(key);
 };
 const release=async(keys:string[])=>{
  const tokens=Object.fromEntries(keys.flatMap(key=>leases.has(key)?[[key,leases.get(key)!.token]]:[]));
  for(const key of keys){leases.delete(key);sources.delete(key);}
  for(const [raw,values]of aliases)if(values.some(key=>keys.includes(key))){aliases.delete(raw);if(active?.resource===raw){active=undefined;field=null;}}
  if(keys.length)try{await json('/api/collaboration/locks','DELETE',{tabId,resources:keys,tokens});}catch{/* 关闭页失联时由现有租约到期释放。 */}finally{for(const key of keys)renderRelated(key);}
 };
 async function ensure(scope:Scope,takeover?:Record<string,string>){
  if(isLost(scope.resource)&&takeover===undefined)throw new Error('当前输入已保留，请重新取得编辑权。');
  if(owned(scope)&&takeover===undefined)return;
  const running=pending.get(scope.resource);if(running)return running;
  const focused=document.activeElement instanceof HTMLElement&&scope.element.contains(document.activeElement)?document.activeElement:null;disable(scope,true);
  const task=(async()=>{
   const result=await json('/api/collaboration/locks','POST',{tabId,resources:[scope.resource],...(takeover===undefined?{}:{takeover})});
   if(!visible(scope.element)||scope.element.dataset.collaborationResource!==scope.resource){await json('/api/collaboration/locks','DELETE',{tabId,resources:result.leases.map((lease:Lease)=>lease.resource),tokens:Object.fromEntries(result.leases.map((lease:Lease)=>[lease.resource,lease.token]))});return;}
   const keys:string[]=[];for(const lease of result.leases as Lease[]){leases.set(lease.resource,lease);sources.set(lease.resource,scope.element);lost.delete(lease.resource);keys.push(lease.resource);}
   aliases.set(scope.resource,keys);
   if(takeover!==undefined){const updates:Promise<unknown>[]=[];scope.element.dispatchEvent(new CustomEvent('business:edit-reclaimed',{bubbles:true,detail:{waitUntil:(task:Promise<unknown>)=>updates.push(task)}}));try{await Promise.all(updates);if(!scope.element.isConnected){const replacement=scopes().find(next=>next.resource===scope.resource);if(replacement){scope.element=replacement.element;for(const key of keys)sources.set(key,scope.element);}else{await release(keys);return;}}}catch(error){lost.add(scope.resource);await release(keys);render(scope);throw error;}}
   for(const key of lost)if(overlaps(key,scope.resource))lost.delete(key);occupants=occupants.filter(row=>!keys.some(key=>overlaps(key,row.resource)));render(scope);
  })().finally(()=>{pending.delete(scope.resource);if(scope.element.dataset.collaborationResource===scope.resource)render(scope);renderRelated(scope.resource);if(owned(scope)&&focused?.isConnected)focused.focus({preventScroll:true});});pending.set(scope.resource,task);return task;
 }
 async function reclaim(scope:Scope){
  if(confirming)return;confirming=true;
  try{
   await poll();const rows=remote(scope),owner=rows[0];
   const message=`${owner?shortName(owner.name)+' 正在编辑中，请确认情况。\n':''}是否已确认重新取得编辑权？`;
   if(!await businessConfirm(message,{title:'重新取得编辑权',confirmLabel:'确认取得',cancelLabel:'取消'}))return;
   await ensure(scope,Object.fromEntries(rows.map(row=>[row.resource,row.revision])));
   const first=controls(scope).find(node=>isField(node)&&!node.matches(':disabled'));first?.focus({preventScroll:true});
  }catch(error){await businessConfirm(error instanceof Error?error.message:'取得失败，请重试。',{title:'未取得编辑权',confirmLabel:'知道了',cancelLabel:'返回'});await poll();}
  finally{confirming=false;}
 }
 function discover(){
  for(const form of document.querySelectorAll<HTMLFormElement>('form:not([data-collaboration-resource])')){
   if(form.closest('[data-post-lookup]'))continue;
   const data=new FormData(form),id=form.dataset.scheduleId||data.get('recordId')||data.get('scheduleId');
   const resource=form.dataset.accountPermissions?`account:${form.dataset.accountPermissions}`:id?`schedule:${id}`:'';
   if(resource){form.dataset.collaborationResource=resource;form.dataset.collaborationLabel=document.querySelector('.business-toolbar__title strong')?.textContent??'当前记录';}
  }
 }
 const position=async(force=false)=>{
  if(page()==='annual-plan'||!document.querySelector('.business-console-frame'))return;
  if(!force&&Date.now()-lastPresence<1000)return;lastPresence=Date.now();
  const meeting=new URL(location.href).searchParams.get('meeting');
  const resource=meeting?`meeting:${meeting}:version:${document.querySelector<HTMLElement>('[data-meeting-presence]')?.dataset.meetingVersion??'draft'}`:active?.resource??null;
  try{await json('/api/collaboration/presence','PUT',{tabId,page:page(),resource,field:active&&owned(active)?field:null,label:active?.label.slice(0,120)??null,visible:!document.hidden});}catch{/* 位置读取不改变业务写入保护。 */}
 };
 async function poll(){
  if(polling||!document.querySelector('.business-console-frame'))return;polling=true;
  try{
   discover();await release([...sources].filter(([key,element])=>!visible(element)||!aliases.get(element.dataset.collaborationResource??'')?.includes(key)).map(([key])=>key));
   if(active&&!visible(active.element)){active=undefined;field=null;}
   await position();if(document.hidden)return;
   const current=scopes(),query=new URLSearchParams({tabId}),meetingId=new URL(location.href).searchParams.get('meeting');for(const resource of new Set([...current.map(scope=>scope.resource),...(meetingId?[`meeting:${meetingId}`]:[])]))query.append('resource',resource);
   occupants=(await json('/api/collaboration/locks?'+query,'GET')).rows;
   for(const keys of aliases.values())for(const key of keys){const lease=leases.get(key);if(lease&&(Date.parse(lease.expiresAt)<=Date.now()||occupants.some(row=>!row.own&&overlaps(row.resource,key))))markLost(key);}
   for(const scope of current)render(scope);
   if(admin()){
    const {rows}=await json('/api/collaboration/presence','GET') as {rows:Presence[]};
    const modules:Record<string,string>={'operations-schedule':'schedule','daily-promotion-review':'daily-promotion'};
    for(const link of document.querySelectorAll<HTMLElement>('[data-module-id]')){
     const people=rows.filter(row=>row.visible&&(modules[row.page]??row.page)===link.dataset.moduleId),names=[...new Set(people.map(row=>row.name))];let badge=link.querySelector<HTMLElement>('[data-presence-badge]');
     link.toggleAttribute('data-has-presence',names.length>0);if(!names.length){badge?.remove();continue;}
     if(!badge){badge=document.createElement('span');badge.dataset.presenceBadge='';badge.className='presence-badge';link.append(badge);}badge.textContent=names.length===1?shortName(names[0]):`${names.length}人`;badge.title=names.join('、');
    }
   }
   const meeting=new URL(location.href).searchParams.get('meeting'),summary=document.querySelector<HTMLElement>('[data-meeting-presence]');
   if(meeting&&summary){
    const {rows}=await json('/api/collaboration/presence?meeting='+meeting,'GET') as {rows:Presence[]};
    const editorNames=[...new Set(occupants.filter(row=>row.resource===`meeting:${meeting}`).map(row=>shortName(row.name)))];
    const viewers=[...new Set(rows.filter(row=>row.visible&&row.resource===`meeting:${meeting}:version:${summary.dataset.meetingVersion??'draft'}`).map(row=>shortName(row.name)))].filter(name=>!editorNames.includes(name));
    summary.textContent=[editorNames.length?'正在编辑：'+editorNames.join('、'):'',viewers.length?'正在查看：'+viewers.join('、'):''].filter(Boolean).join('　');
   }
  }finally{polling=false;}
 }
 async function start(scope:Scope,node?:Element){
  active=scope;field=node&&isField(node)?fieldName(node):null;
  try{await ensure(scope);await position(true);}catch(error){await poll().catch(()=>{});render(scope);if(!remote(scope).length&&!(error instanceof Error&&'status' in error&&error.status===409))document.dispatchEvent(new CustomEvent('business:operation-receipt',{detail:{message:error instanceof Error?error.message:'取得编辑权失败，请重试。'}}));}
 }
 document.addEventListener('focusin',event=>{const node=event.target as Element;if(!isField(node)||node.matches(':disabled'))return;discover();const scope=scopeFor(node);if(scope)void start(scope,node);});
 document.addEventListener('beforeinput',event=>{const node=event.target as Element,scope=scopeFor(node);if(!scope||!isField(node))return;if(!owned(scope)){event.preventDefault();void start(scope,node);}},true);
 document.addEventListener('pointerdown',event=>{
  const node=event.target as Element,scope=scopeFor(node);if(!scope||node.closest('[data-editor-badge]'))return;
  const blocked=remote(scope).length||isLost(scope.resource);
  if(blocked){const hit=controls(scope).some(control=>{const box=control.getBoundingClientRect();return event.clientX>=box.left&&event.clientX<=box.right&&event.clientY>=box.top&&event.clientY<=box.bottom;});if(hit){event.preventDefault();event.stopImmediatePropagation();void reclaim(scope);}}
  else if(isField(node)&&!owned(scope)){event.preventDefault();void start(scope,node).then(()=>{if(owned(scope))(node as HTMLElement).focus();});}
 },true);
 document.addEventListener('focusout',()=>queueMicrotask(()=>{if(!(document.activeElement instanceof Element)||!isField(document.activeElement)){field=null;void position(true);}}));
 const refresh=()=>queueMicrotask(()=>void (async()=>{for(const element of document.querySelectorAll<HTMLElement>('[data-collaboration-active="false"]')){delete element.dataset.editEntered;element.querySelector(':scope > [data-editor-badge]')?.remove();disable({resource:element.dataset.collaborationResource!,label:'',element},false);}discover();await poll();for(const scope of scopes())if((scope.element.matches('[data-weekly-report]')||scope.element.matches('[data-collaboration-active="true"]')||scope.element.matches('[data-review-form]')&&new URL(location.href).searchParams.get('view')!=='history'&&!!scope.element.closest('[data-inspector].is-open'))&&!scope.element.dataset.editEntered&&!isLost(scope.resource)&&!remote(scope).length){scope.element.dataset.editEntered='true';await start(scope);}})().catch(()=>{}));
 for(const name of ['business:editing-scope-change','business:inspector-selection','business:inspector-render','business:publication-opened'])document.addEventListener(name,refresh);
 document.addEventListener('close',refresh,true);
 window.fetch=async(input,init)=>{
  const target=new URL(input instanceof Request?input.url:String(input),location.href),method=String(init?.method??(input instanceof Request?input.method:'GET')).toUpperCase();
  if(target.origin!==location.origin||!target.pathname.startsWith('/api/')||target.pathname.startsWith('/api/collaboration/')||['GET','HEAD','OPTIONS'].includes(method))return baseFetch(input,init);
  let data:Record<string,unknown>={};const body=init?.body;
  if(body instanceof FormData)data=Object.fromEntries(body.entries());else if(typeof body==='string'){try{data=JSON.parse(body);}catch{return baseFetch(input,init);}}else if(input instanceof Request){try{data=input.headers.get('content-type')?.includes('application/json')?await input.clone().json():Object.fromEntries((await input.clone().formData()).entries());}catch{return baseFetch(input,init);}}
  const resources=writeResources(target.pathname,method,data);if(!resources.length)return baseFetch(input,init);
  let acquired:string[]=[];
  try{
   await Promise.all([...pending.values()]);
   if(resources.some(resource=>[...lost].some(key=>overlaps(key,resource))))throw new Error('当前输入已保留，请重新取得编辑权。');
   const missing=resources.filter(resource=>![...leases.values()].some(lease=>overlaps(lease.resource,resource)));
   if(missing.length){const result=await json('/api/collaboration/locks','POST',{tabId,resources:missing});for(const lease of result.leases as Lease[]){leases.set(lease.resource,lease);acquired.push(lease.resource);}}
   const used=[...leases.keys()].filter(key=>resources.some(resource=>overlaps(key,resource)));
   const headers=new Headers(init?.headers??(input instanceof Request?input.headers:undefined));headers.set('X-Edit-Tab',tabId);headers.set('X-Edit-Leases',JSON.stringify(Object.fromEntries([...leases].map(([key,value])=>[key,value.token]))));
   const response=await baseFetch(input,{...init,headers});
   if(response.ok)await release(used);else if(response.status===409){const result=await response.clone().json().catch(()=>null);if(result?.message?.includes('编辑权限已失效'))for(const key of used)markLost(key);}
   for(const scope of scopes())render(scope);
   return response;
  }catch(error){await release(acquired.filter(key=>!sources.has(key)));return Response.json({code:'EDIT_CONFLICT',message:error instanceof Error?error.message:'编辑服务暂不可用，输入已保留。'},{status:409});}
 };
 setInterval(()=>void poll().catch(()=>{}),3000);
 setInterval(async()=>{
  if(!leases.size)return;
  try{const result=await json('/api/collaboration/locks','PATCH',{tabId,tokens:Object.fromEntries([...leases].map(([key,value])=>[key,value.token]))});for(const lease of result.leases as Lease[])leases.set(lease.resource,lease);for(const key of result.lost as string[])markLost(key);}
  catch{/* 网络失败不冒充他人接管；有效期内保留草稿，过期后停止提交。 */for(const [key,lease]of leases)if(Date.parse(lease.expiresAt)<=Date.now())markLost(key);}
 },15000);
 document.addEventListener('visibilitychange',()=>{void position(true);if(!document.hidden)refresh();});
 document.addEventListener('astro:before-swap',()=>{if(page()!=='annual-plan')void json('/api/collaboration/presence','PUT',{tabId,page:page(),resource:null,field:null,label:null,visible:false}).catch(()=>{});void release([...leases.keys()]);active=undefined;field=null;occupants=[];lost.clear();});
 document.addEventListener('astro:page-load',refresh);
 window.addEventListener('resize',()=>{for(const scope of scopes())render(scope);});
 document.addEventListener('scroll',()=>{for(const scope of scopes())if(remote(scope).length)render(scope);},true);
 window.addEventListener('pagehide',()=>{void baseFetch('/api/collaboration/locks',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({tabId,resources:[...leases.keys()],tokens:Object.fromEntries([...leases].map(([key,value])=>[key,value.token]))}),keepalive:true});});
 refresh();
}
