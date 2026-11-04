import {eq} from 'drizzle-orm';
import type {Database} from '../src/db/client';
import {scheduleWriteVersion} from '../src/db/schedule-write-version';
import {operationsContentSchedule as schedules,operationsContentVersion as versions,operationsContent as contents} from '../src/db/schema';

/** 顺序业务回归的“重新打开编辑”步骤；并发专项自行保留原始读取凭据。 */
export async function readScheduleVersion(db:Database,id:string){
 const [row]=await db.select({version:scheduleWriteVersion}).from(schedules).innerJoin(versions,eq(versions.id,schedules.contentVersionId)).innerJoin(contents,eq(contents.id,versions.contentId)).where(eq(schedules.id,id));
 return row?.version;
}
