import {useEffect,useRef,useState} from 'react';
import type {MonthlyOperations,MonthlyQuery} from '../db/monthly-operations';
import {businessDateTime} from '../scripts/business-date';
import styles from './BusinessMonthlyOperations.module.css';

const money=(value:number|null)=>value==null?'—':'¥'+value.toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2});
const count=(value:number|null)=>value==null?'—':value.toLocaleString('zh-CN');
const monthLabel=(month:string)=>`${month.slice(0,4)}年${Number(month.slice(5))}月`;
const currentMonth=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit'}).format(new Date());
const reasonLabels:Record<string,string>={self:'运营原因',external:'非运营原因',requester:'需求端原因',unknown:'未知'};
type View='publication'|'promotion';
type Detail='onTime'|'pending'|'planned'|'published'|'delayed'|'missing'|'severe'|'operational'|'changed'|'moved'|'all'|'wasted'|'gaps'|`subject:${string}`|`group:${string}`;
const filters:Array<[Detail,string]>=[['planned','当前应发'],['onTime','按时已发布'],['pending','正常待发'],['published','本月发布'],['delayed','延期已发布'],['missing','尚未登记'],['severe','超过48小时'],['operational','运营原因'],['changed','改期后未登记'],['moved','改出本月']];
const scheduleHref=(id:string)=>`/business/operations-schedule?display=ledger&row=${id}`;
export default function BusinessMonthlyOperations({initial,query:initialQuery,error:initialError='',followCurrentMonth=false}:{initial:MonthlyOperations|null;query:MonthlyQuery;error?:string;followCurrentMonth?:boolean}){
 const [data,setData]=useState(initial),[query,setQuery]=useState(initialQuery),[error,setError]=useState(initialError),[busy,setBusy]=useState(false);
 const [view,setView]=useState<View>('publication'),[detail,setDetail]=useState<Detail>('planned');
 const root=useRef<HTMLDivElement>(null),body=useRef<HTMLDivElement>(null),details=useRef<HTMLElement>(null),activeQuery=useRef(query),follow=useRef(followCurrentMonth),seen=useRef(new Set<string>()),generation=useRef(0);
 activeQuery.current=query;
 async function load(next:MonthlyQuery,updateURL=true){
  setQuery(next);activeQuery.current=next;setError('');setBusy(true);const seq=++generation.current;
  if(updateURL){const url=new URL(location.href);for(const [key,value] of Object.entries(next))value?url.searchParams.set(key,value):url.searchParams.delete(key);history.replaceState(history.state,'',url);}
  try{
   const {readBusiness}=await import('../scripts/business-read');
   const result=await readBusiness(body.current!,async read=>{const response=await fetch('/api/monthly-operations?'+new URLSearchParams(next),{signal:read.signal});const value=await response.json();if(!response.ok)throw new Error(value.message||'读取失败，请重试。');return value as MonthlyOperations;},{label:`正在读取${monthLabel(next.month)}…`,isCurrent:()=>seq===generation.current});
   if(result){setData(result);}
  }catch(e){if(seq===generation.current)setError(e instanceof Error?e.message:'读取失败，请重试。');}
  finally{if(seq===generation.current)setBusy(false);}
 }
 useEffect(()=>{
  let timer:ReturnType<typeof setTimeout>;
  const arm=()=>{const now=new Date(),today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);const end=new Date(today+'T00:00:00+08:00').getTime()+86400000;timer=setTimeout(()=>{if(!document.hidden)void load({...activeQuery.current,month:follow.current?currentMonth():activeQuery.current.month},false);arm();},end-now.getTime()+100);};arm();
  const onVisible=()=>{if(!document.hidden)void load({...activeQuery.current,month:follow.current?currentMonth():activeQuery.current.month},false);};
  const onPop=()=>{const url=new URL(location.href);void load({month:url.searchParams.get('month')||currentMonth(),subject:url.searchParams.get('subject')||'',category:url.searchParams.get('category')||''},false);};
  document.addEventListener('visibilitychange',onVisible);window.addEventListener('popstate',onPop);
  return()=>{clearTimeout(timer);document.removeEventListener('visibilitychange',onVisible);window.removeEventListener('popstate',onPop);};
 },[]);
 useEffect(()=>{
  if(!data||!root.current)return;
  const animations:Animation[]=[];
  const observer=new IntersectionObserver(entries=>{for(const entry of entries){if(!entry.isIntersecting)continue;const key=(entry.target as HTMLElement).dataset.monthlyChart!;if(seen.current.has(key))continue;seen.current.add(key);if(!matchMedia('(prefers-reduced-motion: reduce)').matches)entry.target.querySelectorAll<HTMLElement>('[data-chart-fill]').forEach((bar,i)=>animations.push(bar.animate([{transform:'scaleX(0)'},{transform:'scaleX(1)'}],{duration:620,delay:i*45,easing:'cubic-bezier(.2,.8,.2,1)',fill:'backwards'})));entry.target.removeAttribute('data-chart-pending');observer.unobserve(entry.target);}}, {threshold:.15});
  root.current.querySelectorAll('[data-monthly-chart]').forEach(n=>observer.observe(n));return()=>{observer.disconnect();animations.forEach(a=>a.cancel());};
 },[Boolean(data)]);
 function show(next:View,filter:Detail){setView(next);setDetail(filter);requestAnimationFrame(()=>{details.current?.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});details.current?.focus({preventScroll:true});});}
 const taxonomy=data?.taxonomy;
 const categories=taxonomy?.postCategories.filter(c=>!query.subject||taxonomy.subjectCategoryMappings.some(m=>m.subjectId===query.subject&&m.categoryId===c.id))??[];
 const scheduleRows=data?.scheduleRows.filter(row=>detail==='published'?row.publishedThisMonth:detail==='moved'?row.movedOut:detail==='changed'?row.changedPending:row.currentMonth&&(detail==='onTime'?row.status==='on_time':detail==='pending'?!row.actualAt&&!row.missing:detail==='delayed'?row.status==='delayed':detail==='missing'?row.missing:detail==='severe'?row.severe:detail==='operational'?row.operational:true))??[];
 const spendRows=data?.spendRows.filter(row=>detail==='wasted'?row.wasted>0:detail.startsWith('subject:')?row.subjectId===detail.slice(8):detail.startsWith('group:')?data.categories.find(g=>g.key===detail.slice(6))?.scheduleIds.includes(row.scheduleId):true)??[];
 const pub=data?.publication,spend=data?.spend;
 const distribution=pub?[{key:'onTime',label:'按时已发布',value:pub.onTime,color:'#3d8d72'},{key:'delayed',label:'延期已发布',value:pub.delayed,color:'#cc797e'},{key:'missing',label:'尚未登记',value:pub.missing,color:'#d6aa42'},{key:'pending',label:'正常待发',value:pub.pending,color:'#95acd9'}]:[];
 return <div ref={root} className={styles.root} data-monthly-operations>
  <form className={`business-filter ${styles.filters}`} onSubmit={e=>{e.preventDefault();void load(query);}} aria-label="月度运营筛选">
   <label>月份<input type="month" name="month" value={query.month} required onChange={e=>{if(!e.target.value)return;follow.current=false;void load({...query,month:e.target.value});}}/></label>
   <label>学科<select name="subject" value={query.subject} onChange={e=>void load({...query,subject:e.target.value,category:''})}><option value="">全部学科</option>{taxonomy?.subjects.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
   <label>帖子分类<select name="category" value={query.category} onChange={e=>void load({...query,category:e.target.value})}><option value="">全部分类</option>{categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
   <div className={styles.filterActions}><button type="submit" disabled={busy}>刷新</button><button type="button" onClick={()=>{follow.current=true;void load({...query,month:currentMonth()});}}>本月</button></div>
  </form>
  <div ref={body} className={styles.body}>
   {error&&<div className={styles.error} role="alert"><span>{error}{data&&` 当前仍显示${monthLabel(data.query.month)}的数据。`}</span><button onClick={()=>void load(query)}>重试</button></div>}
   {data&&pub&&spend&&<div data-report-month={data.query.month}>
    <div className={styles.dateline}><span>{monthLabel(data.query.month)}<span className={styles.muted}> · 自然月</span></span><span>更新于 {businessDateTime(data.generatedAt)}</span></div>
    <section className={styles.metrics} aria-label="月度核心指标">
     <button className={styles.metric} onClick={()=>show('publication','planned')}><span>当前本月应发</span><strong data-value="planned">{count(pub.planned)}<small>篇</small></strong><em><span>已登记 {pub.registered}</span><span>待登记 {pub.planned-pub.registered}</span></em></button>
     <button className={styles.metric} onClick={()=>show('publication','published')}><span>本月发布量</span><strong data-value="published">{count(pub.published)}<small>篇</small></strong><em><span>新做 {pub.newPublished}</span><span>改帖 {pub.revisionPublished}</span>{pub.crossMonthPublished>0&&<span>跨月 {pub.crossMonthPublished}</span>}</em></button>
     <button className={`${styles.metric} ${styles.delayMetric}`} onClick={()=>show('publication','delayed')}><span>发布延期率</span><strong data-value="delay-rate">{pub.delayRate==null?'—':pub.delayRate.toFixed(1)+'%'}</strong><em>本月应发中 {pub.delayed} / {pub.registered} 篇已登记发布</em></button>
     <button className={`${styles.metric} ${styles.spendMetric}`} onClick={()=>show('promotion','all')}><span>已登记推广消耗</span><strong data-value="spend">{money(spend.spend)}</strong><em>其中已确认空跑 {money(spend.wasted)}</em></button>
    </section>
    <section className={styles.attention} aria-label="执行关注项">
     <button className={pub.severe?styles.warning:''} onClick={()=>show('publication','severe')}><span>超时未登记 &gt;48小时</span><b>{pub.severe}</b><span>篇</span></button>
     <button onClick={()=>show('publication','operational')}><span>运营原因延期</span><b>{pub.operational}</b><span>篇</span></button>
     <button onClick={()=>show('publication','changed')}><span>改期后仍未登记</span><b>{pub.changedPending}</b><span>篇</span></button>
     <button onClick={()=>show('publication','moved')}><span>改出本月且未登记</span><b>{pub.movedOut}</b><span>篇</span></button>
    </section>
    <section className={styles.charts} aria-label="执行与消耗分布">
     <div className={styles.panel} data-monthly-chart="publication" data-chart-pending=""><header><h2>发布执行</h2><span>{pub.planned} 篇当前应发</span></header><p className={styles.caption}>按最新应发日期归月；尚未登记与确认延期分开。</p>
      <div className={styles.distribution} role="img" aria-label={distribution.map(d=>`${d.label}${d.value}篇`).join('，')}>{distribution.map(d=><i key={d.key} data-chart-fill style={{width:pub.planned?`${d.value/pub.planned*100}%`:'0%',background:d.color}}/>)}</div>
      <div className={styles.legend}>{distribution.map(d=><button key={d.key} onClick={()=>show('publication',d.key as Detail)}><i style={{background:d.color}}/><span>{d.label}</span><b>{d.value}</b></button>)}</div>
      <p className={styles.footnote}>本月发布量按登记的实发日期统计，可包含其他月份应发的帖子。</p>
     </div>
     <div className={styles.panel} data-monthly-chart="spend" data-chart-pending=""><header><h2>投入去向</h2><button className={styles.textButton} onClick={()=>show('promotion','wasted')}>查看空跑明细 →</button></header><p className={styles.caption}>按消耗日期归月 · 淡粉为已确认测试空跑</p>
      {data.subjects.length?<div className={styles.bars}>{data.subjects.map(subject=><button key={subject.id} className={styles.barRow} onClick={()=>show('promotion',`subject:${subject.id}`)}><span className={styles.barLabel}>{subject.name}</span><span className={styles.barTrack}><i data-chart-fill style={{width:`${subject.spend/Math.max(1,...data.subjects.map(s=>s.spend))*100}%`}}><i style={{width:subject.spend?`${subject.wasted/subject.spend*100}%`:'0%'}}/></i></span><b>{money(subject.spend)}</b></button>)}</div>:<div className={styles.empty}>本月尚无已登记推广消耗</div>}
      <div className={styles.spendFoot}><span>实际开口 <b>{count(spend.actualOpenCount)}</b> 人</span><span>实际留资 <b>{count(spend.actualLeadCount)}</b> 人</span><button className={styles.textButton} onClick={()=>show('promotion','gaps')}>待补 {data.missingRows.reduce((n,r)=>n+r.dates.length,0)} 条日度数据</button></div>
     </div>
    </section>
    <section ref={details} tabIndex={-1} className={styles.details} aria-label="可追溯明细">
     <header className={styles.detailHeader}><h2>可追溯明细</h2><div className={styles.switch} role="group" aria-label="明细类型"><button aria-pressed={view==='publication'} onClick={()=>{setView('publication');setDetail('planned');}}>发布执行</button><button aria-pressed={view==='promotion'} onClick={()=>{setView('promotion');setDetail('all');}}>推广消耗</button></div></header>
     <div className={styles.detailFilters}>{view==='publication'?<><label>查看<select aria-label="发布明细范围" value={detail} onChange={e=>setDetail(e.target.value as Detail)}>{filters.map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label><span>每篇按排期版本计数；运营原因包含混合归因。</span></>:<><button aria-pressed={detail==='all'} onClick={()=>setDetail('all')}>全部消耗</button><button aria-pressed={detail==='wasted'} onClick={()=>setDetail('wasted')}>测试空跑</button><button aria-pressed={detail==='gaps'} onClick={()=>setDetail('gaps')}>待补数据</button>{detail.startsWith('subject:')&&<span>{data.subjects.find(s=>s.id===detail.slice(8))?.name}</span>}<span>成本＝合计消耗 ÷ 合计人数；缺失不补零。</span></>}</div>
     {view==='publication'?<div className={styles.tableScroll}><table className={styles.publicationTable}><thead><tr><th>帖子 / 版本</th><th>最新应发时间</th><th>登记的实发时间</th><th>执行状态</th><th>原因与调整</th><th>原记录</th></tr></thead><tbody>{scheduleRows.map(row=><tr key={row.id} className={row.severe?styles.severeRow:''}><td><strong>{row.contentName} <small>V{row.versionNumber}</small></strong><span>{row.subjectName} · {row.categoryName??'未分类'}</span></td><td>{businessDateTime(row.plannedAt)}</td><td>{row.actualAt?businessDateTime(row.actualAt):'—'}</td><td><span className={`${styles.tag} ${row.status==='delayed'?styles.pink:row.missing?styles.amber:''}`}>{row.status==='delayed'?'延期已发布':row.actualAt?'按时已发布':row.missing?'尚未登记':'正常待发'}</span>{row.movedOut&&<small>已改出本月</small>}</td><td>{!row.reasons.length&&!row.history.length&&!row.missing&&row.status!=='delayed'?'—':<details><summary>{row.reasons.length?`${row.reasons.some(r=>r.responsibility==='self')?'运营原因':row.reasons.some(r=>r.responsibility==='unknown')?'归因待明确':'非运营原因'}${row.mixed?' · 混合':''}`:(row.missing||row.status==='delayed'?'归因未记录':'')}{row.history.length>0&&`${row.reasons.length||row.missing||row.status==='delayed'?' · ':''}改期 (${row.history.length})`}</summary><div className={styles.rowHistory}>{row.reasons.length?row.reasons.map(r=><p key={r.day}><b>{reasonLabels[r.responsibility]}</b><small>{businessDateTime(r.at)}</small>{r.reason}</p>):(row.missing||row.status==='delayed')?<p>尚无延期原因记录。</p>:null}{row.history.map((h,i)=><p key={i}><b>改期</b><small>{businessDateTime(h.from)} → {businessDateTime(h.to)}</small>{h.reason}</p>)}</div></details>}</td><td><a href={scheduleHref(row.id)} target="_blank" rel="noopener">查看 ↗</a></td></tr>)}{!scheduleRows.length&&<tr><td colSpan={6} className={styles.empty}>当前范围暂无记录</td></tr>}</tbody></table></div>:detail==='gaps'?<div className={styles.gaps}>{data.missingRows.map(row=><div key={row.campaignId}><div><strong>{row.contentName} · V{row.versionNumber}</strong><details><summary>待补 {row.dates.length} 天 · {row.dates[0]} 至 {row.dates.at(-1)}</summary><div className={styles.dateList}>{row.dates.map(date=><span key={date}>{date}</span>)}</div></details></div><a href={`/business/daily-promotion-review?view=history&campaign=${row.campaignId}&from=${data.from}&to=${data.through}`} target="_blank" rel="noopener">去补录 ↗</a></div>)}{!data.missingRows.length&&<p className={styles.empty}>所选月份暂无待补日度数据</p>}</div>:detail==='wasted'?<><p className={styles.costNote}>截至当前已确认失败；后续淘汰、补录或更正会更新原消耗月份。淘汰后残留包含在月内消耗中。</p><div className={styles.tableScroll}><table className={styles.wastedTable}><thead><tr><th>帖子 / 版本</th><th>学科 / 分类</th><th>测试轮次</th><th>淘汰日期</th><th>本月空跑</th><th>整轮累计</th><th>原记录</th></tr></thead><tbody>{data.wastedRows.map(row=><tr key={row.key} className={styles.discarded}><td><strong>{row.contentName} <small>V{row.versionNumber}</small></strong></td><td>{row.subjectName}<span>{row.categoryName??'未分类'}</span></td><td>第 {row.cycle} 轮<span>{row.startedOn} 开始</span></td><td>{row.discardedOn}</td><td>{money(row.monthSpend)}{row.residualSpend>0&&<span>含残留 {money(row.residualSpend)}</span>}</td><td>{money(row.totalSpend)}</td><td><a href={scheduleHref(row.scheduleId)} target="_blank" rel="noopener">查看 ↗</a></td></tr>)}{!data.wastedRows.length&&<tr><td colSpan={7} className={styles.empty}>本月暂无已确认测试空跑记录</td></tr>}</tbody></table></div></>:<>
      <div className={styles.tableScroll}><table className={styles.costTable}><thead><tr><th>学科 / 帖子分类</th><th>合计消耗</th><th>测试空跑</th><th>实际开口</th><th>实际留资</th><th>开口成本</th><th>留资成本</th></tr></thead><tbody>{data.categories.filter(g=>!detail.startsWith('subject:')||g.subjectId===detail.slice(8)).map(group=><tr key={group.key}><td><button className={styles.groupButton} aria-pressed={detail===`group:${group.key}`} onClick={()=>setDetail(detail===`group:${group.key}`?'all':`group:${group.key}`)}>{group.subjectName} · {group.categoryName??'未分类'}<small>{group.posts} 篇 · 点击查看组成</small></button></td><td>{money(group.spend)}</td><td>{money(group.wasted)}</td><td>{count(group.actualOpenCount)}</td><td>{count(group.actualLeadCount)}</td><td>{money(group.actualOpenCost)}</td><td>{money(group.actualLeadCost)}</td></tr>)}{!data.categories.length&&<tr><td colSpan={7} className={styles.empty}>本月尚无已登记推广数据</td></tr>}</tbody></table></div>
      <div className={styles.postList}><header><h3>消耗组成</h3><span>{spendRows.length} 篇</span></header><div className={styles.tableScroll}><table className={styles.costTable}><thead><tr><th>帖子 / 版本</th><th>当前状态</th><th>本月消耗</th><th>测试空跑</th><th>实际开口</th><th>实际留资</th><th>原记录</th></tr></thead><tbody>{spendRows.map(row=><tr key={row.scheduleId} className={['test_discarded','formal_discarded'].includes(row.status)?styles.discarded:row.status==='ended'?styles.ended:''}><td><strong>{row.contentName} <small>V{row.versionNumber}</small></strong><span>{row.subjectName} · {row.categoryName??'未分类'}</span></td><td><span className={styles.tag}>{row.statusLabel}</span></td><td>{money(row.spend)}</td><td>{money(row.wasted)}</td><td>{count(row.actualOpenCount)}</td><td>{count(row.actualLeadCount)}</td><td><a href={scheduleHref(row.scheduleId)} target="_blank" rel="noopener">查看 ↗</a></td></tr>)}{!spendRows.length&&<tr><td colSpan={7} className={styles.empty}>当前范围暂无消耗记录</td></tr>}</tbody></table></div></div>
     </>}
    </section>
    <p className={styles.bottomNote}>实时看板按当前有效排期和已登记事实计算；当前应发量不代表月初冻结计划。</p>
   </div>}
  </div>
 </div>;
}
