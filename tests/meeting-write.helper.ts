/** 共用场景准备器：把测试意图明确映射为当前版本草稿协议。 */
import {eq} from 'drizzle-orm';
import {operationsReviewMeetingVersion as versions} from '../src/db/schema';
export async function versionDraftPayload(db:any,path:string,input:any){
 if(!input||!/^\/api\/meeting-reviews\/[\da-f-]+$/.test(path))return input;
 const rows=await db.select().from(versions).where(eq(versions.meetingId,path.split('/').at(-1)!));
 const active=rows.find((v:any)=>v.lifecycleStatus==='draft'&&!v.invalidatedAt);
 if(input.draft&&['save','finalize_pre','finalize_post'].includes(input.action))return {...input,action:input.action==='save'?'save_version_draft':'finalize_version_draft',stage:input.action==='save'?undefined:input.action==='finalize_post'?'post':'pre',draftVersionId:active?.id,draft:{...input.draft,workflowVersion:6}};
 if(input.action==='finalize_version')return {...input,action:'finalize_version_draft',stage:'post',draftVersionId:active?.id};
 return input;
}
