import {eq,sql} from 'drizzle-orm';
import type {Database} from './client';
import {operationsContentSchedule as schedules,operationsContentVersion as versions,operationsContent as contents} from './schema';
import {StaleWriteError} from './schedule-workflow';

/** 与页面行在同一次 SELECT 读取，避免页面内容和保存凭据来自不同时刻。 */
export const scheduleWriteVersion = sql<string>`md5(concat(
 extract(epoch from ${schedules.updatedAt}), '|', extract(epoch from ${versions.updatedAt}), '|', extract(epoch from ${contents.updatedAt}), '|',
 (select max(v.version_number) from operations_content_version v where v.content_id = ${contents.id}), '|',
 (select coalesce(jsonb_agg(to_jsonb(c) order by c.id)::text,'') from operations_promotion_campaign c where c.schedule_id = ${schedules.id}), '|',
 (select coalesce(jsonb_agg(to_jsonb(m) order by m.id)::text,'') from operations_promotion_daily_metric m join operations_promotion_campaign c on c.id=m.campaign_id where c.schedule_id = ${schedules.id}), '|',
 (select coalesce(jsonb_agg(to_jsonb(m) order by m.id)::text,'') from operations_content_performance_metric m where m.schedule_id = ${schedules.id}), '|',
 (select coalesce(string_agg(concat(r.id,':',r.current_version_number),'|' order by r.id),'') from operations_non_promotion_review r where r.schedule_id = ${schedules.id}), '|',
 (select max(e.sequence) from operations_non_promotion_checkpoint_event e where e.schedule_id = ${schedules.id}), '|',
 (select p.revision from operations_non_promotion_review_plan p where p.content_id = ${contents.id}), '|',
 (select coalesce(jsonb_agg(to_jsonb(n) order by n.id)::text,'') from operations_non_promotion_custom_checkpoint n where n.content_id = ${contents.id})
))`;

export async function requireScheduleWriteVersion(db:Database,id:string,expected:unknown){
  const [row]=await db.select({version:scheduleWriteVersion}).from(schedules)
    .innerJoin(versions,eq(versions.id,schedules.contentVersionId)).innerJoin(contents,eq(contents.id,versions.contentId)).where(eq(schedules.id,id));
  if(!row||!expected||row.version!==expected)throw new StaleWriteError();
}

/** 排期审批也会截取请求，因此在进入审批／实际写入前检查同一份读取凭据。 */
export async function checkScheduleRequestVersion(db:Database,request:Request){
  const parts=new URL(request.url).pathname.split('/').filter(Boolean);
  if(parts[1]!=='operations-content')return;
  let data:Record<string,unknown>;
  try{
    const copy=request.clone();
    data=copy.headers.get('content-type')?.includes('application/json')?await copy.json():Object.fromEntries((await copy.formData()).entries());
  }catch{return;}
  if(parts[3]==='platform-note-id'){
    if(data.versionId)return; // 版本／日期范围由身份事务核对完整映射指纹。
    const [row]=await db.select({noteId:contents.platformNoteId}).from(contents).where(eq(contents.id,parts[2]));
    if(!Object.hasOwn(data,'expectedPlatformNoteId')||!row||row.noteId!==data.expectedPlatformNoteId)throw new StaleWriteError();
    return;
  }
  if(parts[2]==='versions'&&request.method==='POST'){
    if(typeof data.sourceScheduleId==='string')await requireScheduleWriteVersion(db,data.sourceScheduleId,data.expectedWriteVersion);
    return;
  }
  if((request.method==='PATCH'&&(!parts[3]||parts[3]==='publication')&&data.action!=='reviewPlan')||(request.method==='DELETE'&&!parts[3]))await requireScheduleWriteVersion(db,parts[2],data.expectedWriteVersion);
}
