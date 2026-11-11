/** ID 和当前资料独立于可冻结的例会材料与来源指纹。 */
import {eq,inArray} from 'drizzle-orm';
import {readVersionNotes} from './note-identities';
import {noteIdOn} from './note-identity-rules';
import type {Database} from './client';
import type {WeeklyMaterial} from './meeting-weekly-material';
import {operationsContent as contents,operationsContentVersion as versions,operationsContentSchedule as schedules} from './schema';
import {shanghaiDateKey} from './stage-review-rules.mjs';

export type WeeklyPostReference={versionNumber:number;publishedOn:string|null;projectDocUrl:string|null;publicationUrl:string|null};
export async function readWeeklyPostDetails(db:Database, material:{promotions?:Array<{scheduleId:string}>;nonPromotions:Array<{scheduleId:string}>;pending?:WeeklyMaterial['pending']}) {
  const ids=[...new Set([...(material.promotions??[]).map(row=>row.scheduleId),...material.nonPromotions.map(row=>row.scheduleId),...(material.pending??[]).map(row=>row.scheduleId??row.key.split(':')[0])])];
  const noteIds:Record<string,string|null>={},postReferences:Record<string,WeeklyPostReference>={};
  if(!ids.length)return {noteIds,postReferences};
  const rows=await db.select({versionId:versions.id,scheduleId:schedules.id,versionNumber:versions.versionNumber,noteId:contents.platformNoteId,actualPublishAt:schedules.actualPublishAt,projectDocUrl:versions.projectDocUrl,publicationUrl:schedules.publicationUrl}).from(schedules)
    .innerJoin(versions,eq(schedules.contentVersionId,versions.id)).innerJoin(contents,eq(versions.contentId,contents.id)).where(inArray(schedules.id,ids));
  const states=await readVersionNotes(db,rows.map(r=>r.versionId));
  for(const row of rows){noteIds[row.scheduleId]=noteIdOn(states.get(row.versionId)!.periods,shanghaiDateKey(new Date()));postReferences[row.scheduleId]={versionNumber:row.versionNumber,publishedOn:row.actualPublishAt?shanghaiDateKey(row.actualPublishAt):null,projectDocUrl:row.projectDocUrl,publicationUrl:row.publicationUrl};}
  return {noteIds,postReferences};
}
