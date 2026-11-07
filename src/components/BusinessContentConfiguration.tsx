import {useEffect,useMemo,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import type {readContentConfigurations} from '../db/content-config';
import type {ContentConfiguration,ContentTypeConfig,PromotionPurpose} from '../db/content-config-values';
import {isPromotionType,operationTypeLabels,operationTypes} from '../db/operation-types';
import ContentConfigurationTable from './ContentConfigurationTable';
import '../styles/content-configuration.css';

type Catalog=Awaited<ReturnType<typeof readContentConfigurations>>;
type View='types'|'purposes';
type Editing={view:View;fresh:boolean;value:ContentTypeConfig|PromotionPurpose};
export default function BusinessContentConfiguration({initial}:{initial:Catalog}) {
 const [catalog,setCatalog]=useState(initial),[subjectId,setSubjectId]=useState(initial.subjects[0]?.id??''),[view,setView]=useState<View>('types');
 const [editing,setEditing]=useState<Editing|null>(null),[dialog,setDialog]=useState<HTMLDialogElement|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
 const [sortOwner,setSortOwner]=useState<string|null>(null);
 const dirty=useRef(false),saving=useRef(false),opener=useRef<HTMLElement|null>(null),current=catalog.configurations.find(c=>c.subjectId===subjectId)!;
 const groups=useMemo(()=>({promotion:current.config.types.filter(t=>isPromotionType(t.defaultOperationType)),'non-promotion':current.config.types.filter(t=>!isPromotionType(t.defaultOperationType)),purposes:current.config.purposes}),[current.config]);
 const controlsLocked=busy||sortOwner!==null;
 useEffect(()=>{
  const shell=document.getElementById('content-config-dialog') as HTMLDialogElement;setDialog(shell);shell.setAttribute('data-dialog-cancel-managed','');
  const cancel=(e:Event)=>{e.preventDefault();void close(shell);};shell.addEventListener('cancel',cancel);return()=>shell.removeEventListener('cancel',cancel);
 },[]);
 async function close(shell=dialog) {
  if(saving.current)return;
  if(dirty.current&&!await window.businessConfirm('配置尚未保存，是否放弃修改？',{title:'关闭编辑',confirmLabel:'放弃修改',cancelLabel:'继续编辑'}))return;
  dirty.current=false;document.documentElement.dataset.unsaved='false';
  const {closeBusinessDialog}=await import('../scripts/business-dialog');if(shell)await closeBusinessDialog(shell);setEditing(null);opener.current?.focus({preventScroll:true});
 }
 function open(target:HTMLElement,value?:ContentTypeConfig|PromotionPurpose) {
  opener.current=target;setError('');dirty.current=false;
  setEditing({view,fresh:!value,value:value?structuredClone(value):view==='types'?{id:'category-'+crypto.randomUUID(),name:'',defaultOperationType:'non_promotion_standard',purposeId:null}:{id:crypto.randomUUID(),name:''}});
  dialog?.showModal();
 }
 function change(patch:Partial<ContentTypeConfig>) {dirty.current=true;document.documentElement.dataset.unsaved='true';setEditing(old=>old?{...old,value:{...old.value,...patch}}:old);}
 async function persist(config:ContentConfiguration) {
  if(saving.current)return false;saving.current=true;setBusy(true);setError('');setMessage('');
  try{
   const response=await fetch('/api/business-settings/content-config',{method:'PATCH',headers:{'Content-Type':'application/json','X-Business-Feedback':'local'},body:JSON.stringify({subjectId,expectedRevision:current.revision,config})});
   const result=await response.json();if(!response.ok)throw new Error(result.message);
   setCatalog(old=>({...old,configurations:old.configurations.map(c=>c.subjectId===subjectId?result:c)}));setMessage('已保存');return true;
  }catch(e){setError(e instanceof TypeError?'连接失败，当前更改已保留，请重试。':(e as Error).message);return false;}finally{saving.current=false;setBusy(false);}
 }
 async function save(e:React.FormEvent) {
  e.preventDefault();if(!editing)return;
  const rows=current.config[editing.view],value={...editing.value,name:editing.value.name.trim()};
  if(editing.view==='types'&&editing.fresh&&!isPromotionType((value as ContentTypeConfig).defaultOperationType))(value as ContentTypeConfig).purposeId=null;
  const next={...current.config,[editing.view]:editing.fresh?[...rows,value]:rows.map(row=>row.id===value.id?value:row)} as ContentConfiguration;
  if(await persist(next)){dirty.current=false;document.documentElement.dataset.unsaved='false';await close();}
 }
 async function reorder(kind:keyof typeof groups,ids:string[]) {
  const arranged=ids.map(id=>groups[kind].find(r=>r.id===id)!);
  if(kind==='purposes')return persist({...current.config,purposes:arranged as PromotionPurpose[]});
  // 仅替换本组原有位置，另一组及历史用途映射保持原值。
  const members=new Set(ids);let index=0;
  return persist({...current.config,types:current.config.types.map(row=>members.has(row.id)?arranged[index++] as ContentTypeConfig:row)});
 }
 function sorting(kind:string,active:boolean){
  setSortOwner(old=>active?kind:old===kind?null:old);
  document.documentElement.dataset.unsaved=active||dirty.current?'true':'false';
 }
 async function reload() {
  if((editing||sortOwner)&&!await window.businessConfirm('重新载入会放弃当前配置输入，是否继续？',{title:'载入最新配置',confirmLabel:'重新载入',cancelLabel:'继续编辑'}))return;
  setBusy(true);try{const response=await fetch('/api/business-settings/content-config',{cache:'no-store'}),result=await response.json();if(!response.ok)throw new Error(result.message);setCatalog(result);setSortOwner(null);setError('');dirty.current=false;document.documentElement.dataset.unsaved='false';if(editing)await close();setMessage('已载入最新配置');}catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 const type=editing?.value as ContentTypeConfig;
 return <section className="content-configuration business-form" aria-label="业务配置">
  <div className="content-config-toolbar">
   <label>学科<select aria-label="配置学科" value={subjectId} disabled={controlsLocked} onChange={e=>{setSubjectId(e.target.value);setMessage('');setError('');}}>{catalog.subjects.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
   <div className="content-config-actions"><fieldset className="content-config-tabs"><legend>配置内容</legend>{([['types','帖子类型'],['purposes','推广用途']] as const).map(([key,label])=><label key={key}><input type="radio" name="content-config-view" value={key} checked={view===key} disabled={controlsLocked} onChange={()=>{setView(key);setMessage('');setError('');}}/><span>{label}</span></label>)}</fieldset>
   <button type="button" className="business-action-primary" disabled={controlsLocked||!current} onClick={e=>open(e.currentTarget)}>新增{view==='types'?'帖子类型':'推广用途'}</button></div>
  </div>
  <div className="content-config-notice"><p className="content-config-caption">{view==='types'?'默认运营类型用于新帖；已有帖子及人工选择保留。':'用于归集真实推广消耗。调整归属会重算实时成本，已录人数与封存结果保留。'}</p>
   {!editing&&!sortOwner&&(error||message)&&<div className="content-config-feedback" role={error?'alert':'status'}>{error||message}{error&&<button type="button" className="business-action-secondary" disabled={busy} onClick={()=>void reload()}>重新载入配置</button>}</div>}
  </div>
  <div className="content-config-groups">{(view==='types'?['promotion','non-promotion'] as const:['purposes'] as const).map(kind=><section key={subjectId+':'+kind} className="content-config-group" aria-label={kind==='promotion'?'推广帖子类型':kind==='non-promotion'?'非推广帖子类型':'推广用途列表'}>
   {kind!=='purposes'&&<h2>{kind==='promotion'?'推广':'非推广'}<span>({groups[kind].length})</span></h2>}
   <ContentConfigurationTable rows={groups[kind]} kind={kind} purposes={current.config.purposes} disabled={busy||!!sortOwner&&sortOwner!==kind} onEdit={open} onReorder={ids=>reorder(kind,ids)} onActiveChange={active=>sorting(kind,active)} onDiscard={()=>{setError('');setMessage('');}} error={sortOwner===kind?error:''} onReload={()=>void reload()}/>
  </section>)}</div>
  {dialog&&editing&&createPortal(<form className="business-form" onSubmit={save}><header className="dialog-head"><h2 id="content-config-title">{editing.fresh?'新增':'编辑'}{editing.view==='types'?'帖子类型':'推广用途'}</h2><button type="button" className="close-button" aria-label="关闭" disabled={busy} onClick={()=>void close()}>×</button></header><div className="content-config-fields">
   <label>名称<input autoFocus required maxLength={80} value={editing.value.name} disabled={busy} onChange={e=>change({name:e.target.value})}/></label>
   {editing.view==='types'&&<><label>默认运营类型<select aria-label="默认运营类型" value={type.defaultOperationType} disabled={busy} onChange={e=>change({defaultOperationType:e.target.value as ContentTypeConfig['defaultOperationType']})}>{operationTypes.map(t=><option key={t} value={t}>{operationTypeLabels[t]}</option>)}</select></label>{isPromotionType(type.defaultOperationType)&&<label>推广用途<select aria-label="推广用途" value={type.purposeId??''} disabled={busy} onChange={e=>change({purposeId:e.target.value||null})}><option value="">待归类</option>{current.config.purposes.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}</>}
  </div><footer className="dialog-actions"><output role={error?'alert':'status'}>{error}</output>{error&&<button type="button" disabled={busy} onClick={()=>void reload()}>载入最新</button>}<button type="button" disabled={busy} onClick={()=>void close()}>取消</button><button className="save-button" disabled={busy}>{busy?'保存中…':'保存'}</button></footer></form>,dialog)}
 </section>;
}
