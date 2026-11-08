/** 比较业务值而非输入事件。异步适配器只将自己实际回填的字段重设为基线。 */
export function trackFormChanges(form:HTMLFormElement,onChange:()=>void=()=>{}){
 const ignored=/^(?:expected|monthlyExpected|monthlyRequest|recordId$|sourceScheduleId$|action$|requestKey$|confirmPromotionReset$)/;
 const values=()=>{
  const result=new Map<string,string>();
  for(const field of Array.from(form.elements)){
   if(!(field instanceof HTMLInputElement||field instanceof HTMLSelectElement||field instanceof HTMLTextAreaElement)||ignored.test(field.name)||field.hasAttribute('data-datetime-value')||field.type==='submit'||field.type==='button')continue;
   const day=field.closest<HTMLElement>('[data-delay-day]');
   const name=day?'delay:'+day.dataset.planRevision+':'+day.dataset.dayNumber+':'+(field instanceof HTMLInputElement&&field.type==='radio'?'responsibility':'reason'):field.name;
   if(!name)continue;
   if(field instanceof HTMLInputElement&&field.type==='radio'){if(!result.has(name))result.set(name,'');if(field.checked)result.set(name,field.value);continue;}
   const value=field instanceof HTMLInputElement&&field.type==='checkbox'?String(field.checked):field.value;
   result.set(name,(result.has(name)?result.get(name)+'\u0000':'')+value);
  }
  return result;
 };
 let baseline=values();
 const changed=()=>{const current=values();return [...new Set([...baseline.keys(),...current.keys()])].some(name=>(baseline.get(name)??'')!==(current.get(name)??''));};
 const sync=()=>{form.dataset.dirty=String(changed());document.documentElement.dataset.unsaved=String(!!document.querySelector('form[data-dirty=true],[data-inspector][data-dirty=true]'));onChange();};
 const capture=()=>{baseline=values();sync();};
 form.addEventListener('input',()=>queueMicrotask(sync));form.addEventListener('change',()=>queueMicrotask(sync));
 form.addEventListener('business:form-rebase',event=>{const fields=(event as CustomEvent<{fields:string[]}>).detail.fields,current=values();for(const name of fields)baseline.set(name,current.get(name)??'');sync();});
 return {get dirty(){return changed();},capture,sync};
}
