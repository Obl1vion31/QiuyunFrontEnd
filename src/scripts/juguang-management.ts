import { businessDateTime } from './business-date';
import type { JuguangCheck } from '../integrations/juguang-check-types';
function initializeJuguang() {
  document.querySelectorAll<HTMLElement>('[data-juguang-connection]').forEach(root=>{
    if (root.dataset.bound) return; root.dataset.bound='true';
    const button=root.querySelector<HTMLButtonElement>('[data-juguang-check]')!;
    const feedback=root.querySelector<HTMLOutputElement>('[data-check-feedback]')!;
    button.disabled=false;
    let request:AbortController|undefined;
    const stop=()=>request?.abort();
    document.addEventListener('astro:before-swap',stop,{once:true});
    button.addEventListener('click',async()=>{
      if(request) return;
      request=new AbortController(); const current=request;
      button.disabled=true;root.setAttribute('aria-busy','true');
      const pending=window.setTimeout(()=>{feedback.textContent='正在检查各账户的离线报表连接…';},500);
      try{
        const response=await fetch('/api/integrations/xiaohongshu/check',{method:'POST',headers:{'Content-Type':'application/json','X-Business-Feedback':'local'},signal:current.signal,body:JSON.stringify({authorizationUserId:root.dataset.juguangConnection})});
        const body=await response.json();
        clearTimeout(pending);
        if(!response.ok) throw new Error(body.message||'连接检查失败，请重试。');
        const check=body.check as JuguangCheck;
        for(const account of check.accounts){const cell=root.querySelector<HTMLElement>(`[data-advertiser="${account.advertiserId}"] [data-account-check]`);if(cell){cell.textContent=account.message;cell.dataset.checkState=account.status;}}
        feedback.textContent='上次检查：'+businessDateTime(check.checkedAt)+(check.status==='ok'?' · 全部账户读取正常':check.status==='partial'?' · 部分账户异常，请查看对应结果':check.status==='reauthorize'?' · 请重新授权':' · 检查未通过，请查看对应结果');
        // 状态和日期以服务端安全读取为准，避免在浏览器推断刷新后的令牌有效期。
        try { const stateResponse=await fetch('/api/integrations/xiaohongshu/status',{signal:current.signal});
        if(stateResponse.ok){const status=await stateResponse.json();const record=status.connections?.find((item:{authorizationUserId:string})=>item.authorizationUserId===root.dataset.juguangConnection);if(record){
          const reauthorize=record.needsReauthorization;
          const grant=root.querySelector<HTMLElement>('[data-grant-state]')!;grant.textContent=reauthorize?'需要重新授权':'授权有效';grant.classList.toggle('connection-state--attention',reauthorize);
          root.querySelector('[data-access-expiry]')!.textContent=businessDateTime(record.accessTokenExpiresAt);root.querySelector('[data-refresh-expiry]')!.textContent=businessDateTime(record.refreshTokenExpiresAt);
          root.querySelector('[data-actual-scope]')!.textContent=record.scope??'平台未返回权限信息';
          const table=root.querySelector('tbody')!;
          const allowed=new Set(record.advertisers.map((item:{advertiser_id:number})=>String(item.advertiser_id)));
          table.querySelectorAll<HTMLElement>('[data-advertiser]').forEach(row=>{if(!allowed.has(row.dataset.advertiser!))row.remove();});
          for(const account of record.advertisers){
            let row=table.querySelector<HTMLTableRowElement>(`[data-advertiser="${account.advertiser_id}"]`);
            if(!row){row=document.createElement('tr');row.dataset.advertiser=String(account.advertiser_id);for(let i=0;i<3;i++)row.append(document.createElement('td'));const code=document.createElement('code');row.cells[1].append(code);row.cells[2].dataset.accountCheck='';table.append(row);}
            row.cells[0].textContent=account.advertiser_name||'未返回账户名称';row.cells[1].firstElementChild!.textContent=String(account.advertiser_id);
            const checked=check.accounts.find(item=>item.advertiserId===account.advertiser_id);row.cells[2].textContent=checked?.message??'尚未检查';row.cells[2].dataset.checkState=checked?.status??'unknown';
          }
          root.querySelector('[data-account-title]')!.textContent=`已授权账户 (${record.advertisers.length})`;

        }} } catch (error) { if(current.signal.aborted) throw error; feedback.textContent += ' · 有效期读取失败，可刷新页面查看'; }
      }catch(error){if(!current.signal.aborted)feedback.textContent=error instanceof Error?error.message:'连接失败，请稍后重试。';}
      finally{clearTimeout(pending);request=undefined;button.disabled=false;root.removeAttribute('aria-busy');}
    });
  });
}
initializeJuguang();document.addEventListener('astro:page-load',initializeJuguang);
