import type {Database} from './client';
import {authUser} from './schema';

/** 只转换详情展示，原操作账号及审计快照保持不变。 */
export async function readHistoryPeople(db:Database){
 const people=await db.select({id:authUser.id,username:authUser.username,name:authUser.name}).from(authUser);
 return (label:string|null|undefined,id?:string|null)=>{
  if(label==='系统')return '系统';
  const person=id?people.find(p=>p.id===id):people.find(p=>p.username===label||p.name===label);
  return person?.name?.trim()||'姓名未记录';
 };
}

export function delayDaysWithNames<T extends {saved:null|{changedByLabel:string;changedById:string|null;history:Record<string,unknown>[]}}>(days:T[],name:Awaited<ReturnType<typeof readHistoryPeople>>){
 return days.map(day=>({...day,saved:day.saved?{...day.saved,changedByName:name(day.saved.changedByLabel,day.saved.changedById),history:day.saved.history.map(entry=>({...entry,changedByName:name(String(entry.changedByLabel??''),typeof entry.changedById==='string'?entry.changedById:undefined)}))}:null}));
}
