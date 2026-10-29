import assert from 'node:assert/strict';
import {before,after,test} from 'node:test';
import {PGlite} from '@electric-sql/pglite';
import {drizzle} from 'drizzle-orm/pglite';
import {eq} from 'drizzle-orm';
import type {APIContext} from 'astro';
import {migrateFixture} from './migrate-fixture';
import * as s from '../src/db/schema';
import {withDatabase} from '../src/db/client';
import {runBusinessWrite,decideProposal} from '../src/db/business-approvals';
import {effectiveBusinessPermissions,updateAccountPermissions} from '../src/auth/business-permissions';
import {POST as createPost} from '../src/pages/api/operations-content';
import {PATCH as editPost,DELETE as deletePost} from '../src/pages/api/operations-content/[id]';
import {POST as createAnnual} from '../src/pages/api/operations-annual-plans';
import {PATCH as editAnnual} from '../src/pages/api/operations-annual-plans/[id]';
import {PATCH as publication} from '../src/pages/api/operations-content/[id]/publication';
import {defaultBusinessPermissions,type BusinessOperation,type PermissionMode} from '../src/auth/business-capabilities';
import {proposalDiff} from '../src/db/proposal-diff';
const pg=new PGlite(),db=drizzle(pg,{schema:s}),origin='http://fixture.test';
const employee={id:'permission-employee',username:'虚构权限员工',role:'employee' as const},admin={id:'permission-admin',username:'虚构权限管理员',role:'admin' as const};
before(async()=>{await migrateFixture(pg);await db.insert(s.authUser).values([employee,admin].map(user=>({...user,name:user.username,email:`${user.id}@example.test`})))});
after(()=>pg.close());
async function grant(changes:Partial<Record<BusinessOperation,PermissionMode>>){const before=await effectiveBusinessPermissions(db,employee);assert.equal(await updateAccountPermissions(db,admin,employee.id,{...before,...changes},before),true);}
const planTime=(hours:number)=>new Date(Date.now()+hours*3600000).toISOString().slice(0,16);
const values=(name:string)=>({contentName:name,subjectId:'tmua',categoryId:'temporary',plannedPublishAt:planTime(48),projectDocUrl:'https://fixture.test/doc',promotionStatus:'none'});
async function call(path:string,method:string,input:Record<string,unknown>,handler:typeof editPost,params:Record<string,string>={}){
 const json=path.includes('annual');const body=json?JSON.stringify(input):new URLSearchParams(Object.fromEntries(Object.entries(input).map(([key,value])=>[key,String(value)])));
 const request=new Request(origin+path,{method,headers:{Origin:origin,Accept:'application/json',...(json?{'Content-Type':'application/json'}:{})},...(method==='DELETE'?{}:{body})});
 const context={request,url:new URL(request.url),locals:{user:employee,operationsUser:employee.username,session:null},params} as APIContext;
 return withDatabase(db,()=>runBusinessWrite(context,()=>Promise.resolve(handler(context))));
}
test('默认矩阵保留员工日常排期能力，年度写入和敏感操作关闭',async()=>{
 const permissions=await effectiveBusinessPermissions(db,employee);assert.deepEqual(permissions,defaultBusinessPermissions());
 assert.equal((await call('/api/operations-annual-plans','POST',{},createAnnual)).status,403);
 const result=await call('/api/operations-content','POST',values('虚构直接新增'),createPost);assert.equal(result.status,201);
 const row=await result.json();assert.ok((await db.select().from(s.operationsContentSchedule).where(eq(s.operationsContentSchedule.id,row.id))).length);
});
test('新增审核不提前创建业务数据，重复提交同一申请，批准仅执行一次',async()=>{
 await grant({'schedule.create':'review'});const input=values('虚构审核新增');
 const a=await call('/api/operations-content','POST',input,createPost);assert.equal(a.status,202);const proposal=await a.json();assert.equal(proposal.id,undefined);
 const b=await call('/api/operations-content','POST',input,createPost);assert.equal((await b.json()).requestId,proposal.requestId);
 assert.equal((await db.select().from(s.operationsContentVersion).where(eq(s.operationsContentVersion.contentName,input.contentName))).length,0);
 const approved=await withDatabase(db,()=>decideProposal(proposal.requestId,true,'',admin,origin));assert.equal(approved.status,200);
 assert.equal((await db.select().from(s.operationsContentVersion).where(eq(s.operationsContentVersion.contentName,input.contentName))).length,1);
 await withDatabase(db,()=>decideProposal(proposal.requestId,true,'',admin,origin));assert.equal((await db.select().from(s.operationsContentVersion).where(eq(s.operationsContentVersion.contentName,input.contentName))).length,1);
 await grant({'schedule.create':'direct'});
});
test('复合改期整笔审核，关闭任一所需操作整笔拒绝',async()=>{
 const input=values('虚构复合审核');const created=await (await call('/api/operations-content','POST',input,createPost)).json();
 await db.update(s.operationsContentSchedule).set({plannedPublishAt:new Date(Date.now()-4*3600000)}).where(eq(s.operationsContentSchedule.id,created.id));
 const edit={...input,contentName:'虚构复合修改',expectedPlanRevision:'0',planChangeReason:'业务调整'};
 const pending=await call(`/api/operations-content/${created.id}`,'PATCH',edit,editPost,{id:created.id});assert.equal(pending.status,202);const proposal=await pending.json();
 assert.equal((await db.select().from(s.operationsContentVersion).where(eq(s.operationsContentVersion.contentName,edit.contentName))).length,0);
 await grant({'schedule.edit':'disabled'});
 assert.equal((await call(`/api/operations-content/${created.id}`,'PATCH',edit,editPost,{id:created.id})).status,403);
 assert.equal((await db.select().from(s.operationsChangeProposal).where(eq(s.operationsChangeProposal.id,proposal.requestId)))[0].status,'obsolete');
 await grant({'schedule.edit':'direct'});
 const next=await (await call(`/api/operations-content/${created.id}`,'PATCH',edit,editPost,{id:created.id})).json();
 assert.equal((await withDatabase(db,()=>decideProposal(next.requestId,true,'',admin,origin))).status,200);
 assert.equal((await db.select().from(s.operationsContentVersion).where(eq(s.operationsContentVersion.contentName,edit.contentName))).length,1);
});
test('原数据更新后申请失效，不覆盖新值；删除审核保留原有阻断',async()=>{
 await grant({'schedule.delete':'review','schedule.edit':'review'});
 const input=values('虚构冲突原文'),created=await (await call('/api/operations-content','POST',input,createPost)).json();
 const pending=await (await call(`/api/operations-content/${created.id}`,'PATCH',{...input,contentName:'申请中的名称'},editPost,{id:created.id})).json();
 const [row]=await db.select().from(s.operationsContentSchedule).where(eq(s.operationsContentSchedule.id,created.id));
 await db.update(s.operationsContentVersion).set({contentName:'管理员已改为新文'}).where(eq(s.operationsContentVersion.id,row.contentVersionId));
 assert.equal((await withDatabase(db,()=>decideProposal(pending.requestId,true,'',admin,origin))).status,409);
 assert.equal((await db.select().from(s.operationsContentVersion).where(eq(s.operationsContentVersion.id,row.contentVersionId)))[0].contentName,'管理员已改为新文');
 const deletion=await call(`/api/operations-content/${created.id}`,'DELETE',{},deletePost,{id:created.id});assert.equal(deletion.status,202);const proposal=await deletion.json();
 assert.equal((await db.select().from(s.operationsContentSchedule).where(eq(s.operationsContentSchedule.id,created.id))).length,1);
 assert.equal((await withDatabase(db,()=>decideProposal(proposal.requestId,true,'',admin,origin))).status,200);
 assert.equal((await db.select().from(s.operationsContentSchedule).where(eq(s.operationsContentSchedule.id,created.id))).length,0);
 await assert.rejects(withDatabase(db,()=>decideProposal(proposal.requestId,true,'',employee,origin)),/管理员/);
});
test('年度启停与内容编辑独立授权，内容审核后才改变名称',async()=>{
 await grant({'annual.create':'direct','annual.toggle':'direct','annual.edit':'disabled'});
 const input={year:2027,sectionKey:'subject:tmua',sectionLabel:'TMUA 细致规划',subjectId:'tmua',categoryId:'temporary',rowName:'虚构独立权限规划',note:null,sortOrder:0,isActive:true,blocks:[],links:[]};
 const created=await (await call('/api/operations-annual-plans','POST',input,createAnnual)).json();
 const change={...input,isActive:false,expectedVersionNumber:0};
 assert.equal((await call(`/api/operations-annual-plans/${created.id}`,'PATCH',change,editAnnual,{id:created.id})).status,200);
 const blocked=await call(`/api/operations-annual-plans/${created.id}`,'PATCH',{...change,rowName:'无权编辑',expectedVersionNumber:1},editAnnual,{id:created.id});assert.equal(blocked.status,403);
 await grant({'annual.edit':'review'});
 const pending=await (await call(`/api/operations-annual-plans/${created.id}`,'PATCH',{...change,rowName:'审核后的名称',expectedVersionNumber:1},editAnnual,{id:created.id})).json();
 assert.equal((await db.select().from(s.operationsAnnualPlan).where(eq(s.operationsAnnualPlan.id,created.id)))[0].rowName,input.rowName);
 assert.equal((await withDatabase(db,()=>decideProposal(pending.requestId,true,'',admin,origin))).status,200);
 assert.equal((await db.select().from(s.operationsAnnualPlan).where(eq(s.operationsAnnualPlan.id,created.id)))[0].rowName,'审核后的名称');
});
test('实发时间更正授权不依赖链接编辑权限，保留原操作者与更正历史',async()=>{
 await grant({'schedule.create':'direct','schedule.publish':'disabled','schedule.correctPublication':'direct'});
 const input=values('虚构独立时间更正'),created=await (await call('/api/operations-content','POST',input,createPost)).json();
 const planned=new Date(input.plannedPublishAt+':00+08:00'),actual=new Date(planned.getTime()+1800000),next=new Date(planned.getTime()+2700000),link='https://xhslink.cn/o/fixture';
 await db.update(s.operationsContentSchedule).set({actualPublishAt:actual,publicationUrl:link,completionStatus:'on_time'}).where(eq(s.operationsContentSchedule.id,created.id));
 const nextInput=new Date(next.getTime()+8*3600000).toISOString().slice(0,16);
 const response=await call(`/api/operations-content/${created.id}/publication`,'PATCH',{actualPublishAt:nextInput,publicationUrl:link,projectDocUrl:input.projectDocUrl,expectedPlanRevision:0,expectedPublicationRevision:0,correctionReason:'核对平台记录',dailyReasons:'[]'},publication,{id:created.id});assert.equal(response.status,200,await response.text());
 const [event]=await db.select().from(s.operationsPublicationEvent).where(eq(s.operationsPublicationEvent.scheduleId,created.id));assert.equal(event.changedById,employee.id);assert.equal(event.before.actualPublishAt,actual.toISOString());assert.equal(event.after.actualPublishAt,next.toISOString());
});
test('朋友圈首次确认随发布审核预览和重放，拒绝不落库，不影响无确认申请快照',async()=>{
 await grant({'schedule.create':'direct','schedule.publish':'review'});
 const create=async(name:string,sync=true)=>{const input={...values(name),...(sync?{syncToMoments:'on'}:{})};const created=await (await call('/api/operations-content','POST',input,createPost)).json();return {id:created.id,input};};
 const first=await create('虚构朋友圈审核'),path=`/api/operations-content/${first.id}/publication`,input={actualPublishAt:first.input.plannedPublishAt,publicationUrl:'https://xhslink.cn/o/fixture',projectDocUrl:first.input.projectDocUrl,expectedPlanRevision:0,expectedPublicationRevision:0,dailyReasons:'[]'};
 assert.equal((await call(path,'PATCH',input,publication,{id:first.id})).status,422);
 const confirmed={...input,momentsSentConfirmed:'on',momentsRequestSentConfirmed:'on'};const pending=await (await call(path,'PATCH',confirmed,publication,{id:first.id})).json();const [proposal]=await db.select().from(s.operationsChangeProposal).where(eq(s.operationsChangeProposal.id,pending.requestId));assert.ok(proposal);assert.ok(!('momentsConfirmation' in proposal.before));assert.deepEqual(proposal.after.momentsConfirmation,{momentsSent:true,requestSent:true});assert.ok(proposalDiff(proposal.before,proposal.after).some(row=>row.label==='已发送朋友圈'&&row.after==='已确认'));assert.ok(proposalDiff(proposal.before,proposal.after).some(row=>row.label==='已发送对应需求'&&row.after==='已确认'));assert.equal((await db.select().from(s.operationsPublicationEvent).where(eq(s.operationsPublicationEvent.scheduleId,first.id))).length,0);
 assert.equal((await withDatabase(db,()=>decideProposal(pending.requestId,true,'',admin,origin))).status,200);const [event]=await db.select().from(s.operationsPublicationEvent).where(eq(s.operationsPublicationEvent.scheduleId,first.id));assert.deepEqual(event.after.momentsConfirmation,{momentsSent:true,requestSent:true});assert.equal(event.changedById,employee.id);
 const second=await create('虚构拒绝朋友圈确认');const rejected=await (await call(`/api/operations-content/${second.id}/publication`,'PATCH',{...confirmed,actualPublishAt:second.input.plannedPublishAt},publication,{id:second.id})).json();assert.equal((await withDatabase(db,()=>decideProposal(rejected.requestId,false,'暂不发布',admin,origin))).status,200);assert.equal((await db.select().from(s.operationsPublicationEvent).where(eq(s.operationsPublicationEvent.scheduleId,second.id))).length,0);
 const ordinary=await create('虚构无确认旧申请',false);const legacy=await (await call(`/api/operations-content/${ordinary.id}/publication`,'PATCH',{...input,actualPublishAt:ordinary.input.plannedPublishAt},publication,{id:ordinary.id})).json();const [legacyProposal]=await db.select().from(s.operationsChangeProposal).where(eq(s.operationsChangeProposal.id,legacy.requestId));assert.ok(!('momentsConfirmation' in legacyProposal.before));assert.ok(!('momentsConfirmation' in legacyProposal.after));assert.equal((await withDatabase(db,()=>decideProposal(legacy.requestId,true,'',admin,origin))).status,200);
});
