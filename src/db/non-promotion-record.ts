import {createHash} from 'node:crypto';
import {and,eq} from 'drizzle-orm';
import type {Database} from './client';
import {operationsContentPerformanceMetric as metrics,operationsNonPromotionReview as reviews} from './schema';
import {readCheckpointEvents} from './non-promotion-workflow';

export function nonPromotionFingerprint(metric:unknown,review:unknown,event:unknown){
 return createHash('sha256').update(JSON.stringify({metric:metric??null,review:review??null,event:event??null},(_key,value)=>value&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b))):value)).digest('hex');
}
export async function readNonPromotionFingerprint(db:Database,scheduleId:string,checkpointType:string){
 const [metric]=await db.select().from(metrics).where(and(eq(metrics.scheduleId,scheduleId),eq(metrics.checkpointType,checkpointType)));
 const [review]=await db.select().from(reviews).where(and(eq(reviews.scheduleId,scheduleId),eq(reviews.checkpointType,checkpointType)));
 const events=await readCheckpointEvents(db,scheduleId);
 return nonPromotionFingerprint(metric,review,events.get(`${scheduleId}:${checkpointType}`));
}
