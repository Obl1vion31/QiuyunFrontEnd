import type {MonthlyWorkspace} from '../db/monthly-workspace';
import type {PrivateCounts} from '../db/monthly-plan-types';
import {privateCostChange,privateFields} from '../db/monthly-private-sources';
import '../styles/private-sources.css';

export type PrivateView=MonthlyWorkspace['privateData'];
export const privateMoney=(value:number|null|undefined)=>value==null?'—':`¥${value.toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const count=(value:number|null)=>value===null?'—':value.toLocaleString('zh-CN');
export function PrivateCostChange({value,previous}:{value:number|null;previous:number|null}){
 const change=privateCostChange(value,previous);if(!change)return null;
 const sign=change.amount>0?'+':change.amount<0?'−':'';
 return <span className="ps-change" data-direction={change.amount>0?'up':change.amount<0?'down':'same'} aria-label={`较上月${change.amount===0?'持平':change.amount>0?'增加':'减少'}${privateMoney(Math.abs(change.amount))}${change.percent===null?'':`，${Math.abs(change.percent)}%`}`}>
  <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6"><path d={change.amount>0?'M8 13V3m-4 4 4-4 4 4':change.amount<0?'M8 3v10m-4-4 4 4 4-4':'M3 8h10'}/></svg>
  <span>{change.amount===0?'持平':`${sign}${privateMoney(Math.abs(change.amount))}`}</span>{change.percent!==null&&change.amount!==0&&<span>({sign}{Math.abs(change.percent).toFixed(1)}%)</span>}
 </span>;
}
export function PromotionPrivateTotals({value,previous}:{value:PrivateView;previous?:PrivateView}){
 const valid=!!value.sourceData,prior=previous?.sourceData?previous:undefined;
 const fields=[{label:'推广总消耗',value:value.totalSpend,previous:prior?.totalSpend??null},...privateFields.map((key,i)=>({label:['私域增加成本','课程意向成本','成交成本'][i],value:valid?value.totalCosts[key]:null,previous:prior?.totalCosts[key]??null}))];
 return <dl className="ps-totals" aria-label="推广来源成本总计">{fields.map(field=><div key={field.label}><dt>{field.label}</dt><dd><strong>{privateMoney(field.value)}</strong></dd><dd className="ps-total-change"><PrivateCostChange value={field.value} previous={field.previous}/></dd></div>)}</dl>;
}
function CostCells({spend,counts,costs,previous}:{spend:number|null;counts:PrivateCounts;costs:PrivateCounts;previous?:{spend:number|null;costs:PrivateCounts}}){
 return <><td><div className="ps-value"><strong>{privateMoney(spend)}</strong></div><PrivateCostChange value={spend} previous={previous?.spend??null}/></td>{privateFields.map(key=><td key={key}><div className="ps-value"><strong>{privateMoney(costs[key])}</strong><span className="ps-basis">{count(counts[key])} 人</span></div><PrivateCostChange value={costs[key]} previous={previous?.costs[key]??null}/></td>)}</>;
}
export function PrivateSourceResults({value,previous,summaryOnly=false}:{value:PrivateView;previous?:PrivateView;summaryOnly?:boolean}){
 if(!value.sourceData)return null;
 const prior=previous?.sourceData?previous:undefined;
 return <div className="private-source-results" data-private-format="sources">
  {!summaryOnly&&<PromotionPrivateTotals value={value} previous={prior}/>}
  <section className="ps-group" aria-label="推广来源"><header><h3>推广来源</h3><span>{value.unmapped>0?`${privateMoney(value.unmapped)} 待归类`:prior?'成本变化较上月':'按学科与用途归集'}</span></header>
   <div className="ps-table-scroll" role="region" aria-label="推广来源成本明细" tabIndex={0}><table className="ps-promotion-table"><thead><tr><th scope="col">学科／用途</th><th scope="col">实际消耗</th><th scope="col">私域增加成本</th><th scope="col">课程意向成本</th><th scope="col">成交成本</th></tr></thead>
    {value.subjects.map(subject=>{const old=prior?.subjects.find(s=>s.id===subject.id);return <tbody key={subject.id} className="ps-subject"><tr className="ps-subtotal"><th scope="row">{subject.name}<span>学科小计</span></th><CostCells spend={subject.spend} counts={subject.counts} costs={subject.costs} previous={old}/></tr>{subject.demands.map(demand=><tr key={demand.demand} data-source-key={`${subject.id}:${demand.demand}`}><th scope="row">{demand.label}</th><CostCells {...demand} previous={old?.demands.find(d=>d.demand===demand.demand)}/></tr>)}</tbody>;})}
    {!value.subjects.length&&<tbody><tr><td colSpan={5} className="ps-empty">本月尚无推广来源记录</td></tr></tbody>}
   </table></div>
  </section>
  <section className="ps-group" aria-label="非推广来源"><header><h3>非推广来源</h3></header><div className="ps-table-scroll" role="region" aria-label="非推广来源人数明细" tabIndex={0}><table className="ps-organic-table"><thead><tr><th scope="col">学科</th><th scope="col">细分来源</th><th scope="col">私域增加人数</th><th scope="col">课程意向人数</th><th scope="col">成交人数</th></tr></thead><tbody>{value.sourceData.nonPromotion.map(row=><tr key={row.id} data-organic-id={row.id}><th scope="row">{sourceSubjectName(row.subjectId,value)}</th><td>{row.source}</td>{privateFields.map(key=><td key={key}>{count(row[key])}</td>)}</tr>)}{!value.sourceData.nonPromotion.length&&<tr><td colSpan={5} className="ps-empty">本月尚无非推广来源记录</td></tr>}</tbody></table></div></section>
  {value.sourceData.note&&<p className="monthly-note">{value.sourceData.note}</p>}
 </div>;
}
function sourceSubjectName(id:string,value:PrivateView){return value.subjectNames?.[id]??value.subjects.find(s=>s.id===id)?.name??id;}
