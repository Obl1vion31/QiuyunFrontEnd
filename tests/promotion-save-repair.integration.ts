import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {eq} from 'drizzle-orm';
import {startPostgresFixture} from './postgres.fixture';
import {seedLinkPost} from './monthly-plan-links.fixture';
import {admin,employee} from './auth.fixture';
import * as s from '../src/db/schema';
const dir='.tools/test-artifacts/scheduling-review';await mkdir(dir,{recursive:true});const f=await startPostgresFixture(),{db,baseURL}=f;const checks:string[]=[];
async function login(actor:any){const r=await fetch(baseURL+'/api/auth/sign-in/username',{method:'POST',headers:{Origin:baseURL,'Content-Type':'application/json'},body:JSON.stringify(actor)});assert.equal(r.status,200);return r.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');}
let boss='',staff='';
async function api(cookie:string,path:string,body?:any,expected=200,method='POST'){
 const r=await fetch(baseURL+path,{method:body===undefined?'GET':method,headers:{Cookie:cookie,Origin:baseURL,Accept:'application/json',...(body instanceof FormData?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:body instanceof FormData?body:JSON.stringify(body)}),value=await r.json();assert.equal(r.status,expected,JSON.stringify({path,value}));return value;
}
async function seed(name:string,kind:'none'|'manual'|'meeting-past'|'meeting-future'|'paused'='none'){
 const p=await seedLinkPost(db,name,'2026-10-27T10:00');await db.update(s.operationsContentSchedule).set({isPromoted:true,promotionStatus:kind==='paused'?'test_paused':'testing',actualPublishAt:new Date('2026-10-27T02:00Z')}).where(eq(s.operationsContentSchedule.id,p.schedule.id));
 const [campaign]=await db.insert(s.operationsPromotionCampaign).values({scheduleId:p.schedule.id,startedOn:'2026-10-27',initialStage:'testing',currentStage:'testing',currentStatus:kind==='paused'?'test_paused':'testing'}).returning();
 const dates=kind==='paused'?['2026-10-27','2026-10-28']:['2026-10-27','2026-10-28','2026-10-29','2026-10-30'];
 const metrics=await db.insert(s.operationsPromotionDailyMetric).values(dates.map(metricDate=>({campaignId:campaign.id,metricDate,dailyStatus:kind==='paused'?'waiting_action':'active',stageTypeSnapshot:'testing',actualStatusSnapshot:kind==='paused'?'test_paused':'testing',recordKind:'regular',sourceStageStartedOn:'2026-10-27',reviewDecision:kind==='paused'?'wait_continue':'test_continue',spend:'20',platformOpenCount:1,actualOpenCount:1,platformLeadCount:1,actualLeadCount:1}))).returning();
 if(kind==='paused'||kind==='manual')await db.insert(s.operationsPromotionDayDecision).values({campaignId:campaign.id,businessDate:kind==='paused'?'2026-10-27':'2026-10-30',stageType:'testing',actualStatus:kind==='paused'?'test_paused':'testing',reason:'已存在的人工安排'});
 let frozen:any,versionId:string|undefined;
 if(kind.startsWith('meeting')){
  const date=kind==='meeting-past'?'2026-10-27':'2026-10-30';
  const [meeting]=await db.insert(s.operationsReviewMeeting).values({name:'隔离会后安排',meetingType:'weekly',periodStart:'2026-10-20',periodEnd:'2026-10-26',meetingAt:new Date('2026-10-26T08:00Z'),status:'completed',createdByLabel:'fixture'}).returning();
  frozen={schemaVersion:4,finalizationStage:'post',decisionEffectiveOn:date,generated:{meetingDecisions:[{id:randomUUID(),campaignId:campaign.id,scheduleId:p.schedule.id,effectiveOn:date,targetStatus:'testing',stageType:'testing',meetingId:meeting.id,versionNumber:0,label:'隔离会后决定'}]}};
  const [v]=await db.insert(s.operationsReviewMeetingVersion).values({meetingId:meeting.id,versionNumber:0,snapshot:frozen,changeSummary:'隔离冻结安排'}).returning();versionId=v.id;
 }
 return {post:p,campaign,metrics,frozen,versionId};
}
try{
 boss=await login(admin);staff=await login(employee);
 const ordinary=await seed('历史指标普通保存');
 const metric=ordinary.metrics[0],form=new FormData();
 for(const[k,v]of Object.entries({...metric,spend:'35',expectedUpdatedAt:'',fingerprint:'old-or-empty'}))if(v!==null)form.set(k,String(v));
 const saved=await api(staff,'/api/promotion-daily/'+metric.id,form,200,'PATCH');assert(saved.ok);
 form.set('spend','40');await api(boss,'/api/promotion-daily/'+metric.id,form,200,'PATCH');assert.equal((await db.select().from(s.operationsPromotionDailyMetric).where(eq(s.operationsPromotionDailyMetric.id,metric.id)))[0].spend,'40.00');
 checks.push('历史指标缺少旧凭据也不假报协作；员工与管理员普通保存按最后成功值生效');
 for(const kind of ['none','manual','meeting-past','meeting-future'] as const){
  const fixture=await seed('历史淘汰影响 '+kind,kind),rows=await api(boss,'/api/promotion-timeline?schedule='+fixture.post.schedule.id);
  const input={scheduleId:fixture.post.schedule.id,reviewDate:'2026-10-28',action:'status',targetStatus:'test_discarded',reason:'从这一天起淘汰，调整后续安排',requestKey:randomUUID(),fingerprint:rows[0].fingerprint};
  await api(staff,'/api/promotion-timeline',input,403);
  const preview=await api(boss,'/api/promotion-timeline',input,409);assert(preview.confirmationRequired);assert.equal(preview.impact.dailyMetrics,2);
  assert.equal((await db.select().from(s.operationsPromotionDailyMetric).where(eq(s.operationsPromotionDailyMetric.campaignId,fixture.campaign.id))).length,4);
  const done=await api(boss,'/api/promotion-timeline',{...input,confirmImpact:true});assert(done.ok);await api(boss,'/api/promotion-timeline',{...input,confirmImpact:true});
  const kept=await db.select().from(s.operationsPromotionDailyMetric).where(eq(s.operationsPromotionDailyMetric.campaignId,fixture.campaign.id));assert.equal(kept.length,2);assert(kept.every(m=>Number(m.spend)===20));
  if(fixture.versionId)assert.deepEqual((await db.select().from(s.operationsReviewMeetingVersion).where(eq(s.operationsReviewMeetingVersion.id,fixture.versionId)))[0].snapshot,fixture.frozen);
  const audits=await db.select().from(s.operationsPromotionTimelineAudit).where(eq(s.operationsPromotionTimelineAudit.scheduleId,fixture.post.schedule.id));assert(audits.some(a=>a.action==='status'&&(a.before.metrics as any[]).length===4&&(a.after.metrics as any[]).length===2));
  checks.push(kind+'：真正影响预览、确认后归档后两天、幂等；冻结会后版本不变');
 }
 const pair=await seed('暂停待定互改','paused');
 for(const targetStatus of ['test_pending','test_paused']){
  const [row]=await api(staff,'/api/promotion-timeline?schedule='+pair.post.schedule.id);
  await api(staff,'/api/promotion-timeline',{scheduleId:pair.post.schedule.id,reviewDate:'2026-10-27',action:'status',targetStatus,reason:'相近状态录错更正',requestKey:randomUUID(),fingerprint:row.fingerprint});
 }
 const pairMetrics=await db.select().from(s.operationsPromotionDailyMetric).where(eq(s.operationsPromotionDailyMetric.campaignId,pair.campaign.id));assert.equal(pairMetrics.length,2);assert.equal(pairMetrics.reduce((n,m)=>n+Number(m.spend),0),40);
 checks.push('员工暂停／待定双向更正，不删除非零事实、不新增测试轮次');
 await writeFile(dir+'/promotion-integration.json',JSON.stringify({passed:true,checks},null,2));console.log(checks.join('\n'));
}catch(error){console.error(f.logs().slice(-4000));throw error;}finally{await f.stop();}
