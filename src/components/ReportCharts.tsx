import {useEffect,useLayoutEffect,useRef} from 'react';
import type {RefObject} from 'react';
import '../styles/report-presentation.css';
export const reportMoney=(n:number|null|undefined)=>n==null?'—':'¥'+n.toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2});
export function ReportChange({value,previous,unit='¥',label='较前期',sense='neutral'}:{value:number|null;previous:number|null;unit?:string;label?:string;sense?:'neutral'|'higher'|'lower'}){
 if(value==null||previous==null)return <span className="report-change report-muted">暂无可比数据</span>;
 const delta=Math.round((value-previous)*100)/100;
 return <span className="report-change" data-metric-sense={sense} data-direction={delta>0?'positive':delta<0?'negative':'neutral'}><svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d={delta>0?'M8 13V3m-4 4 4-4 4 4':delta<0?'M8 3v10m-4-4 4 4 4-4':'M3 8h10'}/></svg><span>{delta>0?'+':delta<0?'−':''}{unit==='¥'?reportMoney(Math.abs(delta)):Math.abs(delta).toLocaleString('zh-CN')+unit}</span><small>{label}</small></span>;
}
export interface TrendPoint {from:string;through:string;value:number|null;key?:string;label?:string;valueLabel?:string;shortLabel?:string;current?:boolean}
export function SparkTrend({points,label,currentFrom,currentThrough,compact=false,interactive=false,connectIntervals=false,axis='date',motionKey,plotHeight,presentation='default'}:{points:TrendPoint[];label:string;currentFrom?:string;currentThrough?:string;compact?:boolean;interactive?:boolean;connectIntervals?:boolean;axis?:'date'|'month'|'version';motionKey?:string;plotHeight?:number;presentation?:'default'|'sparkline'}){
 const chart=useRef<HTMLElement>(null);useReportMotion(chart,motionKey??label+points.map(p=>`${p.key??p.from}:${p.value}`).join('|'));
 if(!points.length)return <p className="report-muted">暂无已登记走势</p>;
 const known=points.filter(p=>p.value!=null),max=Math.max(1,...known.map(p=>p.value!));
 const minimum=Math.min(...known.map(p=>p.value!)),maximum=Math.max(...known.map(p=>p.value!));
 const spark=presentation==='sparkline';
 const x=(i:number)=>axis==='version'?12+i*276/Math.max(1,points.length-1):12+(Date.parse(points[i].through)-Date.parse(points[0].through))*276/Math.max(86400000,Date.parse(points.at(-1)!.through)-Date.parse(points[0].through)),y=(v:number)=>spark?(maximum===minimum?41:70-(v-minimum)/(maximum-minimum)*58):65-v/max*48;
 const active=(p:TrendPoint)=>p.current??(!!currentFrom&&p.through>=currentFrom&&p.from<=(currentThrough??'9999'));
 const description=(p:TrendPoint)=>`${p.label??`${p.from}—${p.through}`}：${p.valueLabel??p.value??'未记录'}`;
 const tick=(p:TrendPoint)=>axis==='month'?p.through.slice(0,7):axis==='version'?p.shortLabel??p.from.slice(5):p.from.slice(5);
 const popoverProps={popover:'auto'};
 let line='';points.forEach((p,i)=>{if(p.value!=null)line+=`${i&&points[i-1].value!=null&&(connectIntervals||Date.parse(p.from)-Date.parse(points[i-1].through)<=86400000)?'L':'M'}${x(i)},${y(p.value)} `;});
 let area='';
 if(spark){
  line='';let segment:Array<{x:number;y:number}>=[];
  const finish=()=>{if(!segment.length)return;let path=`M${segment[0].x},${segment[0].y} `;for(let i=1;i<segment.length;i++){const previous=segment[i-1],point=segment[i],middle=(previous.x+point.x)/2;path+=segment.length===2?`L${point.x},${point.y} `:`C${middle},${previous.y} ${middle},${point.y} ${point.x},${point.y} `;}line+=path;if(segment.length>1)area+=path+`L${segment.at(-1)!.x},78 L${segment[0].x},78 Z `;segment=[];};
  points.forEach((p,i)=>{if(p.value==null){finish();return;}segment.push({x:x(i),y:y(p.value)});});finish();
 }
 return <figure className={`report-trend${compact?' is-compact':''}${spark?' is-sparkline':''}`} data-report-chart data-report-spark data-chart-pending="" ref={chart}><div className="report-trend-plot" style={plotHeight?{height:plotHeight}:undefined}><svg viewBox="0 0 300 82" style={plotHeight?{height:'100%'}:undefined} preserveAspectRatio={plotHeight?'none':undefined} role="img" aria-label={label+'；'+points.map(description).join('；')}>{!spark&&<path className="report-axis" d="M12 65H288" vectorEffect={plotHeight?'non-scaling-stroke':undefined}/>}{spark&&<path className="report-trend-area" d={area} fill="currentColor" opacity=".07"/>}{points.map((p,i)=><g key={p.key??`${p.from}:${i}`}>{!spark&&active(p)&&<rect className="report-period-highlight" x={x(i)-8} y="8" width="16" height="60" rx="5"/>}{p.value!=null&&<circle tabIndex={interactive?undefined:0} aria-label={description(p)} cx={x(i)} cy={y(p.value)} r={active(p)?4:2.6} className={active(p)?'is-current':''}><title>{description(p)}</title></circle>}</g>)}<path className="report-trend-line" d={line} pathLength="1" data-report-line vectorEffect={plotHeight?'non-scaling-stroke':undefined}/></svg>
 {interactive&&points.map((p,i)=>p.value==null?null:<div key={p.key??`${p.from}:${i}`} className="report-trend-point" data-current={active(p)||undefined} data-business-popover data-popover-kind="reference" style={{left:`${x(i)/3}%`,top:`${y(p.value)/82*100}%`}}><button type="button" data-popover-trigger aria-label={description(p)} aria-expanded="false"/><div className="weekly-detail-popover report-trend-tooltip" data-popover-panel {...popoverProps} role="region" aria-label={description(p)}><strong>{p.label??`${p.from}—${p.through}`}</strong><p>{p.valueLabel??p.value}</p></div></div>)}
 </div>{!spark&&<figcaption><span>{tick(points[0])}</span><span>{label}</span><span>{axis==='date'?points.at(-1)!.through.slice(5):tick(points.at(-1)!)}</span></figcaption>}</figure>;
}
const useChartEffect=typeof window==='undefined'?useEffect:useLayoutEffect;
export function useReportMotion(root:RefObject<HTMLElement>,identity:string){
 useChartEffect(()=>{
  if(!root.current)return;const media=matchMedia('(prefers-reduced-motion: reduce)'),animations:Animation[]=[];
  const observer=new IntersectionObserver(entries=>{for(const e of entries)if(e.isIntersecting&&!document.hidden){observer.unobserve(e.target);if(!media.matches){e.target.querySelectorAll('[data-report-line]').forEach(n=>animations.push(n.animate([{strokeDasharray:'1',strokeDashoffset:'1'},{strokeDasharray:'1',strokeDashoffset:'0'}],{duration:500,easing:'cubic-bezier(.2,.8,.2,1)'})));e.target.querySelectorAll('[data-chart-fill]').forEach(n=>animations.push(n.animate([{transform:'scaleX(0)'},{transform:'scaleX(1)'}],{duration:500,easing:'cubic-bezier(.2,.8,.2,1)',fill:'backwards'})));e.target.querySelectorAll('[data-report-column]').forEach(n=>animations.push(n.animate([{transform:'scaleY(0)'},{transform:'scaleY(1)'}],{duration:500,easing:'cubic-bezier(.2,.8,.2,1)',fill:'backwards'})));}e.target.removeAttribute('data-chart-pending');}},{threshold:.15});
  const targets=[...(root.current.matches('[data-report-spark]')?[root.current]:[]),...root.current.querySelectorAll('[data-report-chart]:not([data-report-spark]),[data-monthly-chart]')];targets.forEach(n=>observer.observe(n));
  const resume=()=>{if(!document.hidden)targets.filter(n=>n.hasAttribute('data-chart-pending')).forEach(n=>{observer.unobserve(n);observer.observe(n);});};document.addEventListener('visibilitychange',resume);
  const reduce=()=>{if(media.matches){animations.forEach(a=>a.cancel());targets.forEach(n=>n.removeAttribute('data-chart-pending'));}};media.addEventListener('change',reduce);
  return()=>{document.removeEventListener('visibilitychange',resume);observer.disconnect();animations.forEach(a=>a.cancel());media.removeEventListener('change',reduce);};
 },[identity]);
}
