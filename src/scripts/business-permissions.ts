import type {BusinessOperation,BusinessPermissions} from '../auth/business-capabilities';
export const businessPermissions=()=>JSON.parse(document.querySelector('#business-permissions')?.textContent??'{}') as BusinessPermissions;
export const mayOperate=(operation:BusinessOperation)=>['direct','review'].includes(businessPermissions()[operation]);
export function applyBusinessPermissions(root:ParentNode=document){
  const permissions=businessPermissions();
  root.querySelectorAll<HTMLButtonElement>('[data-calendar-new]').forEach(button=>button.disabled=permissions['schedule.create']==='disabled');
  root.querySelectorAll<HTMLElement>('[data-business-operation]').forEach(node=>{
    const keys=node.dataset.businessOperation!.split(' ') as BusinessOperation[];
    const allowed=node.hasAttribute('data-business-any')?keys.some(key=>permissions[key]!=='disabled'):keys.every(key=>permissions[key]!=='disabled');
    node.hidden=!allowed;
    if(node instanceof HTMLButtonElement)node.disabled=!allowed;
  });
}
document.addEventListener('astro:page-load',()=>applyBusinessPermissions());
document.addEventListener('business:inspector-render',()=>applyBusinessPermissions());
applyBusinessPermissions();
