import {writeResources} from '../db/collaboration-resources';
type Lease={resource:string;token:string;expiresAt:string};
type Presence={name:string;page:string;resource:string|null;field:string|null;label:string|null;visible:boolean;tabId:string};
type Scope={resource:string;label:string;element:HTMLElement};
const state=window as typeof window&{__collaborationReady?:boolean};
if(!state.__collaborationReady){
 state.__collaborationReady=true;
 const tabId=crypto.randomUUID(),baseFetch=window.fetch.bind(window),leases=new Map<string,Lease>(),aliases=new Map<string,string[]>(),sources=new Map<string,HTMLElement>(),pending=new Map<string,Promise<void>>(),lost=new Set<string>();
 let active:Scope|undefined,field:string|null=null,lastPresence=0,polling=false;
 const page=()=>location.pathname.split('/').at(-1)!;
 const json=async(path:string,method:string,body?:unknown)=>{const res=await baseFetch(path,{method,headers:{'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});const data=await res.json();if(!res.ok)throw new Error(data.message??'协作服务暂时不可用');return data;};
 const unblock=(scope:Scope)=>{for(const input of scope.element.querySelectorAll<HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement|HTMLButtonElement>('[data-lock-disabled]')){input.disabled=false;delete input.dataset.lockDisabled;}};
 const show=(scope:Scope,message:string,retry=false)=>{
  if(retry){lost.add(scope.resource);scope.element.dataset.editLock='blocked';for(const input of scope.element.querySelectorAll<HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement|HTMLButtonElement>('input:not([type=hidden]):not([readonly]):not(:disabled),textarea:not([readonly]):not(:disabled),select:not(:disabled),button[type=submit]:not(:disabled)')){input.dataset.lockDisabled='true';input.disabled=true;}}
  let output=scope.element.querySelector<HTMLElement>(':scope > [data-collaboration-message],:scope > .form-dialog-body > [data-collaboration-message]');
  if(!output){output=document.createElement('div');output.dataset.collaborationMessage='';output.className='collaboration-message';output.setAttribute('role','status');(scope.element.querySelector(':scope > .form-dialog-body')??scope.element).prepend(output);}
  output.replaceChildren(document.createTextNode(message));
  if(retry){const button=document.createElement('button');button.type='button';button.textContent='重新取得编辑权';button.className='business-action-secondary';button.addEventListener('click',()=>{lost.delete(scope.resource);void ensure(scope,true).catch(error=>show(scope,error.message,true));});output.append(button);}
 };
 const ensure=(scope:Scope,explicit=false):Promise<void>=>{
  if(lost.has(scope.resource)&&!explicit)return Promise.reject(new Error('编辑已中断，请重新取得编辑权并核对最新记录。'));
  const known=aliases.get(scope.resource);if(!explicit&&known?.some(key=>leases.has(key)&&Date.parse(leases.get(key)!.expiresAt)<=Date.now())){lost.add(scope.resource);return Promise.reject(new Error('编辑已中断，请重新取得编辑权并核对最新记录。'));}if(known?.every(key=>leases.has(key)&&Date.parse(leases.get(key)!.expiresAt)>Date.now()+1000))return Promise.resolve();
  const running=pending.get(scope.resource);if(running)return running;
  scope.element.dataset.editLock='pending';const loading=setTimeout(()=>show(scope,'正在取得编辑权…'),500);
  const request=(async()=>{const result=await json('/api/collaboration/locks','POST',{tabId,resources:[scope.resource]});const keys:string[]=[];if(explicit)lost.delete(scope.resource);for(const lease of result.leases as Lease[]){if(explicit)lost.delete(lease.resource);leases.set(lease.resource,lease);sources.set(lease.resource,scope.element);keys.push(lease.resource);}aliases.set(scope.resource,keys);unblock(scope);scope.element.querySelector('[data-collaboration-message]')?.remove();scope.element.dataset.editLock='owned';})().finally(()=>{clearTimeout(loading);pending.delete(scope.resource);});pending.set(scope.resource,request);return request;
 };
 const release=async(keys:string[])=>{const tokens=Object.fromEntries(keys.flatMap(key=>leases.has(key)?[[key,leases.get(key)!.token]]:[]));if(active&&aliases.get(active.resource)?.some(key=>keys.includes(key))){active=undefined;field=null;}for(const key of keys){leases.delete(key);const element=sources.get(key);if(element)delete element.dataset.editLock;sources.delete(key);}for(const [alias,values] of aliases)if(values.some(key=>keys.includes(key)))aliases.delete(alias);if(keys.length)try{await json('/api/collaboration/locks','DELETE',{tabId,resources:keys,tokens});}catch{/* 租约会由服务器到期释放。 */}};
 function scopeFor(node:Element):Scope|undefined{
  const explicit=node.closest<HTMLElement>('[data-collaboration-resource]');
  if(explicit?.dataset.collaborationResource)return {resource:explicit.dataset.collaborationResource,label:explicit.dataset.collaborationLabel??document.querySelector('.business-toolbar__title strong')?.textContent??'当前记录',element:explicit};
  const form=node.closest<HTMLFormElement>('form');if(!form)return;
  const data=Object.fromEntries(new FormData(form).entries());
  let resource=form.dataset.scheduleId?`schedule:${form.dataset.scheduleId}`:typeof data.recordId==='string'&&data.recordId?`schedule:${data.recordId}`:form.dataset.accountPermissions?`account:${form.dataset.accountPermissions}`:typeof data.scheduleId==='string'?`schedule:${data.scheduleId}`:typeof data.campaignId==='string'?`campaign:${data.campaignId}${data.metricDate?`:day:${data.metricDate}`:''}`:'';
  if(page()==='meeting-review'&&new URL(location.href).searchParams.get('meeting'))resource=`meeting:${new URL(location.href).searchParams.get('meeting')}`;
  if(!resource)return;
  form.dataset.collaborationResource=resource;return {resource,label:document.querySelector('.business-toolbar__title strong')?.textContent??'当前记录',element:form};
 }
 const position=async(force=false)=>{
  if(document.querySelector<HTMLElement>('[data-user-role]')?.dataset.userRole!=='employee')return;
  if(!force&&Date.now()-lastPresence<1000)return;lastPresence=Date.now();
  try{await json('/api/collaboration/presence','PUT',{tabId,page:page(),resource:active&&aliases.has(active.resource)?active.resource:null,field:active&&aliases.has(active.resource)?field:null,label:active&&aliases.has(active.resource)?active.label.slice(0,120):null,visible:!document.hidden});}catch{/* 业务保存仍独立核对租约与会话。 */}
 };
 function isField(node:Element):node is HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement{return node.matches('input:not([type=hidden]):not([type=search]):not([readonly]):not(:disabled),textarea:not([readonly]):not(:disabled),select:not(:disabled)');}
 document.addEventListener('focusin',event=>{const node=event.target as Element;if(!isField(node))return;const scope=scopeFor(node);if(!scope)return;active=scope;field=(node.getAttribute('aria-label')??node.closest('label')?.childNodes[0]?.textContent??node.name??'字段').trim().slice(0,80);void ensure(scope).then(()=>position(true)).catch(error=>show(scope,error.message,true));});
 document.addEventListener('beforeinput',event=>{const node=event.target as Element;if(!isField(node))return;const scope=scopeFor(node);if(!scope)return;const keys=aliases.get(scope.resource);if(lost.has(scope.resource)){event.preventDefault();return;}if(!keys?.every(key=>leases.has(key)&&Date.parse(leases.get(key)!.expiresAt)>Date.now()))void ensure(scope).catch(error=>show(scope,error.message,true));},true);
 document.addEventListener('focusout',()=>queueMicrotask(()=>{if(!(document.activeElement instanceof Element)||!isField(document.activeElement)){field=null;void position(true);}}));
 document.addEventListener('pointerdown',event=>{const node=event.target as Element;if(!node.matches('select:not(:disabled)'))return;const scope=scopeFor(node);if(scope)void ensure(scope).catch(error=>show(scope,error.message,true));},true);
 window.fetch=async(input,init)=>{
  const target=new URL(input instanceof Request?input.url:String(input),location.href),method=String(init?.method??(input instanceof Request?input.method:'GET')).toUpperCase();
  if(target.origin!==location.origin||!target.pathname.startsWith('/api/')||target.pathname.startsWith('/api/collaboration/')||['GET','HEAD','OPTIONS'].includes(method))return baseFetch(input,init);
  let data:Record<string,unknown>={};const body=init?.body;
  try{if(body instanceof FormData)data=Object.fromEntries(body.entries());else if(typeof body==='string')data=JSON.parse(body);else if(input instanceof Request)data=input.headers.get('content-type')?.includes('application/json')?await input.clone().json():Object.fromEntries((await input.clone().formData()).entries());}catch{return baseFetch(input,init);}
  const resources=writeResources(target.pathname,method,data);if(!resources.length)return baseFetch(input,init);
  let acquired:string[]=[];
  try{
   await Promise.allSettled([...pending.values()]);
   for(const resource of resources)if(lost.has(resource))throw new Error('编辑已中断，请重新取得编辑权并核对最新数据。');
   const result=await json('/api/collaboration/locks','POST',{tabId,resources});acquired=result.leases.map((lease:Lease)=>lease.resource);if(result.leases.some((lease:Lease)=>lost.has(lease.resource))){await release(result.leases.map((lease:Lease)=>lease.resource));throw new Error('编辑已中断，请重新取得编辑权并核对最新数据。');}for(const lease of result.leases as Lease[])leases.set(lease.resource,lease);
   const headers=new Headers(init?.headers??(input instanceof Request?input.headers:undefined));headers.set('X-Edit-Tab',tabId);headers.set('X-Edit-Leases',JSON.stringify(Object.fromEntries([...leases].map(([key,value])=>[key,value.token]))));
   const response=await baseFetch(input,{...init,headers});
   await release(acquired.filter(key=>response.ok||!sources.has(key)));
   return response;
  }catch(error){await release(acquired.filter(key=>!sources.has(key)));return Response.json({code:'EDIT_CONFLICT',message:error instanceof Error?error.message:'编辑服务暂不可用，输入已保留。'},{status:409});}
 };
 const visible=(element:HTMLElement)=>element.isConnected&&element.dataset.collaborationActive!=='false'&&!element.closest('[hidden],dialog:not([open])')&&element.getClientRects().length>0;
 const releaseUnused=()=>release([...sources].filter(([key,element])=>!visible(element)||!aliases.get(element.dataset.collaborationResource??'')?.includes(key)).map(([key])=>key));
 document.addEventListener('business:editing-scope-change',()=>void releaseUnused());
 document.addEventListener('business:inspector-selection',()=>void releaseUnused());
 document.addEventListener('close',()=>void releaseUnused(),true);
 const poll=async()=>{
  if(polling||!document.querySelector('.business-console-frame'))return;polling=true;
  try{
   await releaseUnused();
   if(active&&!visible(active.element)){active=undefined;field=null;}
   await position();
   if(document.hidden||document.querySelector<HTMLElement>('[data-user-role]')?.dataset.userRole!=='admin')return;
   const {rows}=await json('/api/collaboration/presence','GET') as {rows:Presence[]};
   const moduleNames:Record<string,string>={'operations-schedule':'schedule','daily-promotion-review':'daily-promotion'};
   for(const link of document.querySelectorAll<HTMLElement>('[data-module-id]')){
    let badge=link.querySelector<HTMLElement>('[data-presence-badge]');const occupants=rows.filter(row=>row.visible&&(moduleNames[row.page]??row.page)===link.dataset.moduleId);const names=[...new Set(occupants.map(row=>row.name))];
    link.toggleAttribute('data-has-presence',names.length>0);if(!names.length){badge?.remove();continue;}if(!badge){badge=document.createElement('span');badge.dataset.presenceBadge='';badge.className='presence-badge';link.append(badge);}badge.textContent=names.length===1?names[0]:`${names.length}人`;badge.title=names.join('、');
   }
   document.querySelectorAll('[data-remote-field]').forEach(node=>node.removeAttribute('data-remote-field'));
   for(const scope of document.querySelectorAll<HTMLElement>('[data-collaboration-resource]')){
    const raw=scope.dataset.collaborationResource!,keys=aliases.get(raw)??[raw],occupants=rows.filter(row=>row.resource&&keys.some(key=>row.resource===key));let badge=scope.querySelector<HTMLElement>(':scope > [data-editor-badge]');
    if(!occupants.length){badge?.remove();scope.removeAttribute('data-remote-edit');continue;}
    if(!badge){badge=document.createElement('small');badge.dataset.editorBadge='';badge.className='editor-badge';scope.append(badge);}badge.textContent=[...new Set(occupants.map(row=>`${row.name}${row.field?' · '+row.field:''}${row.visible?'':'（后台）'}`))].join('、');scope.dataset.remoteEdit='true';for(const node of scope.querySelectorAll<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>('input,select,textarea')){const name=(node.getAttribute('aria-label')??node.closest('label')?.childNodes[0]?.textContent??node.name).trim().slice(0,80);if(occupants.some(row=>row.field===name))node.dataset.remoteField='true';}
   }
  }catch{/* 位置读取失败不改变业务内容。 */}finally{polling=false;}
 };
 setInterval(()=>void poll(),3000);
 setInterval(async()=>{if(!leases.size)return;try{await json('/api/collaboration/locks','PATCH',{tabId,tokens:Object.fromEntries([...leases].map(([key,value])=>[key,value.token]))});for(const lease of leases.values())lease.expiresAt=new Date(Date.now()+60_000).toISOString();}catch(error){for(const [key,element] of sources){const scope={resource:element.dataset.collaborationResource??key,label:'当前记录',element};lost.add(key);lost.add(scope.resource);show(scope,error instanceof Error?error.message:'编辑已中断',true);}leases.clear();aliases.clear();}},15000);
 document.addEventListener('visibilitychange',()=>{void position(true);if(!document.hidden)void poll();});
 document.addEventListener('astro:before-swap',()=>{void release([...leases.keys()]);active=undefined;field=null;});
 document.addEventListener('astro:page-load',()=>{active=undefined;field=null;void position(true);void poll();});
 window.addEventListener('pagehide',()=>{void baseFetch('/api/collaboration/locks',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({tabId,resources:[...leases.keys()],tokens:Object.fromEntries([...leases].map(([key,value])=>[key,value.token]))}),keepalive:true});});
 void position(true);void poll();
}
