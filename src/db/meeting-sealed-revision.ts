import {eq,desc} from 'drizzle-orm';
import {z} from 'zod';
import type {Database} from './client';
import {WorkflowError,StaleWriteError} from './schedule-workflow';
import {lockPromotionWorkflow} from './promotion-pauses';
import {latestValidMeetingVersion} from './meeting-version-rules';
import {operationsReviewMeeting as meetings,operationsReviewMeetingVersion as versions,operationsMonthlyPlan as plans} from './schema';

const text=z.string().trim().min(1,'请填写核心结论和下一步行动。').max(10000);
export const sealedTextInput=z.object({action:z.literal('revise_sealed_text'),sourceVersionId:z.uuid(),expectedUpdatedAt:z.iso.datetime(),coreConclusion:text,nextAction:text}).strict();
/** 只复制冻结材料并更正文案；不走计划发布、统计刷新或事项流转。 */
export async function reviseSealedMeetingText(db:Database,meetingId:string,payload:unknown,actor:string) {
 const parsed=sealedTextInput.safeParse(payload);
 if(!parsed.success)throw new WorkflowError(parsed.error.issues[0].message,422);
 const input=parsed.data;
 return db.transaction(async tx=>{
  await lockPromotionWorkflow(tx);
  const [meeting]=await tx.select().from(meetings).where(eq(meetings.id,meetingId)).for('update');
  const [plan]=await tx.select().from(plans).where(eq(plans.meetingId,meetingId)).for('update');
  if(!meeting)throw new WorkflowError('会议不存在。',404);
  if(meeting.meetingType!=='monthly'||!plan?.sealedVersionId)throw new WorkflowError('此入口仅用于已封存月会的文字修订。',422);
  const all=await tx.select().from(versions).where(eq(versions.meetingId,meetingId)).orderBy(desc(versions.versionNumber));
  const source=latestValidMeetingVersion(all);
  if(!source||source.id!==input.sourceVersionId||meeting.updatedAt.toISOString()!==input.expectedUpdatedAt)throw new StaleWriteError('会议已有新的修订，请重新打开最新版本核对；当前输入已保留。');
  const snapshot:any=structuredClone(source.snapshot);
  if(snapshot.schemaVersion!==4||!snapshot.arrangementSealed)throw new WorkflowError('此版本缺少封存材料，不能直接修订。',422);
  if(snapshot.draft.coreConclusion===input.coreConclusion&&snapshot.draft.nextAction===input.nextAction)return {versionNumber:source.versionNumber,versionId:source.id,stage:'post',lifecycleStatus:'finalized',updatedAt:meeting.updatedAt.toISOString(),unchanged:true};
  snapshot.draft={...snapshot.draft,coreConclusion:input.coreConclusion,nextAction:input.nextAction,hasRevisionDraft:false};
  const now=new Date(),updatedAt=new Date(Math.max(now.getTime(),meeting.updatedAt.getTime()+1)),versionNumber=Math.max(...all.map(v=>v.versionNumber))+1;
  const [version]=await tx.insert(versions).values({meetingId,versionNumber,snapshot,sourceVersionId:source.id,versionKind:'revision',lifecycleStatus:'finalized',businessEffects:[],changeSummary:'封存后文字修订',finalizedByLabel:actor,finalizedAt:now,updatedAt,pdfStatus:'pending'}).returning();
  await tx.update(meetings).set({currentVersionNumber:versionNumber,draftSnapshot:snapshot.draft,updatedAt}).where(eq(meetings.id,meetingId));
  return {versionNumber,versionId:version.id,stage:'post',lifecycleStatus:'finalized',updatedAt:updatedAt.toISOString()};
 });
}
