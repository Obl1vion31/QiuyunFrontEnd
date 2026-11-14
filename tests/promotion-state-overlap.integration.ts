/** 八种状态与前后安排重叠：通过正式接口保存，全部使用隔离数据库。 */
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {and,eq} from 'drizzle-orm';
import {startPostgresFixture} from './postgres.fixture';
import {admin,employee} from './auth.fixture';
import {seedStateOverlap,overlapStates,overlapSources,type OverlapState} from './promotion-state-overlap.fixture';
import {promotionSnapshot,timelineFingerprint} from '../src/db/promotion-timeline';
import * as s from '../src/db/schema';
const dir=process.env.OVERLAP_DIR??'.tools/test-artifacts/promotion-overlap';await mkdir(dir,{recursive:true});const clockFile=process.cwd()+'/'+dir+'/clock.txt';await writeFile(clockFile,'2026-11-12T12:00:00+08:00');
const f=await startPostgresFixture({clockFile,entry:process.env.OVERLAP_ENTRY}),{db,baseURL}=f;const results:Array<Record<string,unknown>>=[],failures:Array<Record<string,unknown>>=[],rejections:Array<Record<string,unknown>>=[];
async function login(actor:any){const r=await fetch(baseURL+'/api/auth/sign-in/username',{method:'POST',headers:{Origin:baseURL,'Content-Type':'application/json'},body:JSON.stringify(actor)});assert.equal(r.status,200);return r.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');}
try{
 const adminCookie=await login(admin),employeeCookie=await login(employee);
 const variants:OverlapState[]=[...overlapStates,
  {...overlapStates[1],prior:'test_pending',label:'原计划待定，当日改暂停'},
  {...overlapStates[2],prior:'test_pause',label:'原计划暂停，当日改待定'},
  {...overlapStates[1],prior:'test_continue',label:'原计划测试，当日改暂停'},
  {...overlapStates[2],prior:'test_continue',label:'原计划测试，当日改待定'},
  {...overlapStates[4],prior:'scaling_continue',label:'原计划放量，当日改暂停'},
  {...overlapStates[0],prior:'test_pause',label:'原计划暂停，当日实际测试'},
  {...overlapStates[0],prior:'test_pending',label:'原计划待定，当日实际测试'},
  {...overlapStates[3],prior:'scaling_pause',label:'原计划暂停，当日实际放量'},
 ];
 for(const spec of variants)for(const source of overlapSources)for(const spend of [0,12.5]){
  const row=await seedStateOverlap(db,spec,source,'隔离核对 · '+spec.label),before=await promotionSnapshot(db,row.post.schedule.id),cookie=spend===0?adminCookie:employeeCookie;
  const form=new FormData();for(const[k,v]of Object.entries({campaignId:row.campaign.id,metricDate:'2026-11-11',dailyStatus:spec.status===spec.stage?'active':'waiting_action',actualStatusSnapshot:spec.status,stageTypeSnapshot:spec.stage,recordKind:'regular',reviewDecision:spec.next,platformNoteId:row.noteId,spend,platformOpenCount:spend?2:0,actualOpenCount:spend?1:0,platformLeadCount:0,actualLeadCount:0,requestKey:randomUUID(),fingerprint:timelineFingerprint(before)}))form.set(k,String(v));
  const response=await fetch(baseURL+'/api/promotion-daily',{method:'POST',headers:{Origin:baseURL,Cookie:cookie,Accept:'application/json'},body:form}),body=await response.json();
  const outcome={status:spec.status,label:spec.label,priorDecision:spec.prior,source,spend,role:spend===0?'admin':'employee',http:response.status,...(response.status!==201?{message:body.message}:{})};results.push(outcome);
  if(response.status!==201){failures.push(outcome);continue;}
  const [saved]=await db.select().from(s.operationsPromotionDailyMetric).where(and(eq(s.operationsPromotionDailyMetric.campaignId,row.campaign.id),eq(s.operationsPromotionDailyMetric.metricDate,'2026-11-11')));assert.equal(Number(saved.spend),spend);assert.equal(saved.actualStatusSnapshot,spec.status);
  const after=await promotionSnapshot(db,row.post.schedule.id);assert.deepEqual(after.metrics.find(m=>m.id===row.prior.id),row.prior);assert.equal(after.campaigns[0].currentStatus,spec.status);assert.equal(after.campaigns[0].endedOn,row.campaign.endedOn);assert.equal(after.campaigns[0].currentStage,row.campaign.currentStage);assert.deepEqual(after.stages.map(v=>({stageType:v.stageType,startedOn:v.startedOn,endedOn:v.endedOn,outcome:v.outcome})),row.stages.map(v=>({stageType:v.stageType,startedOn:v.startedOn,endedOn:v.endedOn,outcome:v.outcome})));assert.equal(saved.sourceStageStartedOn,'2026-11-10');
  if(row.frozen){const[v]=await db.select().from(s.operationsReviewMeetingVersion).where(eq(s.operationsReviewMeetingVersion.id,row.frozen.id));assert.deepEqual(v.snapshot,row.frozen.snapshot);}
 }
 for(const spec of overlapStates.filter(v=>v.terminal)){
  const row=await seedStateOverlap(db,spec,'next_day_meeting','确有冲突的隔离样本');const snapshot={...row.frozen!.snapshot,generated:{meetingDecisions:[{...(row.frozen!.snapshot as any).generated.meetingDecisions[0],targetStatus:'testing',stageType:'testing'}]}};await db.update(s.operationsReviewMeetingVersion).set({snapshot}).where(eq(s.operationsReviewMeetingVersion.id,row.frozen!.id));
  for(const cookie of [adminCookie,employeeCookie]){
   const before=await promotionSnapshot(db,row.post.schedule.id),form=new FormData();for(const[k,v]of Object.entries({campaignId:row.campaign.id,metricDate:'2026-11-11',dailyStatus:'waiting_action',actualStatusSnapshot:spec.status,stageTypeSnapshot:spec.stage,recordKind:'regular',reviewDecision:spec.next,platformNoteId:row.noteId,spend:0,platformOpenCount:0,actualOpenCount:0,platformLeadCount:0,actualLeadCount:0,requestKey:randomUUID(),fingerprint:timelineFingerprint(before)}))form.set(k,String(v));
   const response=await fetch(baseURL+'/api/promotion-daily',{method:'POST',headers:{Origin:baseURL,Cookie:cookie},body:form}),body=await response.json();assert.equal(response.status,422,JSON.stringify(body));assert.match(body.message,/2026-11-11/);assert.match(body.message,/2026-11-12/);assert.match(body.message,/测试中/);assert.deepEqual(await promotionSnapshot(db,row.post.schedule.id),before);rejections.push({status:spec.status,http:response.status,datesExplained:true,unchanged:true});
  }
 }
 await writeFile(dir+'/matrix.json',JSON.stringify({passed:!failures.length,total:results.length,failures,results,rejections,productionWrites:false},null,2));console.log(JSON.stringify({total:results.length,passed:results.length-failures.length,failures,expectedRejections:rejections.length},null,2));assert.deepEqual(failures,[],'合法的重复状态与前后安排必须可以保存');
}finally{await f.stop();}
