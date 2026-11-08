/** 网页打印与服务端导出展开同一批冻结依据；不读取或写入业务数据。 */
export const meetingPrintDetailsSelector='.monthly-section details,.plan-comparison details,.ps-disclosure,.ps-legacy-records';

if(typeof window!=='undefined'){
 const previous=new Map<HTMLDetailsElement,boolean>();
 let position:{x:number;y:number}|undefined;
 const expand=()=>{
  if(!document.querySelector('[data-weekly-snapshot]'))return;
  if(!position)position={x:scrollX,y:scrollY};
  document.querySelectorAll<HTMLDetailsElement>(`[data-weekly-snapshot] :is(${meetingPrintDetailsSelector})`).forEach(detail=>{
   if(!previous.has(detail))previous.set(detail,detail.open);
   detail.open=true;
  });
 };
 const restore=()=>{
  previous.forEach((open,detail)=>{if(detail.isConnected)detail.open=open;});previous.clear();
  if(position){window.scrollTo({left:position.x,top:position.y,behavior:'instant'});position=undefined;}
 };
 window.addEventListener('beforeprint',expand);
 window.addEventListener('afterprint',restore);
 document.addEventListener('astro:before-swap',restore);
}
