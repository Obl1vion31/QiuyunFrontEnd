import {businessConfirm,closeBusinessDialog} from './business-dialog';
function initialize(){
 const root=document.querySelector<HTMLElement>('[data-account-management]');if(!root||root.dataset.ready)return;root.dataset.ready='true';
 const dialog=root.querySelector<HTMLDialogElement>('[data-account-editor]')!,form=dialog.querySelector<HTMLFormElement>('form')!,input=form.elements.namedItem('value') as HTMLInputElement;
 let row:HTMLElement,action:string,busy=false;
 const send=async(target:HTMLElement,payload:Record<string,unknown>)=>{
  const out=target.querySelector('output')!;busy=true;
  try{const response=await fetch(`/api/admin/accounts/${target.dataset.accountId}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({...payload,expectedUpdatedAt:target.dataset.accountUpdated})});const data=await response.json();if(!response.ok)throw new Error(data.message);target.dataset.accountUpdated=data.updatedAt;if(data.signedOut){document.documentElement.dataset.unsaved='false';location.assign('/login');return;}
   if(payload.action==='rename')target.querySelector('[data-account-name]')!.textContent=String(payload.name);
   if(payload.action==='status'){const enabled=!!payload.enabled;target.querySelector('[data-account-status]')!.textContent=enabled?'已启用':'已停用';const button=target.querySelector<HTMLElement>('[data-account-action=status]')!;button.dataset.enabled=String(enabled);button.textContent=enabled?'停用':'恢复';}
   out.textContent=payload.action==='rename'?`显示姓名已保存，登录账号仍为 ${target.dataset.accountUsername}。`:'已保存';form.dataset.dirty='false';document.documentElement.dataset.unsaved='false';await closeBusinessDialog(dialog);input.value='';
  }catch(error){const message=error instanceof Error?error.message:'保存失败，输入已保留';out.textContent=message;if(dialog.open)form.querySelector('output')!.textContent=message;}finally{busy=false;}
 };
 root.addEventListener('click',async event=>{const button=(event.target as Element).closest<HTMLButtonElement>('[data-account-action]');if(!button||busy)return;row=button.closest<HTMLElement>('[data-account-id]')!;action=button.dataset.accountAction!;const name=row.querySelector('[data-account-name]')!.textContent;
  if(action==='rename'||action==='resetPassword'){const password=action==='resetPassword';dialog.querySelector('h2')!.textContent=password?`重置 ${name} 的密码`:'修改显示姓名';form.querySelector('[data-account-field]')!.firstChild!.textContent=password?'新密码':'显示姓名';input.type=password?'password':'text';input.minLength=password?6:1;input.maxLength=password?128:40;input.autocomplete=password?'new-password':'off';input.value=password?'':name??'';form.querySelector('output')!.textContent='';const note=dialog.querySelector<HTMLElement>('[data-account-editor-note]')!;note.textContent=password?'重置后，该账号已登录的浏览器将退出。':`此处只修改显示姓名，登录时仍使用 ${row.dataset.accountUsername}。`;note.hidden=false;dialog.dataset.collaborationResource=`account:${row.dataset.accountId}`;form.dataset.collaborationResource=dialog.dataset.collaborationResource;form.dataset.dirty='false';dialog.showModal();input.focus();return;}
  const enabled=button.dataset.enabled!=='true';if(await businessConfirm(action==='status'?`${enabled?'恢复':'停用'} ${name}？${enabled?'恢复后需要重新登录。':'该账号现有登录将立即退出。'}`:`撤销 ${name} 的全部登录？`,{title:'账号管理',confirmLabel:'确认操作',cancelLabel:'取消'}))await send(row,{action,...(action==='status'?{enabled}:{})});
 });
 input.addEventListener('input',()=>{form.dataset.dirty='true';document.documentElement.dataset.unsaved='true';});
 const close=async()=>{if(busy)return;if(form.dataset.dirty==='true'&&!await businessConfirm('输入尚未保存，是否放弃？'))return;form.dataset.dirty='false';document.documentElement.dataset.unsaved='false';await closeBusinessDialog(dialog);input.value='';};
 root.querySelectorAll('[data-account-close]').forEach(button=>button.addEventListener('click',()=>void close()));dialog.dataset.dialogCancelManaged='true';dialog.addEventListener('cancel',event=>{event.preventDefault();void close();});
 form.addEventListener('submit',async event=>{event.preventDefault();if(busy)return;if(action==='resetPassword'&&!await businessConfirm('重置密码并撤销该账号的全部登录？',{title:'重置密码',confirmLabel:'确认重置',cancelLabel:'继续编辑'}))return;await send(row,{action,...(action==='rename'?{name:input.value}:{password:input.value})});});
}
document.addEventListener('astro:page-load',initialize);initialize();
