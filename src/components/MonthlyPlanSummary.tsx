import React from 'react';
import type {PlanContent,PlanItem,PlanGroup} from '../db/monthly-plan-types';
import {monthWeeks} from '../db/monthly-plan-types';
import type {MonthlyPlanView} from '../db/monthly-plans';
import {businessDateTime} from '../scripts/business-date';
import WeeklyCardDetails from './WeeklyCardDetails';

type Progress=MonthlyPlanView['items'][number];
type Candidate={id:string;name:string;plannedAt:string;actualAt:string|null};
export default function MonthlyPlanSummary({month,content,execution,candidates=[],progressKnown=true,showEmptyWeeks=true,cards=false}:{month:string;content:PlanContent;execution?:Progress[];candidates?:Candidate[];progressKnown?:boolean;showEmptyWeeks?:boolean;cards?:boolean}){
 const progress=new Map(execution?.map(item=>[item.id,item]));
 function record(item:PlanItem){
  const known=progress.get(item.id),schedule=known?.schedule??candidates.find(c=>c.id===item.scheduleId);
  const registered=schedule?!!schedule.actualAt:item.scheduleId||!progressKnown?null:false;
  return {item,known,schedule,registered};
 }
 const weeks:[number|null,string,string][]=[...monthWeeks(month).map(w=>[w.week,w.from,w.through] as [number,string,string]),...(content.items.some(i=>!i.week)?[[null,'',''] as [null,string,string]]:[])];
 return <div className={cards?'monthly-plan-summary monthly-plan-board monthly-plan-read-board':'monthly-plan-summary'} data-monthly-plan-summary>
  {weeks.filter(([week])=>showEmptyWeeks||content.items.some(item=>item.week===week)).map(([week,from,through])=>{
   const items=content.items.filter(item=>item.week===week);
   const groups=content.groups.filter(group=>items.some(item=>item.groupId===group.id));
   return <section className={cards?'monthly-week':'monthly-plan-week-summary'} key={week??'unassigned'}>
    <header><h3>{week?`Week ${week}`:'待分配'}</h3>{week&&<time>{cards?from.slice(5)+' 至 '+through.slice(5):from+'—'+through}</time>}{cards&&<b>{items.length}篇</b>}</header>
    <div className={cards?'monthly-week-items':'monthly-plan-projects'}>{groups.flatMap<{group:PlanGroup;itemId:string|null}>(group=>cards?items.filter(item=>item.groupId===group.id).map(item=>({group,itemId:item.id})):[{group,itemId:null}]).map(({group,itemId})=>{
     const rows=items.filter(item=>item.groupId===group.id&&(!itemId||item.id===itemId)).map(record),unknown=rows.some(r=>r.registered===null),pending=rows.filter(r=>r.registered===false).length;
     if(cards){const {item,known,schedule,registered}=rows[0],name=(item.kind==='carry'?'遗留 ':'新 ')+(schedule?.name??group.name);return <div className="monthly-plan-chip" data-plan-project={group.id} key={item.id}><WeeklyCardDetails readOnly boundary=".monthly-week" label={name} triggerContent={<span className="monthly-chip-name"><span className="monthly-plan-kind" data-kind={item.kind==='carry'?'carry':'new'}>{item.kind==='carry'?'遗留':'新'}</span><span className="monthly-chip-title">{schedule?.name??group.name}</span></span>}><strong>{name}</strong><div className="monthly-chip-evidence"><p>{item.kind==='carry'?'上月未登记 · 补帖':item.kind==='existing'?'本月已有排期':'本月新做'}</p><p>{schedule?'应发 '+businessDateTime(schedule.plannedAt):'尚未排期'}</p><p>{schedule?.actualAt?'已登记 '+businessDateTime(schedule.actualAt):registered===null?'登记未记录':'尚未登记'}</p>{item.scheduleId&&<a href={`/business/operations-schedule?display=ledger&row=${item.scheduleId}`} target="_blank" rel="noreferrer">原排期 ↗</a>}{known?.pending&&<p>已提交待审</p>}{known?.status==='rejected'&&<p>驳回待处理</p>}{known?.crossWeek&&<p>跨Week安排</p>}{known?.deadline&&<p>落实截止 {businessDateTime(known.deadline)}</p>}{known?.submittedAt&&<p>{known.timely?'已按时提交':'已逾时提交'}</p>}{known?.overdue&&<p>落实已超48小时</p>}{group.annualPlanId&&<a href={`/business/annual-plan?year=${month.slice(0,4)}&row=${group.annualPlanId}`} target="_blank" rel="noreferrer">年度来源 V{group.annualVersion} ↗</a>}{group.note&&<p>{group.note}</p>}{group.reason&&<p>{group.reason}</p>}{known?.reason&&<p>{known.reason}</p>}{!!known?.history.length&&<details><summary>调整记录 ({known.history.length})</summary>{known.history.map((h,i)=><p key={i}>{businessDateTime(h.at)} · {h.reason}</p>)}</details>}</div></WeeklyCardDetails></div>;}
     return <details key={itemId??group.id} className="monthly-plan-project" data-plan-project={group.id}>
      <summary><strong>{cards?(rows[0].schedule?.name??`${group.name} · ${content.items.filter(i=>i.groupId===group.id).findIndex(i=>i.id===itemId)+1}`):group.name}</strong><span>{cards?(rows[0].item.kind==='carry'?'上月遗留':rows[0].item.kind==='existing'?'已有排期':'本月新做'):<>计划 <b>{rows.length}</b> 篇</>}</span><span>{cards?(unknown?'登记未记录':pending?'尚未登记':'已登记'):<>未登记 <b>{unknown?'—':pending}</b> 篇</>}</span><span className="monthly-plan-details-action">查看详情</span></summary>
      <div className="monthly-plan-project-detail">
       {(group.note||group.reason||group.annualPlanId)&&<div className="monthly-plan-source-detail">{group.annualPlanId&&<a href={`/business/annual-plan?year=${month.slice(0,4)}&row=${group.annualPlanId}`} target="_blank" rel="noreferrer">年度来源 V{group.annualVersion} ↗</a>}{group.note&&<p>{group.note}</p>}{group.reason&&<p>{group.reason}</p>}</div>}
       <div className="monthly-table-scroll"><table><thead><tr><th>具体帖子</th><th>应发时间</th><th>发布登记</th><th>落实情况</th></tr></thead><tbody>{rows.map(({item,known,schedule,registered})=><tr key={item.id}>
        <td>{schedule?.name??`${group.name} · 名额 ${content.items.filter(i=>i.groupId===group.id).findIndex(i=>i.id===item.id)+1}`}{(schedule?.id||item.scheduleId)&&<a className="monthly-record-link" href={`/business/operations-schedule?display=ledger&row=${schedule?.id??item.scheduleId}`} target="_blank" rel="noreferrer">原排期 ↗</a>}{item.kind!=='new'&&<small className="monthly-deadline">{item.kind==='carry'?'上月遗留':'已有排期'}</small>}</td>
        <td>{schedule?businessDateTime(schedule.plannedAt):'尚未排期'}</td>
        <td>{schedule?.actualAt?businessDateTime(schedule.actualAt):registered===null?'未记录':'尚未登记'}</td>
        <td>{known?.pending?'已提交待审':known?.status==='rejected'?'驳回待处理':known?.status==='scheduled'?'已排期':schedule?'已排期':'待落实'}{known?.crossWeek&&<small className="monthly-deadline">跨Week安排</small>}{known?.submittedAt&&<small className="monthly-deadline">{known.timely?'已按时提交':'已逾时提交'}</small>}{known?.overdue&&<small className="monthly-deadline">落实已超48小时</small>}{known?.deadline&&<small className="monthly-deadline">落实截止 {businessDateTime(known.deadline)}</small>}{known?.reason&&<p>{known.reason}</p>}{!!known?.history.length&&<details><summary>调整记录 ({known.history.length})</summary>{known.history.map((h,i)=><p key={i}>{businessDateTime(h.at)} · {h.reason}</p>)}</details>}</td>
       </tr>)}</tbody></table></div>
      </div>
     </details>;
    })}{!groups.length&&!cards&&<p className="monthly-plan-empty">暂无安排</p>}</div>
   </section>;
  })}
 </div>;
}
