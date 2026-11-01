/** 正式HTTP、审核重放与协作身份；全部数据位于隔离PGlite。 */
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {eq} from 'drizzle-orm';
import {startFixture,admin,employee} from './auth.fixture';
import {businessFetch} from './business-request.helper';
import {effectiveBusinessPermissions,updateAccountPermissions} from '../src/auth/business-permissions';
import * as s from '../src/db/schema';
const folder='.tools/test-artifacts/nonpromotion-plans';await mkdir(folder,{recursive:true});const clockFile=new URL('../'+folder+'/edge-clock.txt',import.meta.url).pathname;await writeFile(clockFile,'2026-11-03T12:00:00+08:00');
const fixture=await startFixture({clockFile}),{db,baseURL}=fixture;let cookie='';const checks:string[]=[];
async function login(actor:any){const response=await fetch(baseURL+'/api/auth/sign-in/username',{method:'POST',headers:{Origin:baseURL,'Content-Type':'application/json'},body:JSON.stringify(actor)});assert.equal(response.status,200);return response.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');}
async function api(path:string,values?:Record<string,unknown>,status=200,method='POST',json=false){const form=new FormData();for(const [k,v]of Object.entries(values??{}))form.set(k,String(v));const response=await businessFetch(baseURL+path,{method:values?method:'GET',headers:{Cookie:cookie,Origin:baseURL,...json?{'Content-Type':'application/json'}:{}},body:values?(json?JSON.stringify(values):form):undefined});const body=await response.json();assert.equal(response.status,status,JSON.stringify({path,body}));return body;}
async function seed(name:string,promoted=false,source?:any){const [content]=source?[source.content]:await db.insert(s.operationsContent).values({platformNoteId:crypto.randomUUID().replaceAll('-','').slice(0,24)}).returning();const [version]=await db.insert(s.operationsContentVersion).values({contentId:content.id,versionNumber:source?1:0,workType:source?'revision':'new',sourceVersionId:source?.version.id,contentName:name,subjectId:'tmua',categoryId:'temporary'}).returning();const [schedule]=await db.insert(s.operationsContentSchedule).values({contentVersionId:version.id,plannedPublishAt:new Date('2026-11-02T10:00+08:00'),actualPublishAt:new Date('2026-11-02T10:00+08:00'),completionStatus:'on_time',isPromoted:promoted,promotionStatus:promoted?'awaiting_promotion':'none'}).returning();return {content,version,schedule};}
try{
 const boss=await login(admin),staff=await login(employee);cookie=boss;
 const post=await seed('审批与节点归属'),other=await seed('另一个原帖'),promoted=await seed('推广阶段不可设置',true),revision=await seed('改版沿用原帖',false,post);
 await api('/api/operations-content/'+post.schedule.id,{action:'reviewPlan',reviewMode:'continuous',expectedReviewRevision:-1},200,'PATCH');
 await api('/api/operations-content/'+promoted.schedule.id,{action:'reviewPlan',reviewMode:'instant',reviewDueOn:'2026-11-03',expectedReviewRevision:-1},422,'PATCH');
 await api('/api/operations-content/'+revision.schedule.id,{action:'reviewPlan',reviewMode:'continuous',expectedReviewRevision:0},409,'PATCH');
 const inherited=await api('/api/non-promotion-checkpoints?scheduleId='+revision.schedule.id);assert.equal(inherited.anchorScheduleId,post.schedule.id);assert.equal(inherited.plan.mode,'continuous');
 await db.insert(s.operationsNonPromotionReviewPlan).values({contentId:promoted.content.id,anchorScheduleId:promoted.schedule.id,mode:'standard',day7:true,day15:true});
 await api('/api/operations-content/'+promoted.schedule.id,{contentName:promoted.version.contentName,subjectId:'tmua',categoryId:'temporary',projectDocUrl:'',plannedPublishAt:'2026-11-02T10:00',promotionStatus:'none',usageChangeReason:'隔离用途变更'},200,'PATCH');
 const converted=await api('/api/non-promotion-checkpoints?scheduleId='+promoted.schedule.id);assert.equal(converted.plan.mode,'continuous');assert.equal(converted.nodes.length,0);
 const oldPromotion=await seed('既有计划的推广原帖',true);await db.insert(s.operationsNonPromotionReviewPlan).values({contentId:oldPromotion.content.id,anchorScheduleId:oldPromotion.schedule.id,mode:'standard',day7:true,day15:true});
 const nonRevision=await seed('转为非推广的改版',false,oldPromotion);await db.update(s.operationsContentSchedule).set({actualPublishAt:null,completionStatus:'pending'}).where(eq(s.operationsContentSchedule.id,nonRevision.schedule.id));
 await api('/api/operations-content/'+nonRevision.schedule.id+'/publication',{actualPublishAt:'2026-11-02T10:00',publicationUrl:'https://www.xiaohongshu.com/explore/'+oldPromotion.content.platformNoteId,projectDocUrl:'https://example.test/doc',expectedPlanRevision:0,expectedPublicationRevision:0},200,'PATCH');
 const revisedPlan=await api('/api/non-promotion-checkpoints?scheduleId='+nonRevision.schedule.id);assert.equal(revisedPlan.plan.mode,'continuous');assert.equal(revisedPlan.plan.day7,false);assert.equal(revisedPlan.plan.day15,false);assert.equal(revisedPlan.anchorScheduleId,oldPromotion.schedule.id);
 const invalidPublication=await seed('发布事务回滚');await db.update(s.operationsContentSchedule).set({actualPublishAt:null,completionStatus:'pending'}).where(eq(s.operationsContentSchedule.id,invalidPublication.schedule.id));
 await api('/api/operations-content/'+invalidPublication.schedule.id+'/publication',{actualPublishAt:'2026-11-02T10:00',publicationUrl:'https://www.xiaohongshu.com/explore/'+invalidPublication.content.platformNoteId,expectedPlanRevision:0,expectedPublicationRevision:0,reviewMode:'instant',reviewDueOn:'2026-11-01',expectedReviewRevision:-1},422,'PATCH');
 assert.equal((await db.select().from(s.operationsContentSchedule).where(eq(s.operationsContentSchedule.id,invalidPublication.schedule.id)))[0].actualPublishAt,null);
 assert.equal((await db.select().from(s.operationsPublicationEvent).where(eq(s.operationsPublicationEvent.scheduleId,invalidPublication.schedule.id))).length,0);
 await api('/api/non-promotion-checkpoints',{action:'add',scope:'schedule',scheduleId:post.schedule.id,dueOn:'2026-11-03'});
 let view=await api('/api/non-promotion-checkpoints?scheduleId='+post.schedule.id);const node=view.nodes[0];
 assert(!(await api('/api/non-promotion-reviews')).tableRows.some((r:any)=>r.row.id===post.schedule.id),'截止日当天尚未开放');
 await api('/api/non-promotion-checkpoints',{action:'cancel',scope:'schedule',scheduleId:other.schedule.id,nodeId:node.id,expectedRevision:0,reason:'伪造归属'},409);
 await writeFile(clockFile,'2026-11-04T12:00:00+08:00');const row=(await api('/api/non-promotion-reviews')).tableRows.find((r:any)=>r.row.id===post.schedule.id);assert(row);
 const input={scheduleId:post.schedule.id,checkpointType:row.checkpoint.type,recordedThrough:'2026-11-03',exposureCount:100,readCount:0,threeSecondReadRate:0,conclusion:'',fingerprint:row.fingerprint};
 await api('/api/non-promotion-reviews',{...input,readCount:101},422);await api('/api/non-promotion-reviews',{...input,recordedThrough:'2026-11-02'},422);
 await api('/api/non-promotion-reviews',input,201);const history=(await api('/api/non-promotion-reviews?view=history&group=0')).tableRows.find((r:any)=>r.key===row.key);assert.equal(history.metric.clickRate,'0.0000');
 await api('/api/non-promotion-checkpoints',{action:'reschedule',scope:'schedule',scheduleId:post.schedule.id,nodeId:node.id,expectedRevision:0,dueOn:'2026-11-04',reason:'已有事实不能改截止'},409);
 checks.push('推广限制、改版继承、真实节点归属、T+1、自定义准确截止日、非法数量与零阅读、已填节点保护');
 const accounts=await db.select().from(s.authUser),owner=accounts.find(r=>r.username===employee.username)!,actor=accounts.find(r=>r.username===admin.username)!;const permissions=await effectiveBusinessPermissions(db,owner);await updateAccountPermissions(db,actor,owner.id,{...permissions,'schedule.edit':'review'},permissions);
 cookie=staff;const proposal=await api('/api/non-promotion-checkpoints',{action:'add',scope:'schedule',scheduleId:post.schedule.id,dueOn:'2026-11-06'},202);assert.equal((await api('/api/non-promotion-checkpoints?scheduleId='+post.schedule.id)).nodes.length,1);
 cookie=boss;await api('/api/business-change-proposals/'+proposal.requestId,{action:'approve'},200,'PATCH',true);assert.equal((await api('/api/non-promotion-checkpoints?scheduleId='+post.schedule.id)).nodes.length,2);
 cookie=staff;const planProposal=await api('/api/operations-content/'+other.schedule.id,{action:'reviewPlan',reviewMode:'instant',reviewDueOn:'2026-11-05',reviewDay15:'on',expectedReviewRevision:-1},202,'PATCH');cookie=boss;await api('/api/business-change-proposals/'+planProposal.requestId,{action:'approve'},200,'PATCH',true);view=await api('/api/non-promotion-checkpoints?scheduleId='+other.schedule.id);assert.equal(view.plan.day7,false);assert.equal(view.plan.day15,true);assert.equal(view.nodes.length,1);
 // 整篇跳过只作用于启用的节点；恢复不重建或清空已完成事实。
 await api('/api/non-promotion-checkpoints',{action:'skip',scope:'schedule',scheduleId:other.schedule.id,checkpointType:'custom:'+view.nodes[0].id,expectedEvents:JSON.stringify({day_15:null,['custom:'+view.nodes[0].id]:null}),reason:'隔离跳过'});
 let skipped=(await api('/api/non-promotion-reviews?view=skipped')).tableRows.filter((r:any)=>r.row.id===other.schedule.id);assert.equal(skipped.length,2);
 await api('/api/non-promotion-checkpoints',{action:'restore',scope:'schedule',scheduleId:other.schedule.id,checkpointType:skipped[0].checkpoint.type,expectedEventId:skipped[0].event.id,expectedEvents:JSON.stringify(Object.fromEntries(skipped.map((r:any)=>[r.checkpoint.type,r.event.id]))),reason:'隔离恢复'});
 assert.equal((await api('/api/non-promotion-reviews?view=skipped')).tableRows.filter((r:any)=>r.row.id===other.schedule.id).length,0);
 checks.push('员工计划与追加节点真实审核、管理员批准重放、可选15天独立、整篇跳过恢复不制造零指标');
 console.log(JSON.stringify({passed:true,checks}));await writeFile(folder+'/integration.json',JSON.stringify({passed:true,checks},null,2));
}catch(error){console.error(fixture.logs().slice(-3000));throw error;}finally{await fixture.stop();}
