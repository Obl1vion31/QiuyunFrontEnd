import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import type {MonthlyWorkspace} from '../db/monthly-workspace';
import {emptyCounts,type DemandType,type PrivateCounts,type SourcePrivateData} from '../db/monthly-plan-types';
import {initialPurposes} from '../db/content-config-values';
import {emptySourcePrivateData,privateFields} from '../db/monthly-private-sources';
import {PrivateSourceResults,privateMoney} from './PrivateSourceResults';
import {LegacyPrivateRecords} from './MonthlyPrivatePanel';
import {MonthlyCostResults} from './MonthlyCostResults';

const fieldNames=['私域增加人数','课程意向人数','成交人数'];
export default function PrivateSourceEditor({data,onSaved,summaryOnly=false}:{data:MonthlyWorkspace;admin:boolean;onSaved:()=>Promise<boolean>;summaryOnly?:boolean}){
 const [shell,setShell]=useState<HTMLDialogElement|null>(null);
 const [draft,setDraft]=useState<SourcePrivateData>(emptySourcePrivateData),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const [refreshPending,setRefreshPending]=useState(false);
 const [extraSubject,setExtraSubject]=useState(''),[extraDemand,setExtraDemand]=useState<DemandType>('course'),[existingSource,setExistingSource]=useState('');
 const dirty=useRef(false),saving=useRef(false),epoch=useRef(0),opener=useRef<HTMLElement|null>(null),latest=useRef(data);latest.current=data;
 useEffect(()=>{const dialog=document.getElementById('monthly-private-sheet') as HTMLDialogElement;setShell(dialog);dialog.setAttribute('data-dialog-cancel-managed','');const cancel=(event:Event)=>{event.preventDefault();void close();};dialog.addEventListener('cancel',cancel);return()=>dialog.removeEventListener('cancel',cancel);},[]);
 const markDirty=()=>{epoch.current++;dirty.current=true;document.documentElement.dataset.unsaved='true';};
 async function finish(){const {closeBusinessDialog}=await import('../scripts/business-dialog');await closeBusinessDialog((shell??document.getElementById('monthly-private-sheet')) as HTMLDialogElement);opener.current?.focus({preventScroll:true});}
 async function close(){if(saving.current)return;if(dirty.current&&!await window.businessConfirm('私域月数据尚未保存，是否放弃修改？',{title:'关闭录入',confirmLabel:'放弃修改',cancelLabel:'继续编辑'}))return;dirty.current=false;document.documentElement.dataset.unsaved='false';await finish();}
 async function open(target:HTMLElement){
  if(document.documentElement.dataset.unsaved==='true'&&!await window.businessConfirm('有尚未保存的输入，是否放弃？'))return;
  const current=latest.current;opener.current=target;setMessage('');setRefreshPending(false);setExtraSubject('');setExistingSource('');
  const initial=current.privateData.sourceData??{...emptySourcePrivateData(),promotion:current.privateData.promotionRows};
  setDraft(structuredClone(initial));epoch.current=0;dirty.current=false;
  const dialog=(shell??document.getElementById('monthly-private-sheet')) as HTMLDialogElement;dialog.showModal();
 }
 function updatePromotion(subjectId:string,demand:DemandType,key:keyof PrivateCounts,value:string){markDirty();setDraft(current=>({...current,promotion:current.promotion.map(row=>row.subjectId===subjectId&&row.demand===demand?{...row,[key]:value===''?null:Number(value)}:row)}));}
 function updateOrganic(id:string,patch:Partial<SourcePrivateData['nonPromotion'][number]>){markDirty();setDraft(current=>({...current,nonPromotion:current.nonPromotion.map(row=>row.id===id?{...row,...patch}:row)}));}
 async function removeOrganic(id:string){const row=draft.nonPromotion.find(row=>row.id===id)!;if(privateFields.some(key=>row[key]!==null)&&!await window.businessConfirm(`移除“${row.source||'此来源'}”及本月填写人数？保存后生效。`,{title:'移除来源',confirmLabel:'移除',cancelLabel:'保留来源'}))return;markDirty();setDraft(current=>({...current,nonPromotion:current.nonPromotion.filter(row=>row.id!==id)}));}
 function addOrganic(){markDirty();setDraft(current=>({...current,nonPromotion:[...current.nonPromotion,{id:crypto.randomUUID(),subjectId:data.taxonomy.subjects[0]?.id??'',source:'',...emptyCounts()}]}));}
 async function save(event:React.FormEvent){
  event.preventDefault();if(saving.current||refreshPending&&!dirty.current)return;saving.current=true;setBusy(true);setMessage('');const sentEpoch=epoch.current;
  try{const response=await fetch('/api/monthly-private-data',{method:'PATCH',headers:{'Content-Type':'application/json','X-Business-Feedback':'local'},body:JSON.stringify({month:data.query.month,expectedRevision:data.privateData.revision,data:draft})});const result=await response.json();if(!response.ok)throw new Error(result.message);if(epoch.current===sentEpoch){dirty.current=false;document.documentElement.dataset.unsaved='false';}const refreshed=await onSaved();if(!refreshed){setRefreshPending(true);setMessage('已保存，页面结果暂未更新。请重试刷新结果。');}else if(epoch.current===sentEpoch){setRefreshPending(false);await finish();}else setMessage('本次数据已保存，还有新修改待保存。');}
  catch(error){setMessage((error as Error).message+' 输入已保留。');}finally{saving.current=false;setBusy(false);}
 }
 async function retryRefresh(){if(saving.current)return;saving.current=true;setBusy(true);try{if(await onSaved()){setRefreshPending(false);if(!dirty.current)await finish();else setMessage('结果已刷新，还有新修改待保存。');}else setMessage('已保存，页面结果暂未更新。请重试刷新结果。');}finally{saving.current=false;setBusy(false);}}
 const purposeName=(subjectId:string,id:string)=>(data.privateData.purposeCatalog?.[subjectId]??initialPurposes).find(p=>p.id===id)?.name??id;
 const value=data.privateData,previous=data.core.comparison?.privateData,subjects=data.taxonomy.subjects;
 const availableSources=(value.sourceOptions??[]).filter(source=>!draft.nonPromotion.some(row=>row.id===source.id));
 return <section className="monthly-section" data-private-panel id="private-sources"><header><div><h2>私域来源与成本</h2><span className="monthly-status">{!value.sourceData?'待按来源补充':value.status==='complete'?'已录入':'部分录入'}</span></div><div className="monthly-actions"><button type="button" onClick={event=>void open(event.currentTarget)}>录入／更正</button></div></header>
  {!summaryOnly&&<MonthlyCostResults core={data.core}/>}
  {value.sourceData?<PrivateSourceResults key={data.query.month} value={value} previous={previous} summaryOnly collapsible/>:<LegacyPrivateRecords value={value}/>}
  {shell&&createPortal(<form className="business-form" onSubmit={save}><header className="dialog-head"><h2 id="monthly-private-title">{data.query.month+' 私域人数'}</h2><button type="button" className="close-button" aria-label="关闭" disabled={busy} onClick={()=>void close()}>×</button></header><div className="sheet-body">
   <><p className="monthly-caption">未知留空，真实零填0。汇总按明细人次相加。</p>
    {!value.sourceData&&<LegacyPrivateRecords value={value}/>}
    <section className="ps-editor-group" aria-label="推广来源录入"><header><h3>推广来源</h3></header>
    {subjects.filter(subject=>draft.promotion.some(row=>row.subjectId===subject.id)).map(subject=><div className="ps-editor-subject" key={subject.id}><h4>{subject.name}</h4><div className="ps-editor-head" aria-hidden="true"><span/>{fieldNames.map(name=><span key={name}>{name}</span>)}</div>{draft.promotion.filter(row=>row.subjectId===subject.id).map(row=><div className="ps-input-row" key={row.demand}><div><strong>{purposeName(row.subjectId,row.demand)}</strong><small>消耗 {privateMoney(value.subjects.find(s=>s.id===subject.id)?.demands.find(d=>d.demand===row.demand)?.spend??null)}</small></div>{privateFields.map((key,i)=><input key={key} type="number" min="0" step="1" inputMode="numeric" aria-label={`${subject.name}·${purposeName(row.subjectId,row.demand)}${fieldNames[i]}`} value={row[key]??''} onChange={event=>updatePromotion(row.subjectId,row.demand,key,event.target.value)}/>)}</div>)}</div>)}
    <div className="ps-editor-actions"><select aria-label="添加推广学科" value={extraSubject} onChange={event=>{setExtraSubject(event.target.value);setExtraDemand((value.purposeCatalog?.[event.target.value]??initialPurposes)[0]?.id??'');}}><option value="">选择学科</option>{subjects.map(subject=><option value={subject.id} key={subject.id}>{subject.name}</option>)}</select><select aria-label="添加推广用途" value={extraDemand} onChange={event=>setExtraDemand(event.target.value as DemandType)}>{(value.purposeCatalog?.[extraSubject]??initialPurposes).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select><button type="button" className="secondary" disabled={!extraSubject||draft.promotion.some(row=>row.subjectId===extraSubject&&row.demand===extraDemand)} onClick={()=>{markDirty();setDraft(current=>({...current,promotion:[...current.promotion,{subjectId:extraSubject,demand:extraDemand,...emptyCounts()}]}));setExtraSubject('');}}>添加用途</button></div></section>
    <section className="ps-editor-group" aria-label="非推广来源录入"><header><h3>非推广来源</h3><button type="button" className="secondary" onClick={addOrganic}>添加来源</button></header>{draft.nonPromotion.map(row=><div className="ps-organic-editor" key={row.id}><div className="ps-organic-identity"><label>学科<select aria-label={`来源学科 ${row.id}`} value={row.subjectId} onChange={event=>updateOrganic(row.id,{subjectId:event.target.value})}>{subjects.map(subject=><option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></label><label>细分来源<input required maxLength={160} aria-label={`细分来源 ${row.id}`} value={row.source} onChange={event=>updateOrganic(row.id,{source:event.target.value})}/></label><button type="button" className="ps-remove" aria-label={`移除来源 ${row.source||'未命名'}`} onClick={()=>void removeOrganic(row.id)}><svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="m4 4 8 8M12 4l-8 8"/></svg></button></div><div className="ps-organic-counts">{privateFields.map((key,i)=><label key={key}>{fieldNames[i]}<input type="number" min="0" step="1" inputMode="numeric" aria-label={`${row.source||'新来源'}${fieldNames[i]}`} value={row[key]??''} onChange={event=>updateOrganic(row.id,{[key]:event.target.value===''?null:Number(event.target.value)})}/></label>)}</div></div>)}
    {availableSources.length>0&&<div className="ps-editor-actions"><select aria-label="已有非推广来源" value={existingSource} onChange={event=>setExistingSource(event.target.value)}><option value="">选择已有来源</option>{availableSources.map(source=><option value={source.id} key={source.id}>{subjects.find(s=>s.id===source.subjectId)?.name} · {source.source}</option>)}</select><button type="button" className="secondary" disabled={!existingSource} onClick={()=>{const source=availableSources.find(row=>row.id===existingSource)!;markDirty();setDraft(current=>({...current,nonPromotion:[...current.nonPromotion,{...source,...emptyCounts()}]}));setExistingSource('');}}>加入本月</button></div>}</section>
    <label>备注<textarea value={draft.note} maxLength={2000} rows={3} onChange={event=>{markDirty();setDraft(current=>({...current,note:event.target.value}));}}/></label>
   </>
  </div><footer className="dialog-actions"><output role="status">{message}</output>{refreshPending&&<button type="button" disabled={busy} onClick={()=>void retryRefresh()}>刷新结果</button>}<button type="button" disabled={busy} onClick={()=>void close()}>{refreshPending?'关闭':'取消'}</button><button className="save-button" disabled={busy||refreshPending&&!dirty.current}>{busy?'处理中…':'保存'}</button></footer></form>,shell)}
 </section>;
}
