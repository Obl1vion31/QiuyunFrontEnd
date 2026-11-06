import type {MonthlyWorkspace,MonthlyCostHistoryPoint} from '../db/monthly-workspace';
import {PrivateCostChange,privateMoney} from './PrivateSourceResults';
import {SparkTrend} from './ReportCharts';
import '../styles/monthly-cost-results.css';

type Core=MonthlyWorkspace['core'];
type CostKey='spend'|'actualOpenCost'|'actualLeadCost'|'added'|'consulted'|'converted';
const costs:Array<{key:Exclude<CostKey,'spend'>;label:string}>=[
 {key:'actualOpenCost',label:'开口成本'},{key:'actualLeadCost',label:'留资成本'},
 {key:'added',label:'私域增加成本'},{key:'consulted',label:'课程意向成本'},{key:'converted',label:'成交成本'},
];
const count=(n:number|null)=>n===null?'—':n.toLocaleString('zh-CN');
export function MonthlyCostResults({core,summaryOnly=false}:{core:Core;summaryOnly?:boolean}){
 const p=core.privateData,c=summaryOnly?undefined:core.comparison;
 const fields=[
  {key:'spend' as const,label:'推广总消耗',value:core.spend.spend,previous:c?.spend.spend??null,basis:''},
  ...costs.map(({key,label})=>{
   const platform=key==='actualOpenCost'||key==='actualLeadCost';
   return {key,label,value:platform?core.spend[key]:p.sourceData?p.totalCosts[key]:null,
    previous:platform?c?.spend[key]??null:c?.privateData.sourceData?c.privateData.totalCosts[key]:null,
    basis:platform?`${key==='actualOpenCost'?'实际开口':'实际留资'} ${count(key==='actualOpenCost'?core.spend.actualOpenCount:core.spend.actualLeadCount)} 人`:p.sourceData&&p.data.total[key]!==null?`${count(p.data.total[key])} 人`:''};
  }),
 ];
 return <div className="monthly-cost-results" data-monthly-cost-results data-cost-summary={summaryOnly||undefined}>
  {c&&fields.some(field=>field.value!==null&&field.previous!==null)&&<p className="mc-comparison">变化较上月 <time>{c.month}</time></p>}
  <dl className="mc-metrics" aria-label="月度成本结果">{fields.map(field=><div key={field.label} data-cost-metric={field.label}>
   <dt>{field.label}</dt><dd className="mc-value">{privateMoney(field.value)}</dd>
   {(field.basis||field.value!==null&&field.previous!==null)&&<dd className="mc-evidence">{field.basis&&<span>{field.basis}</span>}<PrivateCostChange value={field.value} previous={field.previous} sense={field.key==='spend'?'neutral':'lower'}/></dd>}
   {!summaryOnly&&<MonthlyCostTrend month={core.month} metric={field.key} label={field.label} points={core.costHistory}/>}
  </div>)}</dl>
 </div>;
}
function MonthlyCostTrend({month,metric,label,points}:{month:string;metric:CostKey;label:string;points?:MonthlyCostHistoryPoint[]}){
 const first=points?.findIndex(point=>point[metric]!=null)??-1,last=points?.findLastIndex(point=>point[metric]!=null)??-1;
 const visible=points?.slice(first,last+1)??[];
 if(visible.filter(point=>point[metric]!=null).length<2)return <dd className="mc-no-trend">暂无对比数据</dd>;
 return <dd className="mc-trend" data-monthly-cost-trend={metric}>
  <SparkTrend motionKey={month} plotHeight={56} presentation="sparkline" interactive axis="month" label={label} points={visible.map(point=>({from:point.from,through:point.through,key:point.month,label:point.month+(point.inProgress?' · 进行中':''),value:point[metric]??null,valueLabel:privateMoney(point[metric]),current:point.month===month}))}/>
 </dd>;
}
