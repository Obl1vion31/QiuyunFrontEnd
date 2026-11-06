

import type {MonthlyWorkspace} from '../db/monthly-workspace';

import {businessDateTime} from '../scripts/business-date';
import '../styles/monthly-meeting.css';
import {PrivateSourceResults} from './PrivateSourceResults';
export {default} from './PrivateSourceEditor';
const count=(n:number|null)=>n==null?'—':n.toLocaleString('zh-CN');
const money=(n:number|null)=>n==null?'—':`¥${n.toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const fields=[['added','新增微信'],['consulted','咨询'],['converted','成交']] as const;
export function PrivateSummary({value,summaryOnly=false,previous,collapsible=false}:{summaryOnly?:boolean;value:MonthlyWorkspace['privateData'];previous?:MonthlyWorkspace['privateData'];collapsible?:boolean}){
 if(value.sourceData)return <PrivateSourceResults value={value} summaryOnly={summaryOnly} previous={previous} collapsible={collapsible}/>;
 return <div className="monthly-private-summary">{!summaryOnly&&<div className="monthly-numbers">{fields.map(([key,label])=><div key={key}><span>{label}</span><strong>{count(value.data.total[key])}<small> 人</small></strong><em>{label==='新增微信'?'加微':label}成本 {money(value.totalCosts[key])}</em></div>)}</div>}
 <p className="monthly-caption">全月全站数据，学科／分类筛选不改变本区 · 需求分类人数可重叠 · {value.updatedAt?`更新于 ${businessDateTime(value.updatedAt)}`:'尚未提供人数'}</p>
 <div className="monthly-table-scroll"><table className="monthly-subject-summary"><thead><tr><th>学科</th><th>新增加微／成本</th><th>咨询／成本</th><th>成交／成本</th><th>需求明细</th></tr></thead><tbody>{value.subjects.map(subject=><tr key={subject.id}><td><strong>{subject.name}</strong><small className="monthly-deadline">投入 {money(subject.spend)}</small></td>{fields.map(([key])=><td key={key}><strong>{count(subject.counts[key])} 人</strong><small className="monthly-deadline">{money(subject.costs[key])}</small></td>)}<td><details><summary>查看 ({subject.demands.length})</summary>{subject.demands.map(d=><div className="monthly-demand-summary" key={d.demand}><b>{d.label}</b><span>新增 {count(d.counts.added)} · 咨询 {count(d.counts.consulted)} · 成交 {count(d.counts.converted)}</span><span>咨询成本 {money(d.costs.consulted)} · 成交成本 {money(d.costs.converted)}</span></div>)}</details>{subject.unmapped>0&&<small className="monthly-deadline">{money(subject.unmapped)} 待归类</small>}</td></tr>)}</tbody></table></div>
 {value.data.note&&<p className="monthly-note">{value.data.note}</p>}</div>;
}
export function LegacyPrivateRecords({value}:{value:MonthlyWorkspace['privateData']}){
 if(value.sourceData)return null;
 const recorded=(row:{added:number|null;consulted:number|null;converted:number|null})=>[row.added,row.consulted,row.converted].some(v=>v!==null);
 if(!recorded(value.data.total)&&!value.data.rows.some(recorded)&&!value.data.note.trim())return null;
 const subjects=value.subjects.filter(subject=>value.data.rows.some(row=>row.subjectId===subject.id&&recorded(row)));
 return <details className="ps-legacy ps-legacy-records"><summary>原口径记录（未分来源）</summary><PrivateSummary value={{...value,subjects}}/></details>;
}
