import {businessConfirm,closeBusinessDialog} from './business-dialog';
type Account={id:string;username:string;name:string;role:string;enabled:boolean;updatedAt:string};
function initialize(){
 const root=document.querySelector<HTMLElement>('[data-account-management]');if(!root||root.dataset.ready)return;root.dataset.ready='true';
 const dialog=root.querySelector<HTMLDialogElement>('[data-account-editor]')!,form=dialog.querySelector<HTMLFormElement>('form')!,input=form.elements.namedItem('value') as HTMLInputElement;
 const createDialog=root.querySelector<HTMLDialogElement>('[data-account-create-dialog]')!,createForm=createDialog.querySelector<HTMLFormElement>('form')!;
 let row:HTMLElement,action:string,busy=false;
 function renderAccount(target:HTMLElement,account:Account){
  target.dataset.accountId=account.id;target.dataset.accountUsername=account.username;target.dataset.accountUpdated=account.updatedAt;
  target.dataset.collaborationResource=`account:${account.id}`;target.dataset.collaborationLabel=account.name;
  target.querySelector('[data-account-login]')!.textContent=account.username;target.querySelector('[data-account-name]')!.textContent=account.name;
  target.querySelector('[data-account-role]')!.textContent=account.role==='admin'?'管理员':'员工';target.querySelector('[data-account-status]')!.textContent=account.enabled?'已启用':'已停用';
 }
 async function finish(target:HTMLDialogElement){const f=target.querySelector<HTMLFormElement>('form')!;f.dataset.dirty='false';document.documentElement.dataset.unsaved='false';await closeBusinessDialog(target);f.reset();}
 function pending(f:HTMLFormElement,value:boolean){busy=value;f.querySelector<HTMLButtonElement>('[type=submit]')!.disabled=value;}
 const send=async(target:HTMLElement,payload:Record<string,unknown>)=>{
  const out=target.querySelector('output')!;pending(form,true);
  try{const response=await fetch(`/api/admin/accounts/${target.dataset.accountId}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({...payload,expectedUpdatedAt:target.dataset.accountUpdated})});const data=await response.json();if(!response.ok)throw new Error(data.message);target.dataset.accountUpdated=data.updatedAt;
   if(data.signedOut){document.documentElement.dataset.unsaved='false';location.assign('/login');return;}
   if(payload.action==='rename'){target.querySelector('[data-account-name]')!.textContent=String(payload.name).trim();target.dataset.collaborationLabel=String(payload.name).trim();}
   if(payload.action==='updateUsername'){target.dataset.accountUsername=data.username;target.querySelector('[data-account-login]')!.textContent=data.username;}
   if(payload.action==='status'){const enabled=!!payload.enabled;target.querySelector('[data-account-status]')!.textContent=enabled?'已启用':'已停用';const button=target.querySelector<HTMLElement>('[data-account-action=status]')!;button.dataset.enabled=String(enabled);button.textContent=enabled?'停用':'恢复';}
   out.textContent=payload.action==='rename'||payload.action==='updateUsername'?'已保存，可使用账号或用户名登录。':'已保存';if(dialog.open)await finish(dialog);
  }catch(error){const message=error instanceof Error?error.message:'保存失败，输入已保留';out.textContent=message;if(dialog.open)form.querySelector('output')!.textContent=message;}finally{pending(form,false);}
 };
 root.addEventListener('click',async event=>{
  const el=event.target as Element;
  if(el.closest('[data-account-create]')){if(busy)return;createForm.reset();createForm.dataset.dirty='false';createForm.querySelector('output')!.textContent='';createForm.querySelector<HTMLElement>('[data-account-admin-note]')!.hidden=true;createDialog.showModal();createForm.querySelector<HTMLInputElement>('input')!.focus();return;}
  const button=el.closest<HTMLButtonElement>('[data-account-action]');if(!button||busy)return;
  row=button.closest<HTMLElement>('[data-account-id]')!;action=button.dataset.accountAction!;const name=row.querySelector('[data-account-name]')!.textContent;
  if(['rename','updateUsername','resetPassword'].includes(action)){
   const password=action==='resetPassword',username=action==='updateUsername';
   dialog.querySelector('h2')!.textContent=password?`重置 ${name} 的密码`:username?'修改登录账号':'修改用户名';
   form.querySelector('[data-account-field]')!.firstChild!.textContent=password?'新密码':username?'登录账号':'用户名';
   input.type=password?'password':'text';input.minLength=password?6:username?3:1;input.maxLength=password?128:username?30:40;input.autocomplete=password?'new-password':'off';
   if(username)input.pattern='[A-Za-z0-9_]{3,30}';else input.removeAttribute('pattern');input.value=password?'':username?row.dataset.accountUsername??'':name??'';form.querySelector('output')!.textContent='';
   dialog.querySelector<HTMLElement>('[data-account-editor-note]')!.textContent=password?'重置后，该账号已登录的浏览器将退出。':username?'3–30 位英文字母、数字或下划线。修改后使用新账号或用户名登录，现有登录和历史记录保留。':'可使用完整用户名或登录账号登录。用户名不能与他人的用户名或账号重复。';
   dialog.dataset.collaborationResource=`account:${row.dataset.accountId}`;form.dataset.collaborationResource=dialog.dataset.collaborationResource;form.dataset.dirty='false';dialog.showModal();input.focus();return;
  }
  const enabled=button.dataset.enabled!=='true';if(await businessConfirm(action==='status'?`${enabled?'恢复':'停用'} ${name}？${enabled?'恢复后需要重新登录。':'该账号现有登录将立即退出。'}`:`撤销 ${name} 的全部登录？`,{title:'账号管理',confirmLabel:'确认操作',cancelLabel:'取消'}))await send(row,{action,...(action==='status'?{enabled}:{})});
 });
 for(const target of [dialog,createDialog]){
  const f=target.querySelector<HTMLFormElement>('form')!;
  f.addEventListener('input',()=>{f.dataset.dirty='true';document.documentElement.dataset.unsaved='true';});
  const close=async()=>{if(busy)return;if(f.dataset.dirty==='true'&&!await businessConfirm('输入尚未保存，是否放弃？'))return;await finish(target);};
  target.querySelectorAll('[data-account-close]').forEach(button=>button.addEventListener('click',()=>void close()));target.dataset.dialogCancelManaged='true';target.addEventListener('cancel',event=>{event.preventDefault();void close();});
 }
 form.addEventListener('submit',async event=>{event.preventDefault();if(busy)return;if(action==='resetPassword'&&!await businessConfirm('重置密码并撤销该账号的全部登录？',{title:'重置密码',confirmLabel:'确认重置',cancelLabel:'继续编辑'}))return;await send(row,{action,...(action==='rename'?{name:input.value}:action==='updateUsername'?{username:input.value}:{password:input.value})});});
 createForm.querySelector('select')!.addEventListener('change',()=>{createForm.querySelector<HTMLElement>('[data-account-admin-note]')!.hidden=(createForm.elements.namedItem('role') as HTMLSelectElement).value!=='admin';});
 createForm.addEventListener('submit',async event=>{
  event.preventDefault();if(busy)return;pending(createForm,true);
  try{
   const response=await fetch('/api/admin/accounts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.fromEntries(new FormData(createForm)))}),data=await response.json();if(!response.ok)throw new Error(data.message);
   const template=root.querySelector<HTMLTemplateElement>('[data-account-row-template]')!,target=template.content.firstElementChild!.cloneNode(true) as HTMLElement;renderAccount(target,data.account);root.querySelector('tbody')!.append(target);target.querySelector('output')!.textContent='账号已创建';await finish(createDialog);target.querySelector<HTMLButtonElement>('button')!.focus();
  }catch(error){createForm.querySelector('output')!.textContent=error instanceof Error?error.message:'创建失败，输入已保留。';}finally{pending(createForm,false);}
 });
}
document.addEventListener('astro:page-load',initialize);initialize();
