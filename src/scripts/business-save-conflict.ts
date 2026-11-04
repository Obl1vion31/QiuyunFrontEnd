import {writeResources} from '../db/collaboration-resources';
import {staleWriteCode,staleWriteMessage} from '../db/editing-policy';
import {businessConfirm,reloadBusinessPage} from './business-dialog';

declare global { interface Window { __businessSaveConflictReady?:boolean } }
if(!window.__businessSaveConflictReady){
  window.__businessSaveConflictReady=true;
  const nativeFetch=window.fetch.bind(window),blocked=new Set<string>();
  let confirming=false;
  const overlaps=(a:string,b:string)=>a===b||a.startsWith(b+':')||b.startsWith(a+':');
  const keysFor=(path:string,method:string,data:Record<string,unknown>)=>{
    if(path==='/api/monthly-private-data')return ['monthly-private:'+String(data.month)];
    if(path==='/api/monthly-cost-mapping')return ['monthly-cost-mapping'];
    const keys=writeResources(path,method,data);
    return keys.length?keys:[path];
  };
  const rejected=()=>Response.json({code:staleWriteCode,message:'记录已更新，请刷新页面后继续。当前输入尚未保存。'},{status:409});
  const confirmRefresh=async()=>{
    if(confirming)return;
    confirming=true;
    try{
      const open=document.querySelector<HTMLDialogElement>('[data-business-confirm][open]');
      if(open)await new Promise<void>(resolve=>open.addEventListener('close',()=>resolve(),{once:true}));
      if(await businessConfirm(staleWriteMessage,{title:'请刷新界面',confirmLabel:'刷新页面',dismissible:false}))reloadBusinessPage();
    }
    finally{confirming=false;}
  };
  window.fetch=async(input,init)=>{
    const url=new URL(input instanceof Request?input.url:String(input),location.href);
    const method=String(init?.method??(input instanceof Request?input.method:'GET')).toUpperCase();
    if(url.origin!==location.origin||!url.pathname.startsWith('/api/')||url.pathname.startsWith('/api/auth/')||url.pathname.startsWith('/api/collaboration/')||['GET','HEAD','OPTIONS'].includes(method))return nativeFetch(input,init);
    let data:Record<string,unknown>={};
    const body=init?.body;
    if(body instanceof FormData)data=Object.fromEntries(body.entries());
    else if(typeof body==='string'){try{data=JSON.parse(body);}catch{/* 原接口负责报告无效请求。 */}}
    else if(input instanceof Request){const request=input.clone();try{data=request.headers.get('content-type')?.includes('application/json')?await request.json():Object.fromEntries((await request.formData()).entries());}catch{/* 不读取或改写原请求正文。 */}}
    const keys=keysFor(url.pathname,method,data);
    const page=document.querySelector('.business-console-frame');
    if(keys.some(key=>[...blocked].some(old=>overlaps(old,key))))return rejected();
    const response=await nativeFetch(input,init);
    if(response.status===409&&page===document.querySelector('.business-console-frame')){
      const result=await response.clone().json().catch(()=>null);
      if(result?.code===staleWriteCode){
        for(const key of keys)blocked.add(key);
        for(const element of document.querySelectorAll<HTMLElement>('[data-collaboration-resource]'))if(keys.some(key=>overlaps(key,element.dataset.collaborationResource!)))element.dataset.staleWrite='true';
        document.dispatchEvent(new CustomEvent('business:stale-write',{detail:{keys}}));
        // 先让保存容器结束 busy 和原位错误回显，再打开确认框，确保焦点能正常返回。
        setTimeout(()=>void confirmRefresh(),0);
      }
    }
    return response;
  };
  document.addEventListener('astro:page-load',()=>blocked.clear());
}
