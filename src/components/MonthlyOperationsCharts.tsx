import type {ReactNode} from 'react';
import type {MonthlyOperations} from '../db/monthly-operations';
import styles from './BusinessMonthlyOperations.module.css';
const money=(n:number|null)=>n==null?'—':'¥'+n.toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2});
const count=(n:number|null)=>n==null?'—':n.toLocaleString('zh-CN');
const delayColors={operational:'#b85b65',nonOperational:'#e6b6bb',unknown:'#9ba3ae'};
function ChartAction({children,className,onClick,interactive,...attributes}:{children:ReactNode;interactive:boolean;className?:string;onClick:()=>void;'aria-label'?:string;'data-publication-legend'?:string}){return interactive?<button type="button" className={className} onClick={onClick} {...attributes}>{children}</button>:<div className={className} {...attributes}>{children}</div>;}
type ChartData=Pick<MonthlyOperations,'publication'|'subjects'|'spend'|'missingRows'>;
type ChartSelect=(view:'publication'|'promotion',detail:string)=>void;
export function PublicationChart({publication:pub,onSelect}:{publication:MonthlyOperations['publication'];onSelect?:ChartSelect}){
 const distribution=pub?[{key:'onTime',label:'按时已发布',value:pub.onTime,color:'#3d8d72'},{key:'operational',label:'运营延期发布',value:pub.operationalDelayed,color:delayColors.operational},{key:'nonOperational',label:'非运营延期发布',value:pub.nonOperationalDelayed,color:delayColors.nonOperational},...(pub.unattributedDelayed?[{key:'unknown',label:'延期未归因',value:pub.unattributedDelayed,color:delayColors.unknown}]:[]),{key:'missing',label:'尚未登记',value:pub.missing,color:'#d6aa42'},{key:'pending',label:'正常待发',value:pub.pending,color:'#95acd9'}]:[];
 const legend=pub?[{key:'onTime',label:'按时已发布',value:pub.onTime,color:'#3d8d72'},{key:'delayed',label:'运营/非运营延期',value:`${pub.operationalDelayed}/${pub.nonOperationalDelayed}`,color:delayColors.operational},{key:'missing',label:'尚未登记',value:pub.missing,color:'#d6aa42'},{key:'pending',label:'正常待发',value:pub.pending,color:'#95acd9'}]:[];
 return <div className={styles.panel} data-monthly-chart="publication" data-chart-pending=""><header><h2>发布执行</h2><span>{pub.planned} 篇当前应发</span></header><p className={styles.caption}>按最新应发日期归月；尚未登记与确认延期分开。</p>
      <div className={styles.distribution} role="img" aria-label={distribution.map(d=>`${d.label}${d.value}篇`).join('，')}>{distribution.filter(d=>d.value>0).map(d=><i key={d.key} data-chart-fill data-publication-segment={d.key} style={{width:pub.planned?`${d.value/pub.planned*100}%`:'0%',background:d.color}}/>)}</div>
      <div className={styles.legend}>{legend.map(d=><ChartAction interactive={!!onSelect} key={d.key} data-publication-legend={d.key} className={d.key==='delayed'?styles.delayLegend:undefined} aria-label={d.key==='delayed'?`运营延期发布${pub.operationalDelayed}篇，非运营延期发布${pub.nonOperationalDelayed}篇${pub.unattributedDelayed?`，未归因${pub.unattributedDelayed}篇`:''}，查看全部延期明细`:undefined} onClick={()=>onSelect?.('publication',d.key)}>
       {d.key==='delayed'?<span className={styles.delaySwatches} aria-hidden="true"><i style={{background:delayColors.operational}}/><i style={{background:delayColors.nonOperational}}/></span>:<i aria-hidden="true" style={{background:d.color}}/>}
       {d.key==='delayed'?<span className={styles.delayLegendLabel}><span>运营/非运营</span><span>延期</span></span>:<span>{d.label}</span>}<b>{d.value}</b>
       {d.key==='delayed'&&pub.unattributedDelayed>0&&<small className={styles.unattributed}><i aria-hidden="true" style={{background:delayColors.unknown}}/>未归因 {pub.unattributedDelayed}</small>}
      </ChartAction>)}</div>
      <p className={styles.footnote}>本月发布量按登记的实发日期统计，可包含其他月份应发的帖子。</p>
     </div>;
}
export function InvestmentChart({data,onSelect}:{data:Pick<ChartData,'subjects'|'spend'|'missingRows'>;onSelect?:ChartSelect}){
 const spend=data.spend;
 return <div className={styles.panel} data-monthly-chart="spend" data-chart-pending=""><header><h2>投入去向</h2>{onSelect&&<button className={styles.textButton} onClick={()=>onSelect('promotion','wasted')}>查看空跑明细 →</button>}</header><p className={styles.caption}>按消耗日期归月 · 淡粉为已确认测试空跑</p>
      {data.subjects.length?<div className={styles.bars}>{data.subjects.map(subject=><ChartAction interactive={!!onSelect} key={subject.id} className={styles.barRow} onClick={()=>onSelect?.('promotion',`subject:${subject.id}`)}><span className={styles.barLabel}>{subject.name}</span><span className={styles.barTrack}><i data-chart-fill style={{width:`${subject.spend/Math.max(1,...data.subjects.map(s=>s.spend))*100}%`}}><i style={{width:subject.spend?`${subject.wasted/subject.spend*100}%`:'0%'}}/></i></span><b>{money(subject.spend)}</b></ChartAction>)}</div>:<div className={styles.empty}>本月尚无已登记推广消耗</div>}
      <div className={styles.spendFoot}><span>实际开口 <b>{count(spend.actualOpenCount)}</b> 人</span><span>实际留资 <b>{count(spend.actualLeadCount)}</b> 人</span>{onSelect?<button className={styles.textButton} onClick={()=>onSelect('promotion','gaps')}>待补 {data.missingRows.reduce((n,r)=>n+r.dates.length,0)} 条日度数据</button>:<span>待补 {data.missingRows.reduce((n,r)=>n+r.dates.length,0)} 条日度数据</span>}</div>
     </div>;
}
export default function MonthlyOperationsCharts({data,onSelect}:{data:ChartData;onSelect?:ChartSelect}){
 return <section className={styles.charts} aria-label="执行与消耗分布"><PublicationChart publication={data.publication} onSelect={onSelect}/><InvestmentChart data={data} onSelect={onSelect}/></section>;
}
