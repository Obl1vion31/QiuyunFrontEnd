import '../styles/metric-change.css';
import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import type {MonthlyWorkspace} from '../db/monthly-workspace';
import {PrivateSummary} from './MonthlyPrivatePanel';
import {PromotionPrivateTotals,PrivateCostChange} from './PrivateSourceResults';
import {adjacentMonth} from '../db/monthly-plan-types';
import '../styles/monthly-meeting.css';
type Core=MonthlyWorkspace['core'];
const money=(n:number|null)=>n==null?'—':`¥${n.toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const number=(n:number|null)=>n==null?'—':n.toLocaleString('zh-CN');
function Change({value,previous,amount=false}:{value:number|null;previous:number|null;amount?:boolean}){
 if(value==null||previous==null)return null;
 const difference=Math.round((value-previous)*100)/100;
 const direction=difference===0?'neutral':difference>0?'positive':'negative';
 return <span className="monthly-change business-value-change" data-direction={direction} aria-label={`较上月${difference>0?'增加':difference<0?'减少':'持平'}${amount?money(Math.abs(difference)):number(Math.abs(difference))+'人'}`}><svg aria-hidden="true" viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.6"><path d={difference>0?'M8 13V3m-4 4 4-4 4 4':difference<0?'M8 3v10m-4-4 4 4 4-4':'M3 8h10m-4-4 4 4-4 4'}/></svg><span>{difference>0?'+':difference<0?'−':''}{amount?money(Math.abs(difference)):number(Math.abs(difference))+'人'}</span></span>;
}
export default function MonthlyCoreResults({core,history=true,embedded=false}:{core:Core;history?:boolean;embedded?:boolean}){
 const p=core.privateData,c=core.comparison;
 if(p.sourceData)return <section className="monthly-core" data-embedded={embedded||undefined} aria-label="月度核心结果"><header><div><h2>{embedded?'本月结果':'核心结果'}</h2><span className="monthly-core-scope">{core.month} · 全月推广来源</span></div>{history&&<div className="business-filter"><MonthlyHistory month={core.month}/></div>}</header><PromotionPrivateTotals value={p} previous={c?.privateData}/><dl className="monthly-outcomes ps-platform-outcomes">{(['actualOpen','actualLead'] as const).map((key,i)=><div key={key}><dt>{i?'实际留资':'实际开口'}<span>{number(core.spend[`${key}Count`])} 人</span></dt><dd><span>{i?'留资':'开口'}成本</span><strong>{money(core.spend[`${key}Cost`])}</strong><PrivateCostChange value={core.spend[`${key}Cost`]} previous={c?.spend[`${key}Cost`]??null}/></dd></div>)}</dl></section>;
 const comparisons=[
  ...(['added','consulted','converted'] as const).flatMap((key,i)=>[
   {label:['新增加微','咨询','成交'][i]+'人数',value:p.data.total[key],previous:c?.privateData.data.total[key]??null,amount:false},
   {label:['加微','咨询','成交'][i]+'成本',value:p.totalCosts[key],previous:c?.privateData.totalCosts[key]??null,amount:true},
  ]),
  {label:'推广消耗',value:core.spend.spend,previous:c?.spend.spend??null,amount:true},
  ...(['actualOpen','actualLead'] as const).flatMap((key,i)=>[
   {label:i?'实际留资人数':'实际开口人数',value:core.spend[`${key}Count`],previous:c?.spend[`${key}Count`]??null,amount:false},
   {label:i?'留资成本':'开口成本',value:core.spend[`${key}Cost`],previous:c?.spend[`${key}Cost`]??null,amount:true},
  ]),
 ];
 return <section className="monthly-core" data-embedded={embedded||undefined} aria-label="月度核心结果">
  <header><div><h2>{embedded?'本月结果':'核心结果'}</h2><span className="monthly-core-scope">{core.month} · 全月全站{p.status!=='complete'&&<span className="monthly-data-status">{p.status==='missing'?'私域待提供':'私域部分录入'}</span>}</span></div>{history&&<div className="business-filter"><MonthlyHistory month={core.month}/></div>}</header>
  {c&&<p className="monthly-comparison-key">变化均较上月 <time>{c.month}</time></p>}
  <dl className="monthly-private-results" aria-label="私域人数与成本">{(['added','consulted','converted'] as const).map((key,i)=><div key={key}><dt>{['新增加微','咨询','成交'][i]}</dt><dd className="monthly-private-value"><span>{number(p.data.total[key])}<small>人</small></span>{c&&<Change value={p.data.total[key]} previous={c.privateData.data.total[key]}/>}</dd><dd className="monthly-private-cost"><span>{['加微','咨询','成交'][i]}成本</span><b>{money(p.totalCosts[key])}</b>{c&&<Change value={p.totalCosts[key]} previous={c.privateData.totalCosts[key]} amount/>}</dd></div>)}</dl>
  <div className="monthly-investment"><div className="monthly-spend"><span>推广消耗</span><div className="monthly-spend-value"><strong>{money(core.spend.spend)}</strong>{c&&<Change value={core.spend.spend} previous={c.spend.spend} amount/>}</div><span>其中已确认空跑 <b>{money(core.spend.wasted)}</b></span></div><dl className="monthly-outcomes">{(['actualOpen','actualLead'] as const).map((key,i)=><div key={key}><dt>{i?'实际留资':'实际开口'}<span>{number(core.spend[`${key}Count`])} 人</span></dt><dd><span>{i?'留资':'开口'}成本</span><strong>{money(core.spend[`${key}Cost`])}</strong>{c&&<Change value={core.spend[`${key}Cost`]} previous={c.spend[`${key}Cost`]} amount/>}</dd></div>)}</dl></div>
  {c&&<details className="monthly-core-comparison"><summary>上月原值与完整对照</summary><div className="monthly-table-scroll"><table><thead><tr><th>指标</th><th>本月</th><th>上月</th><th>变化</th></tr></thead><tbody>{comparisons.map(r=><tr key={r.label}><td>{r.label}</td><td>{r.amount?money(r.value):number(r.value)}</td><td>{r.amount?money(r.previous):number(r.previous)}</td><td>{r.value==null||r.previous==null?'不可比较':<Change {...r}/>}</td></tr>)}</tbody></table></div></details>}
 </section>;
}
function MonthlyHistory({month}:{month:string}){
 const [shell,setShell]=useState<HTMLDialogElement|null>(null),[selected,setSelected]=useState(month),[data,setData]=useState<Core|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);const opener=useRef<HTMLButtonElement|null>(null),sequence=useRef(0);
 async function close(){sequence.current++;const {closeBusinessDialog}=await import('../scripts/business-dialog');await closeBusinessDialog(shell!);opener.current?.focus({preventScroll:true});}
 useEffect(()=>{const dialog=document.getElementById('monthly-history-sheet') as HTMLDialogElement|null;setShell(dialog);if(!dialog)return;dialog.setAttribute('data-dialog-cancel-managed','');const cancel=(e:Event)=>{e.preventDefault();sequence.current++;void import('../scripts/business-dialog').then(m=>m.closeBusinessDialog(dialog)).then(()=>opener.current?.focus({preventScroll:true}));};dialog.addEventListener('cancel',cancel);return()=>{sequence.current++;dialog.removeEventListener('cancel',cancel);};},[]);
 async function load(value:string){setSelected(value);setBusy(true);setError('');const seq=++sequence.current;try{const {readBusiness}=await import('../scripts/business-read');const result=await readBusiness(shell!,async read=>{const r=await fetch('/api/monthly-operations?month='+value,{signal:read.signal}),result=await r.json();if(!r.ok)throw new Error(result.message);return result;},{label:'正在读取历史月份…',isCurrent:()=>seq===sequence.current});if(result&&seq===sequence.current)setData(result.core);}catch(e){if(seq===sequence.current)setError((e as Error).message);}finally{if(seq===sequence.current)setBusy(false);}}
 return <><button type="button" className="business-action-secondary" ref={opener} onClick={()=>{shell?.showModal();void load(adjacentMonth(month,-1));}}>历史月份</button>{shell&&createPortal(<form className="business-form" onSubmit={e=>e.preventDefault()}><header className="dialog-head"><h2 id="monthly-history-title">历史月度运营</h2><button type="button" className="close-button" aria-label="关闭历史月份" onClick={()=>void close()}>×</button></header><div className="sheet-body"><label className="field">月份<input type="month" value={selected} onChange={e=>{if(e.target.value)void load(e.target.value);}}/></label><p className="monthly-caption">按当前已登记事实核对；定稿月会保留当时快照。</p>{error&&<p role="alert">{error} <button type="button" onClick={()=>void load(selected)}>重试</button></p>}{data&&!busy&&!error&&<><MonthlyCoreResults core={data} history={false}/><h3>学科私域结果</h3><PrivateSummary value={data.privateData} summaryOnly/></>}</div><footer className="dialog-actions"><a href={`/business/monthly-operations?month=${selected}`} target="_blank" rel="noreferrer">查看该月明细 ↗</a>{data?.month===selected&&data.meetings?.map(m=><a key={m.id} href={`/business/meeting-review?meeting=${m.id}&version=${m.version}`} target="_blank" rel="noreferrer">{m.name} V{m.version} ↗</a>)}<button type="button" onClick={()=>void close()}>关闭</button></footer></form>,shell)}</>;
}
