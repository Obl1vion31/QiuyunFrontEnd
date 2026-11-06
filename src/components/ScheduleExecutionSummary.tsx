import type {ScheduleComparison} from '../db/schedule-baseline';
import {businessDateTime,businessDate} from '../scripts/business-date';
import {weekOf} from '../db/monthly-plan-types';
import '../styles/schedule-comparison.css';

const time=(value:string|null)=>value?businessDateTime(value):'—';
export function ScheduleComparisonTable({value,groupByWeek=false}:{value:ScheduleComparison;groupByWeek?:boolean}){
 const rows=groupByWeek?[...value.rows].sort((a,b)=>weekOf(businessDate(a.originalAt??a.plannedAt??a.actualAt!))-weekOf(businessDate(b.originalAt??b.plannedAt??b.actualAt!))):value.rows;
 return <div className="plan-comparison-table"><table><colgroup><col className="plan-comparison-title-col"/><col span={3} className="plan-comparison-date-col"/><col className="plan-comparison-change-col"/></colgroup><thead><tr><th>帖子／版本</th><th>V0应发时间</th><th>调整后应发时间</th><th>实发时间</th><th>变动与原因</th></tr></thead><tbody>{rows.map((row,index)=><Rows key={row.id} row={row} showWeek={groupByWeek&&(index===0||weekOf(businessDate(rows[index-1].originalAt??rows[index-1].plannedAt??rows[index-1].actualAt!))!==weekOf(businessDate(row.originalAt??row.plannedAt??row.actualAt!)))}/>)}{!rows.length&&<tr><td colSpan={5}>当前范围暂无排期记录</td></tr>}</tbody></table></div>;
}
function Rows({row,showWeek}:{row:ScheduleComparison['rows'][number];showWeek:boolean}){
 const name=<>{row.name}{row.versionNumber!=null&&<small> V{row.versionNumber}</small>}</>;
 return <>{showWeek&&<tr className="plan-comparison-week"><th colSpan={5}>Week {weekOf(businessDate(row.originalAt??row.plannedAt??row.actualAt!))}</th></tr>}<tr>
  <td>{row.cancelled?<span>{name}</span>:<a href={'/business/operations-schedule?display=ledger&row='+row.id} target="_blank" rel="noreferrer" data-surface-press="directional">{name}</a>}{row.subjectName&&<span className="plan-comparison-meta">{row.subjectName}{row.categoryName?' · '+row.categoryName:''}</span>}</td>
  <td>{time(row.originalAt)}</td><td>{row.cancelled?'已取消':time(row.plannedAt)}</td><td>{time(row.actualAt)}</td>
  <td><span className={row.missing?'plan-comparison-warning':undefined}>{row.flags.join(' · ')}</span>{row.history.length>0&&<details className="plan-comparison-changes"><summary>调整记录 ({row.history.length})</summary>{row.history.map((h,index)=><p key={index}><span>{businessDateTime(h.at)} · {h.actor}</span>{h.before?.plannedAt!==h.after?.plannedAt&&<span>{time(h.before?.plannedAt as string|null)} → {time(h.after?.plannedAt as string|null)}</span>}{h.reason&&<span>{h.reason}</span>}</p>)}</details>}</td>
 </tr></>;
}
export default function ScheduleExecutionSummary({value,weekly=false,title}:{value:ScheduleComparison;weekly?:boolean;title?:string}){
 return <section className={'plan-comparison '+(weekly?'weekly-paper':'monthly-section')} data-schedule-comparison>
 <div className="plan-comparison-overview"><h2>{title??(weekly?'本期排期执行核对':'全月排期对照')}</h2>
 {weekly?<p className="plan-comparison-counts"><span>V0原应发 <b>{value.original??'—'}</b> 篇</span><span>调整后应发 <b>{value.current}</b> 篇</span><span>区间实发 <b>{value.published}</b> 篇</span></p>
 :<p className="plan-comparison-counts"><span>当前应发 <b>{value.current}</b> 篇</span>{value.original!=null?<span className="plan-comparison-formula">＝ V0原计划 {value.original} ＋ 新增 {value.added} − 删减 {value.removed}</span>:<span className="plan-comparison-meta">尚无可用V0基准</span>}<span>实发 <b>{value.published}</b> 篇</span></p>}
 <span className={value.missing?'plan-comparison-warning':'plan-comparison-meta'}>到期未登记 <b>{value.missing}</b> 篇</span>
 </div>
 <details className="plan-comparison-details"><summary>查看计划与发布明细 ({value.rows.length})</summary><ScheduleComparisonTable value={value}/></details>
 </section>;
}
