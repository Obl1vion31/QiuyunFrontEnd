/** SSR 与异步排期详情使用相同字段结构；文本写入不解析 HTML。 */
export interface ChangeDiff {label:string;before:string;after:string}
export function appendChangeDiff(host:HTMLElement,changes:ChangeDiff[]){
 const diff=document.createElement('div');diff.className='business-change-diff';
 for(const change of changes){
  const section=document.createElement('section');section.className='business-change-field';
  const heading=document.createElement('h4');heading.textContent=change.label;
  const list=document.createElement('dl');
  for(const [label,value] of [['原内容',change.before],['申请修改为',change.after]]){
   const row=document.createElement('div'),term=document.createElement('dt'),description=document.createElement('dd');
   term.textContent=label;description.textContent=value;row.append(term,description);list.append(row);
  }
  section.append(heading,list);diff.append(section);
 }
 host.append(diff);
}
