import {createHash} from 'node:crypto';
import {and,eq} from 'drizzle-orm';
import type {Database} from './client';
import {operationsContentPerformanceMetric as metrics,operationsNonPromotionReview as reviews} from './schema';
import {readCheckpointEvents} from './non-promotion-workflow';

export function nonPromotionFingerprint(metric:unknown,review:unknown,event:unknown){
 return createHash('sha256').update(JSON.stringify({metric:nonPromotionSource(metric),review:nonPromotionSource(review),event:nonPromotionSource(event)},(_key,value)=>value&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b))):value)).digest('hex');
}
/** 兼容迁移新增的空字段不冒充历史源数据变更。 */
export function nonPromotionSource(value:unknown):unknown{
 if(!value||typeof value!=='object')return value;
 return Object.fromEntries(Object.entries(value).filter(([key,item])=>!(item==null&&['statisticsFrom','contentRole','customCheckpointId','exposureCount','readCount','exposureCountSnapshot','readCountSnapshot'].includes(key))));
}
export async function readNonPromotionFingerprint(db:Database,scheduleId:string,checkpointType:string){
 const [metric]=await db.select().from(metrics).where(and(eq(metrics.scheduleId,scheduleId),eq(metrics.checkpointType,checkpointType)));
 const [review]=await db.select().from(reviews).where(and(eq(reviews.scheduleId,scheduleId),eq(reviews.checkpointType,checkpointType)));
 const events=await readCheckpointEvents(db,scheduleId);
 return nonPromotionFingerprint(metric,review,events.get(`${scheduleId}:${checkpointType}`));
}
