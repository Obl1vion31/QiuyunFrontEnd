/** 定稿修订只合并文字；回溯在原生效日前原子撤销，并保留失效版本。 */
import {and,eq,desc} from 'drizzle-orm';
import type {Database} from './client';
import type {Transaction} from './schedule-workflow';
import {WorkflowError} from './schedule-workflow';
import {discussionSchema,mergeDiscussion} from './meeting-discussion';
import {meetingEffectiveOn,meetingArrangementsExpired,latestValidMeetingVersion,activeMeetingDraft,meetingVersionDraft} from './meeting-version-rules';
import {meetingFinalizationIssue} from './meeting-finalization';
import {readPromotionContext,lockPromotionWorkflow} from './promotion-pauses';
import {promotionStateOn} from './promotion-state.mjs';
import {shanghaiDateKey} from './promotion-rules.mjs';
import {meetingNextDecision} from './meeting-decision-rules.mjs';
import {sourceHash} from './meeting-weekly-material';
import {operationsReviewMeeting as meetings,operationsReviewMeetingVersion as versions,operationsReviewActionItem as items,operationsReviewActionProgress as progress} from './schema';
const clone=<T>(value:T):T=>structuredClone(value);
const same=(a:any,b:any)=>sourceHash(a)===sourceHash(b);
const canonicalDecisions=(snapshot:any)=>({...Object.fromEntries((snapshot.generated?.meetingDecisions??[]).map((d:any)=>[d.campaignId,d.action==='restart_testing'?'restart_testing':d.targetStatus])),...snapshot.draft.promotionDecisions});
export async function persistMeetingIssues(tx:Transaction,meetingId:string,issues:any[],sourceIssues:any[],actor:string,changedOnly=false){
 const persisted:any[]=[],effects:any[]=[];
 for(const issue of issues){
  const prior=issue.id?sourceIssues.find(i=>i.id===issue.id):undefined;
  if(changedOnly&&prior&&same(prior,issue)){persisted.push(issue);continue;}
  if(!issue.problem.trim())throw new WorkflowError('请补充事项的问题，或删除新增空行。',422);
  const [beforeItem]=issue.id?await tx.select().from(items).where(eq(items.id,issue.id)).for('update'):[];
  const [beforeProgress]=issue.id?await tx.select().from(progress).where(and(eq(progress.itemId,issue.id),eq(progress.meetingId,meetingId))):[];
  const itemPatch=changedOnly&&prior?{...(issue.problem!==prior.problem?{problem:issue.problem.trim()}:{}),...(issue.status!==prior.status?{status:issue.status,resolvedMeetingId:issue.status==='resolved'?meetingId:null}:{})}:{problem:issue.problem.trim(),status:issue.status,resolvedMeetingId:issue.status==='resolved'?meetingId:null};
  const [afterItem]=beforeItem?Object.keys(itemPatch).length?await tx.update(items).set({...itemPatch,updatedAt:new Date()}).where(eq(items.id,beforeItem.id)).returning():[beforeItem]:await tx.insert(items).values({problem:issue.problem.trim(),status:issue.status,createdMeetingId:meetingId,resolvedMeetingId:issue.status==='resolved'?meetingId:null}).returning();
  const [afterProgress]=await tx.insert(progress).values({itemId:afterItem.id,meetingId,conclusion:issue.conclusion.trim()||'本周暂无新进展',statusSnapshot:issue.status,recordedByLabel:actor}).onConflictDoUpdate({target:[progress.itemId,progress.meetingId],set:{conclusion:issue.conclusion.trim()||'本周暂无新进展',statusSnapshot:issue.status,recordedByLabel:actor}}).returning();
  effects.push({beforeItem:beforeItem??null,beforeProgress:beforeProgress??null,afterItem,afterProgress});persisted.push({...issue,id:afterItem.id});
 }
 return {persisted,effects};
}
async function undoEffects(tx:Transaction,meetingId:string,effects:any[]){
 for(const effect of [...effects].reverse()){
  if(effect.type==='meeting_decisions_reset')continue;
  const [live]=await tx.select().from(items).where(eq(items.id,effect.afterItem.id)).for('update');
  const [liveProgress]=await tx.select().from(progress).where(and(eq(progress.itemId,effect.afterItem.id),eq(progress.meetingId,meetingId)));
  const other=await tx.select().from(progress).where(eq(progress.itemId,effect.afterItem.id));
  if(!same(live,effect.afterItem)||!same(liveProgress,effect.afterProgress)||other.some(p=>p.meetingId!==meetingId&&new Date(p.createdAt)>new Date(effect.afterProgress.createdAt)))throw new WorkflowError('事项已被其他工作更新，不能回溯覆盖，请先核对。');
  if(effect.beforeProgress){const {id,createdAt,...values}=effect.beforeProgress;await tx.update(progress).set(values).where(eq(progress.id,liveProgress.id));}
  else await tx.delete(progress).where(eq(progress.id,liveProgress.id));
  if(effect.beforeItem){const {id,createdAt,updatedAt,...values}=effect.beforeItem;await tx.update(items).set({...values,updatedAt:new Date(updatedAt)}).where(eq(items.id,id));}
  else {if(other.some(p=>p.meetingId!==meetingId))throw new WorkflowError('事项已被其他会议引用，不能回溯。');await tx.delete(items).where(eq(items.id,effect.afterItem.id));}
 }
}
export async function reviseMeetingVersion(db:Database,meetingId:string,payload:any,actor:string,at?:Date){
 return db.transaction(async tx=>{
  await lockPromotionWorkflow(tx);
  const now=at??new Date();
  const [meeting]=await tx.select().from(meetings).where(eq(meetings.id,meetingId)).for('update');
  if(!meeting)throw new WorkflowError('会议不存在。',404);
  if(!payload.expectedUpdatedAt||payload.expectedUpdatedAt!==meeting.updatedAt.toISOString())throw new WorkflowError('会议已更新，输入已保留，请重新打开最新版本。');
  const all=await tx.select().from(versions).where(eq(versions.meetingId,meetingId)).orderBy(desc(versions.versionNumber));
  if(!['save_version_draft','finalize_version_draft','rollback_version'].includes(payload.action))throw new WorkflowError('例会流程已更新，请刷新页面后继续，输入已保留。',409);
  const current=latestValidMeetingVersion(all),active=activeMeetingDraft(all),source=all.find(v=>v.id===payload.sourceVersionId);
  if(!current||!source||source.lifecycleStatus==='draft'||source.invalidatedAt||(source.snapshot as any).schemaVersion!==4)throw new WorkflowError('该版本不能用于编辑或回溯。');
  const effectiveOn=meetingEffectiveOn(meeting,all),expired=meetingArrangementsExpired(effectiveOn,now),versionNumber=Math.max(...all.map(v=>v.versionNumber))+1;
  const updatedAt=new Date(Math.max(now.getTime(),meeting.updatedAt.getTime()+1));
  if(payload.action==='rollback_version'){
   if(expired)throw new WorkflowError('已过可编辑时间，不能回溯。',422);
   if(active)throw new WorkflowError('请先完成当前版本草稿，再进行回溯。');
   if(!payload.confirmed||source.id===current.id)throw new WorkflowError('请先确认要回溯的历史版本。',422);
   const affected=all.filter(v=>!v.invalidatedAt&&v.versionNumber>source.versionNumber);
   for(const v of affected){if(!v.businessEffects&&(v.snapshot as any).finalizationStage==='post'&&(v.snapshot as any).draft?.issues?.length)throw new WorkflowError('该历史版本缺少事项回溯记录，无法安全撤销。');await undoEffects(tx,meetingId,v.businessEffects??[]);}
   const snapshot:any=clone(source.snapshot);snapshot.finalizationStage='pre';delete snapshot.decisionPolicy;snapshot.decisionEffectiveOn=effectiveOn;snapshot.generated.meetingDecisions=[];snapshot.draft={...snapshot.draft,workflowVersion:6,finalizationStage:'pre',promotionDecisions:{},arrangementsRequireConfirmation:true,hasRevisionDraft:false};
   const [created]=await tx.insert(versions).values({meetingId,versionNumber,lifecycleStatus:'draft',snapshot,sourceVersionId:source.id,versionKind:'rollback',businessEffects:[{type:'meeting_decisions_reset',effectiveOn,at:now.toISOString()}],changeSummary:`回溯至 V${source.versionNumber}，待重新会后定稿`,updatedAt}).returning();
   for(const v of affected)await tx.update(versions).set({invalidatedAt:now,invalidatedByVersionId:created.id}).where(eq(versions.id,v.id));
   await tx.update(meetings).set({currentVersionNumber:source.versionNumber,draftSnapshot:snapshot.draft,updatedAt,status:'completed'}).where(eq(meetings.id,meetingId));
   return {versionNumber,versionId:created.id,stage:'pre',lifecycleStatus:'draft',updatedAt:updatedAt.toISOString(),edit:true};
  }
  if(source.id!==current.id)throw new WorkflowError('只有最新有效版本可以编辑。');
  if(active&&(active.sourceVersionId!==source.id||payload.draftVersionId!==active.id))throw new WorkflowError('已有版本草稿，请重新打开该草稿继续。');
  const parsed=discussionSchema.safeParse(payload.discussion);
  if(!parsed.success||payload.draft)throw new WorkflowError('修订内容格式不正确，输入已保留。',422);
  const originalSnapshot:any=clone(source.snapshot);originalSnapshot.draft=meetingVersionDraft(originalSnapshot,meeting.draftSnapshot);
  // 旧定稿可能早于事项编号回写；首次开草稿时固定原事项身份，后续编辑不能改变比较基线。
  if((active?.snapshot as any)?.revisionSourceIssues)originalSnapshot.draft.issues=clone((active!.snapshot as any).revisionSourceIssues);
  const original=canonicalDecisions(originalSnapshot);
  const baseline:any=clone(active?.snapshot??originalSnapshot);baseline.draft=meetingVersionDraft(baseline,meeting.draftSnapshot);
  baseline.draft.promotionDecisions=active?canonicalDecisions(baseline):original;
  const draft=mergeDiscussion(baseline,parsed.data,source.id);
  if(expired&&!same(original,draft.promotionDecisions))throw new WorkflowError('已过可编辑时间，下一步安排不可修改。',422);
  const finalizing=payload.action==='finalize_version_draft';
  const stage=finalizing?payload.stage:baseline.finalizationStage;
  if(!['pre','post'].includes(stage)||originalSnapshot.finalizationStage==='post'&&stage!=='post'&&active?.versionKind!=='rollback')throw new WorkflowError('请使用当前版本对应的定稿阶段。',422);
  const firstPost=stage==='post'&&(originalSnapshot.finalizationStage!=='post'||active?.versionKind==='rollback');
  if(finalizing&&firstPost&&expired)throw new WorkflowError('已过安排生效时间，不能重新发布旧安排。',422);
  if(finalizing&&draft.issues.some(i=>!i.problem.trim()))throw new WorkflowError('请补充事项的问题，或删除新增空行。',422);
  if(finalizing){const issue=meetingFinalizationIssue(draft,stage,[]);if(issue)throw new WorkflowError(issue.message,422);}
  const targetNumber=active?.versionNumber??versionNumber;
  const snapshot:any={...baseline,draft:{...draft,workflowVersion:6,hasRevisionDraft:false,finalizationStage:stage},finalizationStage:stage,decisionEffectiveOn:effectiveOn};
  if(!finalizing)snapshot.revisionSourceIssues=clone(originalSnapshot.draft.issues);else delete snapshot.revisionSourceIssues;
  snapshot.generated=clone(baseline.generated);delete snapshot.decisionPolicy;
  const arrangementChanged=!same(original,draft.promotionDecisions);
  if(finalizing&&stage==='post'&&(firstPost||arrangementChanged)){
   if(expired)throw new WorkflowError('已过可编辑时间。',422);
   const context=await readPromotionContext(tx),today=shanghaiDateKey(now),decisions:any[]=[];
   for(const card of snapshot.generated.promotions??[]){
    if(card.testCycleEndedOn||decisions.some(d=>d.campaignId===card.campaignId))continue;
    const campaign=context.campaigns.find(c=>c.id===card.campaignId),state=campaign&&promotionStateOn(campaign,context,today);
    if(!state?.currentStage)continue;
    const target=draft.promotionDecisions?.[card.campaignId]??((draft as any).arrangementsRequireConfirmation?undefined:state?.currentStatus);
    if(!target||!meetingNextDecision(state.currentStatus,target))throw new WorkflowError(card.contentName+' 的下一步需要重新确认。',422);
    if(context.metrics.some(m=>m.campaignId===card.campaignId&&m.metricDate>=effectiveOn)||context.meetingDecisions.some(d=>d.campaignId===card.campaignId&&d.effectiveOn===effectiveOn&&d.meetingId!==meetingId))throw new WorkflowError('生效日期已有指标或其他会议决定，请核对后处理。');
    decisions.push({id:meetingId+':'+card.campaignId+':'+effectiveOn,campaignId:card.campaignId,scheduleId:card.scheduleId,effectiveOn,targetStatus:target==='restart_testing'?'testing':target,...(target==='restart_testing'?{action:'restart_testing'}:{}),stageType:state.currentStage,meetingId,versionNumber:targetNumber,label:meeting.name});
   }
   snapshot.generated.meetingDecisions=decisions;snapshot.draft.arrangementsRequireConfirmation=false;
  }
  if(stage==='post'&&!firstPost&&!arrangementChanged)snapshot.decisionPolicy='inherit';
  let businessEffects:any[]=(active?.businessEffects??[]).filter((e:any)=>e.type==='meeting_decisions_reset');
  if(finalizing&&stage==='post'){const result=await persistMeetingIssues(tx,meetingId,draft.issues,firstPost?[]:originalSnapshot.draft.issues,actor,!firstPost);snapshot.draft.issues=result.persisted;businessEffects.push(...result.effects);}
  const lifecycleStatus=finalizing?'finalized':'draft';
  const values={snapshot,lifecycleStatus,businessEffects,updatedAt,pdfStatus:finalizing&&stage==='post'?'pending':null,changeSummary:`${stage==='pre'?'会前':'会后'} V${targetNumber}${finalizing?'定稿':'草稿'} · 修订自 V${source.versionNumber}`,finalizedByLabel:finalizing?actor:null,finalizedAt:finalizing?now:null};
  const [created]=active?await tx.update(versions).set(values).where(eq(versions.id,active.id)).returning():await tx.insert(versions).values({...values,meetingId,versionNumber:targetNumber,sourceVersionId:source.id,versionKind:'revision'}).returning();
  await tx.update(meetings).set({...(finalizing?{currentVersionNumber:targetNumber,finalizedAt:now}:{}),draftSnapshot:snapshot.draft,updatedAt,status:'completed'}).where(eq(meetings.id,meetingId));
  return {versionNumber:targetNumber,versionId:created.id,stage,lifecycleStatus,updatedAt:updatedAt.toISOString()};
 },{isolationLevel:'repeatable read'});
}
