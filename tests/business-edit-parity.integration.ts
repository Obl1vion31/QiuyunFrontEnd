import assert from 'node:assert/strict';
import {eq} from 'drizzle-orm';
import {mkdir,writeFile} from 'node:fs/promises';
import {startPostgresFixture} from './postgres.fixture';
import {admin,employee} from './auth.fixture';
import {seedPrivateSources,seedFrozenPrivateMeeting} from './private-sources.fixture';
import {seedLinkPost,seedLinkPlan} from './monthly-plan-links.fixture';
import {discussionFromDraft} from '../src/db/meeting-discussion-values';
import * as s from '../src/db/schema';

const dir='.tools/test-artifacts/business-edit-parity';await mkdir(dir,{recursive:true});
const clockFile=process.cwd()+'/'+dir+'/integration-clock.txt';await writeFile(clockFile,'2026-11-06T12:00:00+08:00');
const f=await startPostgresFixture({clockFile,entry:process.env.PARITY_ENTRY}),{db,baseURL}=f;
const checks:string[]=[];
async function login(actor:any){const r=await fetch(baseURL+'/api/auth/sign-in/username',{method:'POST',headers:{Origin:baseURL,'Content-Type':'application/json'},body:JSON.stringify(actor)});assert.equal(r.status,200);return r.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');}
async function api(cookie:string,path:string,body?:any,method='PATCH',status=200,form=false){
 const data=new FormData();if(form)for(const [k,v]of Object.entries(body))data.set(k,String(v));
 const response=await fetch(baseURL+path,{method:body===undefined?'GET':method,headers:{Cookie:cookie,Origin:baseURL,Accept:'application/json',...(form?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:form?data:JSON.stringify(body)});
 const value=await response.json();assert.equal(response.status,status,JSON.stringify({path,value}));return value;
}
try {
 const boss=await login(admin),staff=await login(employee);
 await seedPrivateSources(db);
 const sample=await seedFrozenPrivateMeeting(db,'2026-09','已确认预排期的普通月会');
 const draft={...sample.snapshot.draft,monthlyPlan:{id:sample.plan.id,expectedRevision:sample.plan.revision,content:sample.plan.content,additions:[]}};
 const snapshot={...sample.snapshot,draft,arrangementSealed:false};
 await db.update(s.operationsReviewMeeting).set({draftSnapshot:draft}).where(eq(s.operationsReviewMeeting.id,sample.meeting.id));
 await db.update(s.operationsReviewMeetingVersion).set({snapshot}).where(eq(s.operationsReviewMeetingVersion.id,sample.version.id));
 await db.update(s.operationsMonthlyPlan).set({sealedVersionId:null,arrangementStatus:'editing'}).where(eq(s.operationsMonthlyPlan.id,sample.plan.id));
 const baseline=(await db.select().from(s.operationsMonthlyPlan).where(eq(s.operationsMonthlyPlan.id,sample.plan.id)))[0];
 let source=sample.version.id;
 for(const [role,cookie] of [['employee',staff],['admin',boss]]){
  const meeting=(await db.select().from(s.operationsReviewMeeting).where(eq(s.operationsReviewMeeting.id,sample.meeting.id)))[0];
  const discussion=discussionFromDraft(meeting.draftSnapshot);discussion.coreConclusion=role+'修订普通结论';
  if(!discussion.issues.length)discussion.issues.push({problem:'预排期确认后仍可维护事项',conclusion:'由员工记录',status:'pending'});
  else discussion.issues[0].conclusion='管理员继续核对同一事项';
  const saved=await api(cookie,'/api/meeting-reviews/'+meeting.id,{action:'save_version_draft',sourceVersionId:source,expectedUpdatedAt:meeting.updatedAt.toISOString(),discussion});
  const finalized=await api(cookie,'/api/meeting-reviews/'+meeting.id,{action:'finalize_version_draft',stage:'post',sourceVersionId:source,draftVersionId:saved.versionId,expectedUpdatedAt:saved.updatedAt,discussion});
  source=finalized.versionId;const [livePlan]=await db.select().from(s.operationsMonthlyPlan).where(eq(s.operationsMonthlyPlan.id,sample.plan.id));assert.deepEqual(livePlan,baseline);
  const [version]=await db.select().from(s.operationsReviewMeetingVersion).where(eq(s.operationsReviewMeetingVersion.id,source));assert.equal(version.finalizedByLabel,role==='employee'?'test_employee':'test_admin');
 }
 assert.equal((await db.select().from(s.operationsReviewActionItem)).length,1);
 checks.push('确认预排期后员工和管理员均可保存普通结论、修订事项并定稿；计划与权限阶段保持');
 await seedLinkPlan(db,{month:'2026-11'});
 const catalog=await api(boss,'/api/business-settings/content-config'),current=catalog.configurations.find((c:any)=>c.subjectId==='tmua');
 current.config.types.find((t:any)=>t.id==='small-class-or-tutoring').defaultOperationType='non_promotion_instant';
 await api(boss,'/api/business-settings/content-config',{subjectId:'tmua',expectedRevision:current.revision,config:current.config});
 const posts:string[]=[];
 for(const [role,cookie] of [['employee',staff],['admin',boss]]){
  const fields={subjectId:'tmua',categoryId:'small-class-or-tutoring',contentName:role+'配置默认',projectDocUrl:'https://example.test/doc',plannedPublishAt:'2026-11-10T10:00',promotionStatus:'none'};
  const automatic=await api(cookie,'/api/operations-content',fields,'POST',201,true),manual=await api(cookie,'/api/operations-content',{...fields,contentName:role+'人工覆盖',operationType:'promotion_only'},'POST',201,true);
  for(const [created,expected]of [[automatic,'non_promotion_instant'],[manual,'promotion_only']] as const){
   const [record]=await db.select({content:s.operationsContent}).from(s.operationsContentSchedule).innerJoin(s.operationsContentVersion,eq(s.operationsContentVersion.id,s.operationsContentSchedule.contentVersionId)).innerJoin(s.operationsContent,eq(s.operationsContent.id,s.operationsContentVersion.contentId)).where(eq(s.operationsContentSchedule.id,created.id));assert.equal(record.content.operationType,expected);posts.push(record.content.id);
  }
 }
 const latest=(await api(boss,'/api/business-settings/content-config')).configurations.find((c:any)=>c.subjectId==='tmua');latest.config.types.find((t:any)=>t.id==='small-class-or-tutoring').defaultOperationType='promotion_only';
 await api(boss,'/api/business-settings/content-config',{subjectId:'tmua',expectedRevision:latest.revision,config:latest.config});
 const existing=await db.select().from(s.operationsContent);assert.equal(existing.find(c=>c.id===posts[0])!.operationType,'non_promotion_instant');
 checks.push('两角色服务端新帖默认读取学科配置、人工指定优先；后改默认不改已有帖子');
 await api(staff,'/api/business-settings/content-config',undefined,'GET',403);await api(staff,'/api/monthly-cost-mapping',undefined,'GET',403);await api(boss,'/api/monthly-cost-mapping',undefined,'GET',410);
 const [staffUser]=await db.select().from(s.authUser).where(eq(s.authUser.username,'test_employee'));
 await db.insert(s.operationsAccountPermission).values({userId:staffUser.id,operation:'schedule.edit',mode:'disabled'});
 const skipped=await seedLinkPost(db,'日常节点不受排期编辑开关限制','2026-10-15T10:00',{categoryId:'temporary'});
 await db.update(s.operationsContentSchedule).set({actualPublishAt:new Date('2026-10-15T02:00Z')}).where(eq(s.operationsContentSchedule.id,skipped.schedule.id));
 await db.insert(s.operationsNonPromotionReviewPlan).values({contentId:skipped.content.id,anchorScheduleId:skipped.schedule.id,mode:'standard',day7:true,day15:true});
 await api(staff,'/api/non-promotion-checkpoints',{scheduleId:skipped.schedule.id,checkpointType:'day_7',action:'skip',reason:'按业务范围不复盘',expectedEventId:''},'POST',200,true);
 const [event]=await db.select().from(s.operationsNonPromotionCheckpointEvent).where(eq(s.operationsNonPromotionCheckpointEvent.scheduleId,skipped.schedule.id));
 await api(staff,'/api/non-promotion-checkpoints',{scheduleId:skipped.schedule.id,checkpointType:'day_7',action:'restore',reason:'恢复正常复盘',expectedEventId:event.id},'POST',200,true);
 checks.push('员工管理配置直访403、旧配置入口410；排期编辑关闭不阻断日常非推广跳过与恢复');
 await writeFile(dir+'/integration.json',JSON.stringify({passed:true,checks},null,2));console.log(checks.join('\n'));
}catch(error){console.error(f.logs().slice(-2500));throw error;}finally{await f.stop();}
