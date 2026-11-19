import {extractPublicationLink,publicationNoteId} from './publication-link.mjs';
import {WorkflowError} from './schedule-workflow';

export type ResolvedPublicationNote={url:string;noteId:string};
const unresolved=()=>new WorkflowError('分享短链接暂时无法解析，请粘贴完整的小红书帖子链接；当前输入已保留。',422);

/** 外部跳转在写事务外解析；每一跳仍必须是允许的官方帖子／分享地址。 */
export async function resolvePublicationNote(value:string):Promise<ResolvedPublicationNote>{
 let current=extractPublicationLink(value);
 if(current.error)throw new WorkflowError(current.error,422);
 const signal=AbortSignal.timeout(8_000),seen=new Set<string>();
 for(let hop=0;hop<=5;hop++){
  const noteId=publicationNoteId(current.url);
  if(noteId)return {url:current.url,noteId};
  if(hop===5||seen.has(current.url))throw unresolved();
  seen.add(current.url);
  let response:Response;
  try{response=await fetch(current.url,{method:'GET',redirect:'manual',signal,headers:{Accept:'text/html'}});}catch{throw unresolved();}
  const location=response.headers.get('location');
  await response.body?.cancel();
  if(![301,302,303,307,308].includes(response.status)||!location)throw unresolved();
  let next:string;try{next=new URL(location,current.url).href;}catch{throw unresolved();}
  current=extractPublicationLink(next);
  if(current.error)throw unresolved();
 }
 throw unresolved();
}
