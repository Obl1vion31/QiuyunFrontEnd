import {requestUsedMessage} from './business-messages';
import {createHash} from 'node:crypto';
import {and,asc,eq,gte,inArray,isNull,ne,sql} from 'drizzle-orm';
import type {Database} from './client';
import {WorkflowError,type Transaction} from './schedule-workflow';
import type {OperationsUser} from '../auth/permissions';
import {shanghaiDateKey} from './promotion-rules.mjs';
import {noteIdOn,replaceNoteIdPeriods,type NoteIdPeriod} from './note-identity-rules';
import * as s from './schema';
import type {ResolvedPublicationNote} from './publication-note-link';
import {publicationNoteId} from './publication-link.mjs';

type Reader=Database|Transaction;
export class NoteIdentityError extends WorkflowError {
  override readonly code:string;
  constructor(message:string,code='NOTE_ID_CHANGED',status=409){super(message,status);this.code=code;}
}
const digest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const promotedHistory=sql<boolean>`exists(select 1 from operations_content_schedule ns where ns.content_version_id=${s.operationsContentVersion.id} and (ns.is_promoted or exists(select 1 from operations_promotion_campaign nc where nc.schedule_id=ns.id)))`;
const published=sql<boolean>`exists(select 1 from operations_content_schedule ns where ns.content_version_id=${s.operationsContentVersion.id} and ns.actual_publish_at is not null)`;

/** 两次批量读取，不在每个日度记录或资料气泡中重复查库。 */
export async function readVersionNotes(db:Reader,versionIds:string[]) {
  const ids=[...new Set(versionIds)];
  const rows=ids.length?await db.select({id:s.operationsContentVersion.id,contentId:s.operationsContentVersion.contentId,
    versionNumber:s.operationsContentVersion.versionNumber,sourceVersionId:s.operationsContentVersion.sourceVersionId,workType:s.operationsContentVersion.workType,
    legacyId:s.operationsContent.platformNoteId,promoted:promotedHistory,published}).from(s.operationsContentVersion)
    .innerJoin(s.operationsContent,eq(s.operationsContent.id,s.operationsContentVersion.contentId)).where(inArray(s.operationsContentVersion.id,ids)):[];
  const saved=ids.length?await db.select().from(s.operationsVersionNoteId).where(inArray(s.operationsVersionNoteId.versionId,ids)).orderBy(asc(s.operationsVersionNoteId.effectiveOn)):[];
  return new Map(rows.map(row=>{
    const stored=saved.filter(p=>p.versionId===row.id),pendingRevision=row.promoted&&row.workType==='revision'&&!row.published;
    const periods:NoteIdPeriod[]=stored.length?stored.map(p=>({effectiveOn:p.effectiveOn,platformNoteId:p.platformNoteId,...(p.publicationUrl?{publicationUrl:p.publicationUrl}:{})})).sort((a,b)=>(a.effectiveOn??'').localeCompare(b.effectiveOn??'')):
      [{effectiveOn:null,platformNoteId:pendingRevision?null:row.legacyId}];
    return [row.id,{...row,periods,fingerprint:digest(periods.map(({effectiveOn,platformNoteId})=>({effectiveOn,platformNoteId}))),mode:stored.find(p=>p.effectiveOn===null)?.mode??null}];
  }));
}
export type VersionNote=Awaited<ReturnType<typeof readVersionNotes>> extends Map<string,infer T>?T:never;
export async function requireVersionNote(db:Reader,id:string) {
  const value=(await readVersionNotes(db,[id])).get(id);
  if(!value)throw new NoteIdentityError('没有找到这个帖子版本。','NOTE_VERSION_NOT_FOUND',404);
  return value;
}
export async function claimNoteId(db:Reader,contentId:string,noteId:string) {
  const [legacyOwner]=await db.select({id:s.operationsContent.id}).from(s.operationsContent).where(and(eq(s.operationsContent.platformNoteId,noteId),ne(s.operationsContent.id,contentId)));
  if(legacyOwner)throw new NoteIdentityError('这个笔记 ID 已属于另一篇帖子，请核对。','NOTE_ID_IN_USE');
  await db.insert(s.operationsNoteIdOwner).values({contentId,platformNoteId:noteId}).onConflictDoNothing();
  const [owner]=await db.select().from(s.operationsNoteIdOwner).where(eq(s.operationsNoteIdOwner.platformNoteId,noteId));
  if(owner.contentId!==contentId)throw new NoteIdentityError('这个笔记 ID 已属于另一篇帖子，请核对。','NOTE_ID_IN_USE');
}

/** 在改变任何一版前固定已有版本的旧共享值，避免新值回流到旧版。 */
export async function initializeLegacyNotes(db:Reader,contentId:string) {
  const [content]=await db.select().from(s.operationsContent).where(eq(s.operationsContent.id,contentId)).for('update');
  if(!content)throw new NoteIdentityError('没有找到这篇帖子。','NOTE_VERSION_NOT_FOUND',404);
  const rows=await db.select({id:s.operationsContentVersion.id,sourceVersionId:s.operationsContentVersion.sourceVersionId}).from(s.operationsContentVersion)
    .where(and(eq(s.operationsContentVersion.contentId,contentId),published,promotedHistory));
  if(content.platformNoteId)await claimNoteId(db,contentId,content.platformNoteId);
  for(const row of rows)await db.insert(s.operationsVersionNoteId).values({versionId:row.id,contentId,effectiveOn:null,platformNoteId:content.platformNoteId,mode:'legacy',sourceVersionId:row.sourceVersionId}).onConflictDoNothing();
}

