import type {BusinessOperation,BusinessPermissions} from '../auth/business-capabilities';
export const businessPermissions=()=>JSON.parse(document.querySelector('#business-permissions')?.textContent??'{}') as BusinessPermissions;
const stageAllows=(operation:BusinessOperation)=>{
 const panel=document.querySelector<HTMLElement>('[data-arrangement-stage]'),stage=panel?.dataset.arrangementStage;
 if(operation==='schedule.delete'&&panel?.dataset.arrangementRole==='employee')return false;
 return !(stage==='closed'&&['schedule.create','schedule.revise','schedule.reschedule','schedule.overdueReschedule'].includes(operation));
};
export const mayOperate=(operation:BusinessOperation)=>stageAllows(operation)&&['direct','review'].includes(businessPermissions()[operation]);
export function applyBusinessPermissions(root:ParentNode=document){
  const permissions=businessPermissions();
  root.querySelectorAll<HTMLButtonElement>('[data-calendar-new]').forEach(button=>button.disabled=!mayOperate('schedule.create'));
  root.querySelectorAll<HTMLElement>('[data-business-operation]').forEach(node=>{
    const keys=node.dataset.businessOperation!.split(' ') as BusinessOperation[];
    const allowed=node.hasAttribute('data-business-any')?keys.some(key=>permissions[key]!=='disabled'):keys.every(key=>permissions[key]!=='disabled');
    node.hidden=!allowed||keys.includes('schedule.delete')&&!stageAllows('schedule.delete');
    if(node instanceof HTMLButtonElement)node.disabled=!allowed||!(node.hasAttribute('data-business-any')?keys.some(key=>stageAllows(key)):keys.every(key=>stageAllows(key)));
  });
}
document.addEventListener('astro:page-load',()=>applyBusinessPermissions());
document.addEventListener('business:inspector-render',()=>applyBusinessPermissions());
applyBusinessPermissions();
