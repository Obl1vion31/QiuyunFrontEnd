import '../styles/business-record-disclosure.css';

/** 延期说明与业务历史共用折叠标题、计数及展开／收起反馈。 */
export function createRecordDisclosure(label:string,count:number,open=false){
 const root=document.createElement('details');root.className='business-record-disclosure';root.open=open;
 const heading=document.createElement('summary'),title=document.createElement('span');title.textContent=`${label} (${count})`;
 const toggle=document.createElement('span');toggle.className='business-record-toggle';toggle.setAttribute('aria-hidden','true');
 for(const text of ['展开','收起']){const span=document.createElement('span');span.textContent=text;toggle.append(span);}
 heading.append(title,toggle);root.append(heading);return root;
}
