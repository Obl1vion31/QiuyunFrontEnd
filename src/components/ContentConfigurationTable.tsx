import {useId,useLayoutEffect,useEffect,useRef,useState,type PointerEvent,type KeyboardEvent,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import type {ContentTypeConfig,PromotionPurpose} from '../db/content-config-values';
import {operationTypeLabels} from '../db/operation-types';

type Row=ContentTypeConfig|PromotionPurpose;
type Props={
 rows:Row[];
 kind:'promotion'|'non-promotion'|'purposes';
 purposes:PromotionPurpose[];
 disabled:boolean;
 onEdit:(target:HTMLElement,row:Row)=>void;
 onReorder:(ids:string[])=>Promise<boolean>;
 onActiveChange:(active:boolean)=>void;
 onDiscard:()=>void;
 error:string;
 onReload:()=>void;
};
type Session={
 id:string;mode:'pointer'|'keyboard';original:string[];order:string[];started:boolean;
 pointerId?:number;startY:number;pointerY:number;offsetY:number;scrollY:number;
 left:number;width:number;height:number;centres:number[];columns:number[];
};
type Ghost={row:Row;top:number;left:number;width:number;height:number;columns:number[]};
const useClientLayoutEffect=typeof window==='undefined'?useEffect:useLayoutEffect;

function Grip(){return <svg viewBox="0 0 16 20" aria-hidden="true">{[5,11].flatMap(x=>[4,10,16].map(y=><circle key={x+':'+y} cx={x} cy={y} r="1.25"/>))}</svg>;}

/** 配置列表内的垂直排序；只预览位置，松手后才写入原修订接口。 */
export default function ContentConfigurationTable({rows,kind,purposes,disabled,onEdit,onReorder,onActiveChange,onDiscard,error,onReload}:Props){
 const hintId=useId(),root=useRef<HTMLDivElement>(null),session=useRef<Session|null>(null);
 const [order,setOrder]=useState<string[]|null>(null),[ghost,setGhost]=useState<Ghost|null>(null),[keyboardId,setKeyboardId]=useState<string|null>(null);
 const [saving,setSaving]=useState(false),[failed,setFailed]=useState(false),[announcement,setAnnouncement]=useState('');
 const before=useRef(new Map<string,number>()),animations=useRef<Animation[]>([]),scrollFrame=useRef(0),focusId=useRef<string|null>(null),movedId=useRef<string|null>(null),retryFocus=useRef(false);
 const callbacks=useRef({onActiveChange,onDiscard});callbacks.current={onActiveChange,onDiscard};
 const displayed=(order??rows.map(r=>r.id)).map(id=>rows.find(r=>r.id===id)).filter((r):r is Row=>!!r);
 const pending=order!==null,locked=disabled||saving||failed;

 function rememberPositions(){before.current=new Map(Array.from(root.current?.querySelectorAll<HTMLElement>('tbody [data-config-row]')??[]).map(el=>[el.dataset.configRow!,el.getBoundingClientRect().top]));}
 useClientLayoutEffect(()=>{
  animations.current.forEach(a=>a.cancel());animations.current=[];
  if(!window.matchMedia('(prefers-reduced-motion: reduce)').matches){
   root.current?.querySelectorAll<HTMLElement>('tbody [data-config-row]').forEach(el=>{
    if(el.dataset.configRow===session.current?.id)return;
    const previous=before.current.get(el.dataset.configRow!);if(previous===undefined)return;
    const delta=previous-el.getBoundingClientRect().top;
    if(Math.abs(delta)>.5)animations.current.push(el.animate([{transform:`translateY(${delta}px)`},{transform:'none'}],{duration:180,easing:'cubic-bezier(.2,.8,.2,1)'}));
   });
  }
  before.current.clear();
 },[order]);
 useClientLayoutEffect(()=>{
  if(disabled||saving)return;
  if(retryFocus.current){root.current?.querySelector<HTMLButtonElement>('[data-sort-retry]')?.focus({preventScroll:true});retryFocus.current=false;return;}
  if(!focusId.current)return;
  root.current?.querySelector<HTMLButtonElement>(`[data-sort-handle="${CSS.escape(focusId.current)}"]`)?.focus({preventScroll:true});focusId.current=null;
 });
 useEffect(()=>{
  // 成功提交或显式载入最新配置后，清掉本地顺序；失败不会改变rows引用。
  setOrder(null);setFailed(false);callbacks.current.onActiveChange(false);
 },[rows]);
 useEffect(()=>{
  const abandon=()=>{if(session.current)cancel();};window.addEventListener('blur',abandon);window.addEventListener('resize',abandon);
  return()=>{window.removeEventListener('blur',abandon);window.removeEventListener('resize',abandon);cancelAnimationFrame(scrollFrame.current);animations.current.forEach(a=>a.cancel());document.body.classList.remove('content-config-sorting');};
 },[]);

 function release(){
  const s=session.current;session.current=null;cancelAnimationFrame(scrollFrame.current);document.body.classList.remove('content-config-sorting');
  if(s?.pointerId!==undefined&&root.current?.hasPointerCapture(s.pointerId))root.current.releasePointerCapture(s.pointerId);
  setGhost(null);setKeyboardId(null);return s;
 }
 function cancel(){
  const s=release();rememberPositions();setOrder(null);setFailed(false);callbacks.current.onActiveChange(false);
  focusId.current=s?.id??movedId.current;setAnnouncement('已取消排序，原顺序保留。');
 }
 function preview(s:Session,next:string[]){
  if(next.every((id,i)=>id===s.order[i]))return;
  rememberPositions();s.order=next;setOrder(next);focusId.current=s.mode==='keyboard'?s.id:null;
  setAnnouncement(`${rows.find(r=>r.id===s.id)?.name}，第${next.indexOf(s.id)+1}项，共${next.length}项。`);
 }
 function updatePointer(s:Session){
  const shift=window.scrollY-s.scrollY,centre=s.pointerY-s.offsetY+s.height/2;
  let index=0;
  while(index<s.centres.length-1&&centre>(s.centres[index]+s.centres[index+1])/2-shift)index++;
  const next=s.original.filter(id=>id!==s.id);next.splice(index,0,s.id);preview(s,next);
  const bounds=root.current!.querySelector('tbody')!.getBoundingClientRect();
  setGhost({row:rows.find(r=>r.id===s.id)!,left:s.left,width:s.width,height:s.height,columns:s.columns,top:Math.max(bounds.top,Math.min(bounds.bottom-s.height,s.pointerY-s.offsetY))});
 }
 function autoScroll(){
  const s=session.current;if(!s||s.mode!=='pointer'||!s.started)return;
  const top=120,bottom=innerHeight-80,dy=s.pointerY<top?-Math.min(14,(top-s.pointerY)/5):s.pointerY>bottom?Math.min(14,(s.pointerY-bottom)/5):0;
  if(dy){window.scrollBy(0,dy);updatePointer(s);}scrollFrame.current=requestAnimationFrame(autoScroll);
 }
 function pointerDown(e:PointerEvent<HTMLButtonElement>,row:Row){
  if(locked||pending||e.button!==0||!e.isPrimary)return;
  e.preventDefault();e.currentTarget.focus({preventScroll:true});
  const tr=e.currentTarget.closest('tr')!,rect=tr.getBoundingClientRect();
  session.current={id:row.id,mode:'pointer',original:rows.map(r=>r.id),order:rows.map(r=>r.id),started:false,pointerId:e.pointerId,startY:e.clientY,pointerY:e.clientY,offsetY:e.clientY-rect.top,scrollY:window.scrollY,left:rect.left,width:rect.width,height:rect.height,centres:Array.from(root.current!.querySelectorAll('tbody tr')).map(r=>{const b=r.getBoundingClientRect();return b.top+b.height/2;}),columns:Array.from(tr.children).map(c=>c.getBoundingClientRect().width)};
  root.current!.setPointerCapture(e.pointerId);
 }
 function pointerMove(e:PointerEvent<HTMLDivElement>){
  const s=session.current;if(!s||s.mode!=='pointer'||s.pointerId!==e.pointerId)return;
  s.pointerY=e.clientY;if(!s.started){if(Math.abs(e.clientY-s.startY)<5)return;s.started=true;setOrder(s.original);onActiveChange(true);document.body.classList.add('content-config-sorting');scrollFrame.current=requestAnimationFrame(autoScroll);}
  updatePointer(s);
 }
 async function commit(s:Pick<Session,'id'|'original'|'order'>){
  focusId.current=s.id;movedId.current=s.id;
  if(s.order.every((id,i)=>id===s.original[i])){setOrder(null);onActiveChange(false);setAnnouncement('顺序未改变。');return;}
  setSaving(true);
  const ok=await onReorder(s.order);setSaving(false);
  if(ok){setOrder(null);setFailed(false);onActiveChange(false);setAnnouncement('顺序已保存。');}
  else {focusId.current=null;retryFocus.current=true;setFailed(true);setAnnouncement('顺序尚未保存，可重试或恢复原顺序。');}
 }
 function pointerUp(e:PointerEvent<HTMLDivElement>){
  const s=session.current;if(!s||s.pointerId!==e.pointerId)return;
  release();if(!s.started)return;void commit(s);
 }
 function keyDown(e:KeyboardEvent<HTMLButtonElement>,row:Row){
  if(locked)return;
  const s=session.current;
  if(e.key==='Escape'&&s){e.preventDefault();cancel();return;}
  if(e.key===' '||e.key==='Enter'){
   e.preventDefault();
   if(s?.mode==='keyboard'){release();void commit(s);return;}
   if(pending)return;
   session.current={id:row.id,mode:'keyboard',original:rows.map(r=>r.id),order:rows.map(r=>r.id),started:true,startY:0,pointerY:0,offsetY:0,scrollY:0,left:0,width:0,height:0,centres:[],columns:[]};
   setOrder(rows.map(r=>r.id));setKeyboardId(row.id);onActiveChange(true);setAnnouncement('已开始排序，使用上下方向键移动，按空格保存，Esc取消。');return;
  }
  if(s?.mode==='keyboard'&&['ArrowUp','ArrowDown','Home','End'].includes(e.key)){
   e.preventDefault();const from=s.order.indexOf(s.id),to=e.key==='Home'?0:e.key==='End'?s.order.length-1:Math.max(0,Math.min(s.order.length-1,from+(e.key==='ArrowUp'?-1:1)));
   const next=[...s.order];next.splice(from,1);next.splice(to,0,s.id);preview(s,next);
  }
 }
 async function retry(){if(!order)return;await commit({id:movedId.current??order[0],original:rows.map(r=>r.id),order});}
 function cells(row:Row,overlay=false):ReactNode{
  return <><th scope="row">{row.name}</th>{kind!=='purposes'&&<td>{operationTypeLabels[(row as ContentTypeConfig).defaultOperationType]}</td>}{kind==='promotion'&&<td>{purposes.find(p=>p.id===(row as ContentTypeConfig).purposeId)?.name??'待归类'}</td>}
   <td className="cc-edit-cell">{overlay?<span className="content-config-edit-label">编辑</span>:<button type="button" className="business-action-secondary" disabled={disabled||pending} onClick={e=>onEdit(e.currentTarget,row)}>编辑</button>}</td>
   <td className="cc-grip-cell">{overlay?<span className="content-config-handle"><Grip/></span>:<button type="button" className="content-config-handle" aria-label={'拖动'+row.name+'排序'} aria-describedby={hintId} aria-pressed={keyboardId===row.id} data-sort-handle={row.id} disabled={locked} onPointerDown={e=>pointerDown(e,row)} onKeyDown={e=>keyDown(e,row)}><Grip/></button>}</td></>;
 }
 const columns=<><col className="cc-name"/>{kind!=='purposes'&&<col className="cc-operation"/>}{kind==='promotion'&&<col className="cc-purpose"/>}<col className="cc-action"/><col className="cc-grip"/></>;
 return <div className="content-config-sortable" ref={root} data-config-list={kind} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={e=>{if(session.current?.pointerId===e.pointerId)cancel();}} onLostPointerCapture={()=>{if(session.current?.mode==='pointer')cancel();}} onKeyDown={e=>{if(e.key==='Escape'&&session.current){e.preventDefault();cancel();}}}>
  <p id={hintId} className="content-config-sr-only">按住右侧手柄上下拖动。键盘按空格开始，上下方向键移动，空格保存，Esc取消。</p>
  <div className="content-config-table"><table data-kind={kind}><colgroup>{columns}</colgroup><thead><tr><th>名称</th>{kind!=='purposes'&&<th>默认运营类型</th>}{kind==='promotion'&&<th>推广用途</th>}<th className="cc-edit-cell">操作</th><th><span className="content-config-sr-only">拖动排序</span></th></tr></thead>
   <tbody>{displayed.map(row=><tr key={row.id} data-config-row={row.id} aria-hidden={ghost?.row.id===row.id?true:undefined} className={ghost?.row.id===row.id?'is-placeholder':keyboardId===row.id?'is-keyboard-sorting':undefined} style={ghost?.row.id===row.id?{height:ghost.height}:undefined}>{cells(row)}</tr>)}{!rows.length&&<tr><td colSpan={kind==='promotion'?5:kind==='non-promotion'?4:3} className="content-config-empty">暂无{kind==='promotion'?'推广类型':kind==='non-promotion'?'非推广类型':'推广用途'}</td></tr>}</tbody>
  </table></div>
  {failed&&<div className="content-config-sort-retry"><span role="alert">{error||'顺序尚未保存'}</span><button type="button" className="business-action-secondary" data-sort-retry disabled={saving} onClick={()=>void retry()}>重试保存顺序</button><button type="button" className="business-action-secondary" disabled={saving} onClick={()=>{cancel();onDiscard();}}>恢复原顺序</button><button type="button" className="business-action-secondary" disabled={saving} onClick={onReload}>载入最新配置</button></div>}
  <span className="content-config-sr-only" role="status" aria-live="polite">{announcement}</span>
  {ghost&&createPortal(<div aria-hidden="true" className="content-config-drag-overlay content-config-table" style={{top:ghost.top,left:ghost.left,width:ghost.width}}><table data-kind={kind}><colgroup>{ghost.columns.map((width,i)=><col key={i} style={{width}}/>)}</colgroup><tbody><tr style={{height:ghost.height}}>{cells(ghost.row,true)}</tr></tbody></table></div>,document.body)}
 </div>;
}
