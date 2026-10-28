/** HTTP 回归按真实编辑协议取锁、写入、释放；未登录和跨站请求保持原样。 */
import {randomUUID} from 'node:crypto';
import {writeResources} from '../src/db/collaboration-resources';
export async function businessFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const url=new URL(input instanceof Request?input.url:String(input));
  const method=(init?.method??'GET').toUpperCase(),headers=new Headers(init?.headers);
  if(['GET','HEAD','OPTIONS'].includes(method)||!headers.has('Cookie')||headers.get('Origin')!==url.origin||url.pathname.startsWith('/api/collaboration/'))return globalThis.fetch(input,init);
  let data:Record<string,unknown>={};
  if(init?.body instanceof FormData)data=Object.fromEntries(init.body.entries());
  else if(typeof init?.body==='string'){try{data=JSON.parse(init.body);}catch{}}
  const resources=writeResources(url.pathname,method,data);
  if(!resources.length)return globalThis.fetch(input,init);
  const tabId=randomUUID(),collaborationHeaders={'Content-Type':'application/json',Origin:url.origin,Cookie:headers.get('Cookie')!};
  const lock=await globalThis.fetch(url.origin+'/api/collaboration/locks',{method:'POST',headers:collaborationHeaders,body:JSON.stringify({tabId,resources})});
  if(!lock.ok)return lock.status===403?lock:globalThis.fetch(input,init);
  const {leases}=await lock.json();headers.set('X-Edit-Tab',tabId);headers.set('X-Edit-Leases',JSON.stringify(Object.fromEntries(leases.map((lease:any)=>[lease.resource,lease.token]))));
  try{return await globalThis.fetch(input,{...init,headers});}
  finally{await globalThis.fetch(url.origin+'/api/collaboration/locks',{method:'DELETE',headers:collaborationHeaders,body:JSON.stringify({tabId,resources:leases.map((lease:any)=>lease.resource)})});}
}
