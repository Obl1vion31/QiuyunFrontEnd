import {useEffect,useRef,useState} from 'react';
import type {MonthlyPlanView} from '../db/monthly-plans';
import {PlanExecutionSummary} from './MonthlyMeetingSections';
type Reference={id:string;expectedRevision:number};
/** 会前核对最新执行，确认版本后再由会后定稿冻结并锁定原计划。 */
export default function MonthlyPlanReference({reference,frozen,onChange}:{reference:Reference;frozen?:MonthlyPlanView;onChange:(next:Reference)=>void}){
 const host=useRef<HTMLDivElement>(null),[plan,setPlan]=useState<MonthlyPlanView|undefined>(frozen),[error,setError]=useState('');
 async function refresh(){const target=host.current;if(!target)return;setError('');try{const {readBusiness}=await import('../scripts/business-read');const value=await readBusiness(target,async read=>{const r=await fetch('/api/monthly-plans?id='+reference.id,{signal:read.signal}),body=await r.json();if(!r.ok||!body.plan)throw new Error(body.message||'月计划不存在。');return body.plan as MonthlyPlanView;});if(value)setPlan(value);}catch(e){setError((e as Error).message);}}
 useEffect(()=>{void refresh();},[reference.id]);
 const changed=!!plan&&plan.revision!==reference.expectedRevision;
 return <div ref={host} data-monthly-reference>
  {plan?<PlanExecutionSummary plan={plan} actions={<><button type="button" onClick={()=>void refresh()}>刷新执行</button>{changed&&<button type="button" onClick={()=>onChange({id:plan.id,expectedRevision:plan.revision})}>确认引用版本 {plan.revision}</button>}</>} caption={changed?`计划已更新至版本 ${plan.revision}，请核对后确认本次引用。`:`会前执行预览 · 已引用版本 ${reference.expectedRevision} · 会后定稿将冻结本次对照`}/>:<section className="monthly-section"><h2>月计划执行预览</h2><button type="button" onClick={()=>void refresh()}>重新读取</button></section>}
  {error&&<p role="alert" className="monthly-plan-alert">{error}</p>}
 </div>;
}