export async function fillInitialVersionNote(db:Reader,versionId:string,date:string,noteId:string) {
  const original=await requireVersionNote(db,versionId);
  await initializeLegacyNotes(db,original.contentId);
  const state=await requireVersionNote(db,versionId),current=noteIdOn(state.periods,date);
  if(current&&current!==noteId)throw new NoteIdentityError('这一天已有笔记 ID，请到历史详情选择更正范围。','NOTE_ID_ALREADY_SET',422);
  if(current)return;
  await claimNoteId(db,state.contentId,noteId);
  await db.delete(s.operationsVersionNoteId).where(and(eq(s.operationsVersionNoteId.versionId,versionId),isNull(s.operationsVersionNoteId.effectiveOn)));
  await db.insert(s.operationsVersionNoteId).values({versionId,contentId:state.contentId,effectiveOn:null,platformNoteId:noteId,mode:'initial',sourceVersionId:state.sourceVersionId});
}

export async function publicationNoteContext(db:Reader,scheduleId:string) {
  const [schedule]=await db.select().from(s.operationsContentSchedule).where(eq(s.operationsContentSchedule.id,scheduleId));
  if(!schedule)throw new NoteIdentityError('没有找到排期。','NOTE_VERSION_NOT_FOUND',404);
  const target=await requireVersionNote(db,schedule.contentVersionId);
  const required=schedule.isPromoted||target.promoted;
  const source=target.sourceVersionId?await requireVersionNote(db,target.sourceVersionId):null;
  const metrics=required?await db.select({date:s.operationsPromotionDailyMetric.metricDate}).from(s.operationsPromotionDailyMetric).innerJoin(s.operationsPromotionCampaign,eq(s.operationsPromotionCampaign.id,s.operationsPromotionDailyMetric.campaignId)).innerJoin(s.operationsContentSchedule,eq(s.operationsContentSchedule.id,s.operationsPromotionCampaign.scheduleId)).where(eq(s.operationsContentSchedule.contentVersionId,target.id)):[];
  return {required,published:!!schedule.actualPublishAt,publicationUrl:schedule.publicationUrl,metricDates:[...new Set(metrics.map(m=>m.date))],versionId:target.id,versionNumber:target.versionNumber,periods:target.periods,fingerprint:target.fingerprint,
    source:source?{versionId:source.id,versionNumber:source.versionNumber,periods:source.periods,fingerprint:source.fingerprint}:null};
}

export async function confirmPublicationNote(db:Reader,scheduleId:string,actual:Date,input:{publicationUrl?:string|null;platformNoteId?:string;expectedNoteIdFingerprint?:string;linkScope?:'version'|'from_date';linkEffectiveOn?:string},resolved:ResolvedPublicationNote|null) {
 const [schedule]=await db.select().from(s.operationsContentSchedule).where(eq(s.operationsContentSchedule.id,scheduleId));
 const original=await requireVersionNote(db,schedule.contentVersionId);
 if((!original.promoted&&!schedule.isPromoted)||!resolved)return;
 if(input.platformNoteId)throw new NoteIdentityError('笔记 ID 现已从发布链接自动提取。请先保留需要的输入，再刷新页面填写发布链接。','NOTE_ID_ENTRY_MOVED',422);
 const latest=noteIdOn(original.periods,'9999-12-31');
 const known=latest??publicationNoteId(schedule.publicationUrl);
 const changesIdentity=original.published&&(known?known!==resolved.noteId:input.publicationUrl!==schedule.publicationUrl);
 if(changesIdentity&&!input.linkScope)throw new NoteIdentityError('链接指向了另一篇笔记，请选择更正本版本或从指定日期起使用新链接。','NOTE_LINK_SCOPE_REQUIRED',422);
 if(input.linkScope==='from_date'&&(!input.linkEffectiveOn||input.linkEffectiveOn<shanghaiDateKey(actual)))throw new NoteIdentityError('请选择不早于首次发布日期的链接生效日期。','NOTE_LINK_DATE_REQUIRED',422);
 if((changesIdentity||input.expectedNoteIdFingerprint)&&original.fingerprint!==input.expectedNoteIdFingerprint)throw new NoteIdentityError('发布链接的笔记归属已变化，请重新核对；当前输入已保留。');
 await initializeLegacyNotes(db,original.contentId);
 await claimNoteId(db,original.contentId,resolved.noteId);
 const state=await requireVersionNote(db,original.id);
 const existing=await db.select().from(s.operationsVersionNoteId).where(eq(s.operationsVersionNoteId.versionId,state.id));
 // 同一笔记补来源不改日期段，也不改变已有报表的身份指纹。
 if(latest===resolved.noteId&&existing.some(p=>p.platformNoteId===resolved.noteId)){
  await db.update(s.operationsVersionNoteId).set({publicationUrl:resolved.url}).where(and(eq(s.operationsVersionNoteId.versionId,state.id),eq(s.operationsVersionNoteId.platformNoteId,resolved.noteId)));
  const last=state.periods.at(-1)!;
  return input.linkScope?{scope:last.effectiveOn?'from_date' as const:'version' as const,effectiveOn:last.effectiveOn??shanghaiDateKey(actual)}:undefined;
 }
 const from=input.linkScope==='from_date'?input.linkEffectiveOn!:null;
 await db.delete(s.operationsVersionNoteId).where(and(eq(s.operationsVersionNoteId.versionId,state.id),...(from?[gte(s.operationsVersionNoteId.effectiveOn,from)]:[])));
 await db.insert(s.operationsVersionNoteId).values({versionId:state.id,contentId:state.contentId,effectiveOn:from,platformNoteId:resolved.noteId,publicationUrl:resolved.url,mode:original.published?'correction':'initial',sourceVersionId:state.sourceVersionId});
 return input.linkScope?{scope:input.linkScope,effectiveOn:from??shanghaiDateKey(actual)}:undefined;
}

