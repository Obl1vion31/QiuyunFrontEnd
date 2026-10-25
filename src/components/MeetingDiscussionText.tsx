import {useState} from 'react';
export function DiscussionText({value,onChange,label}:{value:string;onChange?:(value:string)=>void;label:string}){
 const [editing,setEditing]=useState(false);
 return onChange?editing?<textarea autoFocus rows={3} aria-label={label} value={value} onChange={e=>onChange(e.target.value)} onBlur={()=>setEditing(false)}/>:<button type="button" className="weekly-discussion-text" aria-label={`修改${label}`} onClick={()=>setEditing(true)}>{value||'点击填写'}<span aria-hidden="true">修改</span></button>:<p>{value||'尚未填写'}</p>;
}
