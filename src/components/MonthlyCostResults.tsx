import type {MonthlyWorkspace,MonthlyCostHistoryPoint} from '../db/monthly-workspace';
import {PrivateCostChange,privateMoney} from './PrivateSourceResults';
import {SparkTrend} from './ReportCharts';
import '../styles/monthly-cost-results.css';

type Core=MonthlyWorkspace['core'];
type CostKey='actualOpenCost'|'actualLeadCost'|'added'|'consulted'|'converted';
const costs:Array<{key:CostKey;label:string}>=[
 {key:'actualOpenCost',label:'开口成本'},{key:'actualLeadCost',label:'留资成本'},
 {key:'added',label:'私域增加成本'},{key:'consulted',label:'课程意向成本'},{key:'converted',label:'成交成本'},
];
const count=(n:number|null)=>n===null?'—':n.toLocaleString('zh-CN');
export function MonthlyCostResults({core}:{core:Core}){
 const {privateData:p,comparison:c}=core;
 const fields=[
  {label:'推广总消耗',value:core.spend.spend,previous:c?.spend.spend??null,basis:''},
  ...costs.map(({key,label})=>{
   const platform=key==='actualOpenCost'||key==='actualLeadCost';
   return {label,value:platform?core.spend[key]:p.sourceData?p.totalCosts[key]:null,
    previous:platform?c?.spend[key]??null:c?.privateData.sourceData?c.privateData.totalCosts[key]:null,
    basis:platform?`${key==='actualOpenCost'?'实际开口':'实际留资'} ${count(key==='actualOpenCost'?core.spend.actualOpenCount:core.spend.actualLeadCount)} 人`:p.sourceData&&p.data.total[key]!==null?`${count(p.data.total[key])} 人`:''};
  }),
 ];
 return <div className="monthly-cost-results" data-monthly-cost-results>
  {c&&fields.some(field=>field.value!==null&&field.previous!==null)&&<p className="mc-comparison">变化较上月 <time>{c.month}</time></p>}
  <dl className="mc-metrics" aria-label="月度成本结果">{fields.map(field=><div key={field.label} data-cost-metric={field.label}>
   <dt>{field.label}</dt><dd className="mc-value">{privateMoney(field.value)}</dd>
   {(field.basis||field.value!==null&&field.previous!==null)&&<dd className="mc-evidence">{field.basis&&<span>{field.basis}</span>}<PrivateCostChange value={field.value} previous={field.previous}/></dd>}
  </div>)}</dl>
  {core.costHistory&&<MonthlyCostTrends month={core.month} points={core.costHistory}/>}
 </div>;
}
function MonthlyCostTrends({month,points}:{month:string;points:MonthlyCostHistoryPoint[]}){
 if(!points.some(point=>costs.some(({key})=>point[key]!==null)))return null;
 const chart=({key,label}:{key:CostKey;label:string})=>{
  const known=points.flatMap(p=>p[key]===null?[]:[p[key]!]),latest=points.at(-1);
  const min=Math.min(...known),max=Math.max(...known);
  return <article key={key} className="mc-trend" data-monthly-cost-trend={key}><header><h4>{label}</h4><span>{known.length?(min===max?privateMoney(min):`${privateMoney(min)} — ${privateMoney(max)}`):'暂无已登记数据'}</span></header>
   {known.length>0&&<SparkTrend key={month} motionKey={month} plotHeight={120} interactive axis="month" label={label} points={points.map(point=>({from:point.from,through:point.through,key:point.month,label:point.month+(point.inProgress?' · 进行中':''),value:point[key],valueLabel:privateMoney(point[key]),current:point.month===month}))}/>}
   {latest?.inProgress&&<span className="mc-progress">{month} 进行中</span>}
  </article>;
 };
 return <section className="mc-trends" aria-label="近六个月成本趋势"><header><h3>成本趋势</h3><span>近6个月 · 按自然月</span></header><div className="mc-platform-trends">{costs.slice(0,2).map(chart)}</div><div className="mc-private-trends">{costs.slice(2).map(chart)}</div></section>;
}
