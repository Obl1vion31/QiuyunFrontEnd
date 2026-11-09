import type {WeeklyReportMetrics} from '../db/meeting-report-metrics';
import {SparkTrend,ReportChange,reportMoney} from './ReportCharts';
export default function WeeklyResultOverview({data}:{data:WeeklyReportMetrics}){
 const fields=[['posts','已登记投放帖子','篇'],['spend','本期总消耗','¥'],['actualOpenCost','实际开口成本','¥'],['actualLeadCost','实际留资成本','¥']] as const;
 return <div className="report-weekly-overview"><p className="report-period">{data.current.from}—{data.current.through}<span>较前期 {data.previous.from}—{data.previous.through}</span></p><div className="report-kpis" data-wide-values={fields.some(([key,,unit])=>unit==='¥'&&reportMoney(data.current[key]).length>9)||undefined}>{fields.map(([key,label,unit])=>{
  const latest=data.weeks.findLastIndex(week=>week[key]!=null);
  return <section className={'report-kpi report-kpi-'+key} key={key}><h3>{label}</h3><strong>{unit==='¥'?reportMoney(data.current[key]):data.current[key]?.toLocaleString('zh-CN')}<small>{unit==='篇'?'篇':''}</small></strong><ReportChange value={data.current[key]} previous={data.previous[key]} unit={unit} sense={key==='actualOpenCost'||key==='actualLeadCost'?'lower':'neutral'}/><SparkTrend points={data.weeks.map((week,index)=>({...week,value:week[key],current:index===latest}))} label="近4周"/></section>;
 })}</div>{data.current.missing.length>0&&<p className="report-data-gap">已登记数据 · 待补 {new Set(data.current.missing.map(m=>m.scheduleId)).size} 篇／{data.current.missing.length} 条日度记录</p>}</div>;
}
