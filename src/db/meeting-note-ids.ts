/** ID 属于逻辑帖子，独立于可冻结的例会材料与来源指纹。 */
import {eq,inArray} from 'drizzle-orm';
import type {Database} from './client';
import type {WeeklyMaterial} from './meeting-weekly-material';
import {operationsContent as contents,operationsContentVersion as versions,operationsContentSchedule as schedules} from './schema';

export async function readWeeklyNoteIds(db:Database, material:WeeklyMaterial):Promise<Record<string,string|null>> {
  const ids=[...new Set([...material.nonPromotions.map(row=>row.scheduleId),...material.pending.map(row=>row.scheduleId??row.key.split(':')[0])])];
  if(!ids.length)return {};
  const rows=await db.select({scheduleId:schedules.id,noteId:contents.platformNoteId}).from(schedules)
    .innerJoin(versions,eq(schedules.contentVersionId,versions.id)).innerJoin(contents,eq(versions.contentId,contents.id)).where(inArray(schedules.id,ids));
  return Object.fromEntries(rows.map(row=>[row.scheduleId,row.noteId]));
}
