import {createHash} from 'node:crypto';
/** 版本级生成租约；PDF失败不回滚会议、不重复执行决定。 */
import {and,eq,or,isNull,lt,inArray} from 'drizzle-orm';
import type {Database} from './client';
import {operationsReviewMeetingVersion as versions,operationsMeetingAttachment as attachments} from './schema';
import {WorkflowError} from './schedule-workflow';
export async function ensureMeetingPdf(db:Database,versionId:string,actor:string,render?:(snapshot:any,versionNumber:number)=>Promise<Buffer>){
 const [version]=await db.select().from(versions).where(eq(versions.id,versionId));
 if(!version||version.lifecycleStatus==='draft'||(version.snapshot as any).finalizationStage!=='post')throw new WorkflowError('只有会后定稿可生成PDF。',422);
 const fingerprint=createHash('sha256').update('meeting-html-landscape-v3:'+!!version.invalidatedAt+':'+JSON.stringify(version.snapshot)).digest('hex');
 const [existing]=await db.select({id:attachments.id,renderFingerprint:attachments.renderFingerprint}).from(attachments).where(and(eq(attachments.meetingVersionId,versionId),eq(attachments.source,'generated')));
 if(existing?.renderFingerprint===fingerprint)return {status:'ready',id:existing.id};
 const startedAt=new Date();
 const [lease]=await db.update(versions).set({pdfStatus:'pending',pdfStartedAt:startedAt}).where(and(eq(versions.id,versionId),or(isNull(versions.pdfStartedAt),lt(versions.pdfStartedAt,new Date(Date.now()-120000))))).returning({id:versions.id});
 if(!lease)return {status:'pending'};
 try{
  const renderPdf=render??(await import('./meeting-pdf-render')).renderMeetingPdf;
  const snapshot:any={...structuredClone(version.snapshot),displayInvalidated:!!version.invalidatedAt},imageIds=(snapshot.generated?.attachments??[]).map((a:any)=>a.id).filter(Boolean);
  if(imageIds.length){const images=await db.select().from(attachments).where(and(inArray(attachments.id,imageIds),eq(attachments.meetingId,version.meetingId)));snapshot.generated.attachments=snapshot.generated.attachments.map((a:any)=>{const image=images.find(i=>i.id===a.id&&i.source==='image');return image?{...a,dataUrl:`data:${image.mimeType};base64,${image.base64}`} :a;});}
  const bytes=await renderPdf(snapshot,version.versionNumber);
  if(!bytes.length||bytes.length>3145728)throw new Error('pdf-size');
  return await db.transaction(async tx=>{
   const [leaseOwner]=await tx.select().from(versions).where(eq(versions.id,versionId)).for('update');
   if(leaseOwner.pdfStartedAt?.getTime()!==startedAt.getTime())return {status:'pending'};
   const values={renderFingerprint:fingerprint,meetingId:version.meetingId,meetingVersionId:version.id,source:'generated',name:`${(version.snapshot as any).meeting?.name??'例会复盘'}-会后V${version.versionNumber}.pdf`,mimeType:'application/pdf',byteLength:bytes.length,base64:bytes.toString('base64'),createdByLabel:actor};
   const [file]=existing?await tx.update(attachments).set(values).where(eq(attachments.id,existing.id)).returning({id:attachments.id}):await tx.insert(attachments).values(values).onConflictDoNothing().returning({id:attachments.id});
   await tx.update(versions).set({pdfStatus:'ready',pdfStartedAt:null,pdfFingerprint:fingerprint}).where(eq(versions.id,versionId));
   const id=file?.id??(await tx.select({id:attachments.id}).from(attachments).where(and(eq(attachments.meetingVersionId,versionId),eq(attachments.source,'generated'))))[0]?.id;
   return {status:'ready',id};
  });
 }catch(error){await db.update(versions).set({pdfStatus:'failed',pdfStartedAt:null}).where(and(eq(versions.id,versionId),eq(versions.pdfStartedAt,startedAt)));return {status:'failed'};}
}