export type NoteCorrection={versionId:string;effectiveOn:string;scope:'version'|'from_date';platformNoteId:string;expectedFingerprint:string;requestKey:string};
export async function correctVersionNote(db:Reader,contentId:string,input:NoteCorrection,actor:OperationsUser) {
  const state=await requireVersionNote(db,input.versionId);
  if(state.contentId!==contentId||!state.promoted)throw new NoteIdentityError('请选择这篇推广帖的正确版本。','NOTE_VERSION_MISMATCH',422);
  const inputHash=digest({versionId:input.versionId,effectiveOn:input.effectiveOn,scope:input.scope,platformNoteId:input.platformNoteId}),[repeat]=await db.select().from(s.operationsPromotionTimelineAudit).where(eq(s.operationsPromotionTimelineAudit.requestKey,input.requestKey));
  if(repeat){if(repeat.action!=='note_id_correction'||repeat.changedById!==actor.id||repeat.after.inputHash!==inputHash)throw new NoteIdentityError(requestUsedMessage,'NOTE_REQUEST_REUSED');return {ok:true,repeated:true};}
  await initializeLegacyNotes(db,contentId);
  const before=await requireVersionNote(db,input.versionId);
  if(before.fingerprint!==input.expectedFingerprint)throw new NoteIdentityError('该版本笔记 ID 已更正，请重新核对影响范围；当前输入已保留。');
  if(before.periods.some(p=>p.publicationUrl))throw new NoteIdentityError('笔记 ID 已由发布链接维护，请到发布登记更正链接。','NOTE_ID_FROM_LINK',422);
  const [day]=await db.select({scheduleId:s.operationsContentSchedule.id}).from(s.operationsPromotionDailyMetric)
    .innerJoin(s.operationsPromotionCampaign,eq(s.operationsPromotionCampaign.id,s.operationsPromotionDailyMetric.campaignId))
    .innerJoin(s.operationsContentSchedule,eq(s.operationsContentSchedule.id,s.operationsPromotionCampaign.scheduleId))
    .where(and(eq(s.operationsContentSchedule.contentVersionId,input.versionId),eq(s.operationsPromotionDailyMetric.metricDate,input.effectiveOn))).limit(1);
  if(!day)throw new NoteIdentityError('请选择有历史记录的一天，再更正笔记 ID。','NOTE_HISTORY_DAY_REQUIRED',422);
  await claimNoteId(db,contentId,input.platformNoteId);
  const from=input.scope==='version'?null:input.effectiveOn;
  if(from===null)await db.delete(s.operationsVersionNoteId).where(eq(s.operationsVersionNoteId.versionId,input.versionId));
  else await db.delete(s.operationsVersionNoteId).where(and(eq(s.operationsVersionNoteId.versionId,input.versionId),gte(s.operationsVersionNoteId.effectiveOn,from)));
  await db.insert(s.operationsVersionNoteId).values({versionId:input.versionId,contentId,effectiveOn:from,platformNoteId:input.platformNoteId,mode:'correction',sourceVersionId:state.sourceVersionId});
  const periods=replaceNoteIdPeriods(before.periods,input.platformNoteId,from);
  const identity={versionId:state.id,versionNumber:state.versionNumber,scope:input.scope,effectiveOn:input.effectiveOn};
  await db.insert(s.operationsPromotionTimelineAudit).values({scheduleId:day.scheduleId,requestKey:input.requestKey,businessDate:input.effectiveOn,action:'note_id_correction',
    reason:from===null?'更正本版本全部阶段笔记 ID':`从 ${from} 起统一使用新笔记 ID`,
    before:{noteIdentity:{...identity,periods:before.periods}},after:{noteIdentity:{...identity,periods},inputHash},changedById:actor.id,changedByLabel:actor.username});
  return {ok:true,repeated:false};
}
