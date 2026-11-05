import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {eq} from 'drizzle-orm';
import {startPostgresFixture} from './postgres.fixture';
import {admin,employee} from './auth.fixture';
import {seedLinkPlan,seedLinkPost} from './monthly-plan-links.fixture';
import {scheduleWriteVersion} from '../src/db/schedule-write-version';
import * as s from '../src/db/schema';
const folder='.tools/test-artifacts/monthly-plan-linking';await mkdir(folder,{recursive:true});
const clockFile=new URL('../'+folder+'/integration-clock.txt',import.meta.url).pathname;await writeFile(clockFile,'2026-11-05T12:00:00+08:00');
const fixture=await startPostgresFixture({clockFile}),{db,baseURL}=fixture,checks:string[]=[];
const mark=(text:string)=>{checks.push(text);console.log('PASS '+text);};
async function login(actor:any){const r=await fetch(baseURL+'/api/auth/sign-in/username',{method:'POST',headers:{Origin:baseURL,'Content-Type':'application/json'},body:JSON.stringify(actor)});assert.equal(r.status,200);return r.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');}
let staff='',boss='',other='';
async function request(cookie:string,path:string,body?:unknown,method='POST'){
 const response=await fetch(baseURL+path,{method:body===undefined?'GET':method,headers:{Cookie:cookie,Origin:baseURL,Accept:'application/json',...(body instanceof FormData||body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:body instanceof FormData?body:JSON.stringify(body)})});
 const text=await response.text();let value:any;try{value=JSON.parse(text);}catch{value=text;}return {status:response.status,value};
}
async function api(cookie:string,path:string,body?:unknown,status=200,method=path.startsWith('/api/business-change-proposals/')?'PATCH':'POST'){const r=await request(cookie,path,body,method);assert.equal(r.status,status,JSON.stringify({path,...r}));return r.value;}
const form=(values:Record<string,unknown>)=>{const f=new FormData();for(const [k,v]of Object.entries(values))f.set(k,String(v));return f;};
async function choice(planId:string,group:any){return api(staff,'/api/monthly-plans?id='+planId+'&choices=1&group='+group.id+'&week='+group.week);}
async function input(planId:string,groupId:string,week:number,ids:string[],reason=''){
 const result=await api(staff,'/api/monthly-plans?id='+planId+'&choices=1&group='+groupId+'&week='+week),group=result.plan.linkGroups.find((g:any)=>g.groupId===groupId&&g.week===week);
 return {requestId:randomUUID(),groupId,week,expectedRevision:result.plan.revision,expectedAssignmentVersion:group.assignmentVersion,scheduleIds:ids,versions:Object.fromEntries(result.candidates.map((p:any)=>[p.id,p.writeVersion])),reason};
}
async function version(id:string){const [row]=await db.select({version:scheduleWriteVersion}).from(s.operationsContentSchedule).innerJoin(s.operationsContentVersion,eq(s.operationsContentVersion.id,s.operationsContentSchedule.contentVersionId)).innerJoin(s.operationsContent,eq(s.operationsContent.id,s.operationsContentVersion.contentId)).where(eq(s.operationsContentSchedule.id,id));return row.version;}
async function mode(key:string,value:string){const [user]=await db.select().from(s.authUser).where(eq(s.authUser.username,employee.username));await db.insert(s.operationsAccountPermission).values({userId:user.id,operation:key,mode:value as any}).onConflictDoUpdate({target:[s.operationsAccountPermission.userId,s.operationsAccountPermission.operation],set:{mode:value as any,updatedAt:new Date()}});}
try{
 boss=await login(admin);staff=await login(employee);other=await login({username:'test_other',password:'fictional-other-password'});
 const fixturePlan=await seedLinkPlan(db,{final:false,groups:[{name:'TMUA 讲义',quantity:2,week:2},{name:'TMUA 后续讲义',quantity:1,week:3},{name:'STEP 讲义',quantity:1,week:2,subjectId:'step'},{name:'月底内容',quantity:1,week:5}]});
 const {plan,groups}=fixturePlan,path='/api/monthly-plans/'+plan.id+'/links';
 const fields={contentName:'定稿前通过普通入口录入',subjectId:'tmua',categoryId:'promotional-handout',plannedPublishAt:'2026-11-10T10:00',promotionStatus:'none',projectDocUrl:'',operationType:'non_promotion_standard'};
 const pre=await api(staff,'/api/operations-content',form(fields),201);
 await db.update(s.operationsContentSchedule).set({createdAt:new Date('2026-11-02T02:00Z'),updatedAt:new Date('2026-11-02T02:00Z')}).where(eq(s.operationsContentSchedule.id,pre.id));
 const [preVersion]=await db.select().from(s.operationsContentSchedule).where(eq(s.operationsContentSchedule.id,pre.id));
 await db.update(s.operationsContentVersion).set({createdAt:new Date('2026-11-02T02:00Z'),updatedAt:new Date('2026-11-02T02:00Z')}).where(eq(s.operationsContentVersion.id,preVersion.contentVersionId));
 assert.equal((await api(staff,'/api/monthly-plans?id='+plan.id)).plan.firstFinalizedAt,null);
 await db.update(s.operationsMonthlyPlan).set({firstFinalizedAt:new Date('2026-11-03T04:00Z'),lockedAt:new Date('2026-11-04T04:00Z')}).where(eq(s.operationsMonthlyPlan.id,plan.id));
 const missing=await api(staff,'/api/operations-content',form({...fields,contentName:'旧标签页遗漏来源'}),422);assert.equal(missing.code,'MONTHLY_PLAN_SOURCE_REQUIRED');
 const legacy=await seedLinkPost(db,'定稿后已有的同类型排期','2026-11-12T10:00');
 const cross=await seedLinkPost(db,'Week 1 已排讲义','2026-11-06T10:00');
 const wrong=await seedLinkPost(db,'不同分类','2026-11-12T10:00',{categoryId:'exam-information'});
 const step=await seedLinkPost(db,'STEP 已排讲义','2026-11-11T10:00',{subjectId:'step'});
 const late=await seedLinkPost(db,'月底已有内容','2026-11-29T10:00');
 const countBefore=(await db.select().from(s.operationsContentSchedule)).length;
 const partial=await input(plan.id,groups[0].id,2,[pre.id]);const saved=await api(staff,path,partial);
 assert.equal(saved.plan.items.length,5);assert.equal(saved.plan.linkGroups[0].remaining,1);assert.equal(saved.plan.revision,1);
 assert.equal((await db.select().from(s.operationsContentSchedule)).length,countBefore);
 const rowsBeforeRetry=await db.select().from(s.operationsMonthlyPlanAssignment);await api(staff,path,partial);
 assert.deepEqual(await db.select().from(s.operationsMonthlyPlanAssignment),rowsBeforeRetry);
 const second=await input(plan.id,groups[0].id,2,[pre.id,legacy.schedule.id]);await api(staff,path,second);
 const read=await api(staff,'/api/monthly-plans?id='+plan.id);assert.equal(read.plan.linkGroups[0].linked,2);assert.equal(read.plan.linkGroups[0].remaining,0);
 mark('定稿前后已有帖分批填原名额，锁定计划数量／修订不变，不建帖；重试不重复写入');
 const tooMany=await input(plan.id,groups[0].id,2,[pre.id,legacy.schedule.id,cross.schedule.id]);await api(staff,path,tooMany,422);
 const bad=await input(plan.id,groups[1].id,3,[wrong.schedule.id],'跨周测试');bad.versions[wrong.schedule.id]=await version(wrong.schedule.id);await api(staff,path,bad,422);
 const across=await input(plan.id,groups[1].id,3,[cross.schedule.id]);await api(staff,path,across,422);across.reason='沿用已有日期';await api(staff,path,across);
 assert.equal((await db.select().from(s.operationsContentSchedule).where(eq(s.operationsContentSchedule.id,cross.schedule.id)))[0].plannedPublishAt.toISOString(),cross.schedule.plannedPublishAt.toISOString());
 await api(staff,path,await input(plan.id,groups[3].id,5,[late.schedule.id]));
 mark('超量／不同类型整批拒绝；全月同类跨Week需原因且不改日期，Week 5 正常');
 const correction=await input(plan.id,groups[0].id,2,[legacy.schedule.id],'纠正提前录入的对应关系');await api(staff,path,correction);
 const corrected=(await api(staff,'/api/monthly-plans?id='+plan.id)).plan;assert.equal(corrected.linkGroups[0].linked,1);assert.equal(corrected.items.length,5);
 assert(corrected.items.some((i:any)=>i.history.some((h:any)=>h.previousScheduleId===pre.id)));
 const retained=await db.select().from(s.operationsMonthlyPlanAssignment);assert(retained.some(a=>a.firstSubmittedAt&&a.firstSubmittedAt<=new Date('2026-11-03T04:00Z')));
 await api(staff,path,await input(plan.id,groups[0].id,2,[],'解除错误关联'));assert.equal((await api(staff,'/api/monthly-plans?id='+plan.id)).plan.linkGroups[0].linked,0);
 assert.equal((await db.select().from(s.operationsContentSchedule)).length,countBefore);
 mark('更正／解除只改关联，保留帖子、首次提交和前后历史');
 const one=await input(plan.id,groups[0].id,2,[pre.id]),two=await input(plan.id,groups[0].id,2,[legacy.schedule.id]);
 const race=await Promise.all([request(staff,path,one),request(other,path,two)]);assert.equal(race.filter(r=>r.status===200).length,1);assert.equal(race.find(r=>r.status!==200)?.value.code,'STALE_WRITE');
 const group0Now=(await api(staff,'/api/monthly-plans?id='+plan.id)).plan.linkGroups[0].scheduleIds;
 const free=group0Now.includes(pre.id)?legacy.schedule.id:pre.id;
 const independent=await input(plan.id,groups[2].id,2,[step.schedule.id]);
 const g0=await input(plan.id,groups[0].id,2,[...group0Now,free]);
 assert((await Promise.all([request(staff,path,g0),request(other,path,independent)])).every(r=>r.status===200));
 const beforeBatch=await db.select().from(s.operationsMonthlyPlanAssignment);
 const batch=await input(plan.id,groups[0].id,2,[...group0Now,free]);batch.versions[free]='0'.repeat(32);await api(staff,path,batch,409);assert.deepEqual(await db.select().from(s.operationsMonthlyPlanAssignment),beforeBatch);
 mark('真实同时提交只接受一方；不同分组可分别保存，旧帖子凭据整批回滚');
 await api(staff,path,await input(plan.id,groups[0].id,2,[],'准备审批样本'));
 await mode('schedule.edit','review');
 const pendingInput=await input(plan.id,groups[0].id,2,[pre.id]);
 const pending=await api(staff,path,pendingInput,202);const repeated=await api(staff,path,pendingInput,202);assert.equal(repeated.requestId,pending.requestId);
 let view=(await api(staff,'/api/monthly-plans?id='+plan.id)).plan;assert.equal(view.linkGroups[0].linked,0);assert.equal(view.linkGroups[0].pending,1);assert.equal(view.linkGroups[0].remaining,1);assert(view.reservedScheduleIds.includes(pre.id));
 await api(boss,'/api/business-change-proposals/'+pending.requestId,{action:'approve',reason:''});
 view=(await api(staff,'/api/monthly-plans?id='+plan.id)).plan;assert.deepEqual(view.linkGroups[0].scheduleIds,[pre.id]);assert.equal(view.linkGroups[0].pending,0);
 const replace=await api(staff,path,await input(plan.id,groups[0].id,2,[legacy.schedule.id],'更正计划对应帖子'),202);
 view=(await api(staff,'/api/monthly-plans?id='+plan.id)).plan;assert.deepEqual(view.linkGroups[0].scheduleIds,[pre.id]);assert(view.reservedScheduleIds.includes(legacy.schedule.id));
 await api(boss,'/api/business-change-proposals/'+replace.requestId,{action:'reject',reason:'保留原关联'});
 view=(await api(staff,'/api/monthly-plans?id='+plan.id)).plan;assert.deepEqual(view.linkGroups[0].scheduleIds,[pre.id]);assert(!view.reservedScheduleIds.includes(legacy.schedule.id));
 const replace2=await api(staff,path,await input(plan.id,groups[0].id,2,[legacy.schedule.id],'核对后更正'),202);
 const approved=await api(boss,'/api/business-change-proposals/'+replace2.requestId,{action:'approve',reason:''});assert.equal(approved.status,'approved');
 assert.deepEqual((await api(staff,'/api/monthly-plans?id='+plan.id)).plan.linkGroups[0].scheduleIds,[legacy.schedule.id]);
 mark('审核预留、重复提交、通过和驳回正确；待审更正保留原有效关联');
const formPost=await seedLinkPost(db,'从原编辑表单提交的补关联');
 view=(await api(staff,'/api/monthly-plans?id='+plan.id)).plan;
 const empty=view.items.find((i:any)=>i.groupId===groups[0].id&&!i.schedule&&!i.pending);
 const formPending=await api(staff,'/api/operations-content/'+formPost.schedule.id,form({...fields,contentName:formPost.version.contentName,plannedPublishAt:'2026-11-10T10:00',expectedWriteVersion:await version(formPost.schedule.id),expectedPlanRevision:0,monthlyPlanId:plan.id,monthlyPlanItemId:empty.id,monthlyRequestId:randomUUID(),monthlyExpectedRevision:view.revision}),202,'PATCH');
 view=(await api(staff,'/api/monthly-plans?id='+plan.id)).plan;assert.equal(view.linkGroups[0].linked,1);assert.equal(view.linkGroups[0].pending,1);
 await api(boss,'/api/business-change-proposals/'+formPending.requestId,{action:'reject',reason:'改由月历核对关联'});
 view=(await api(staff,'/api/monthly-plans?id='+plan.id)).plan;assert(!view.occupiedScheduleIds.includes(formPost.schedule.id));assert.equal(view.linkGroups[0].linked,1);assert.equal(view.linkGroups[0].pending,0);
 mark('原编辑表单的关联待审不提前计数，驳回释放预留且保留首次受理');
  const obsolete=await api(staff,path,await input(plan.id,groups[0].id,2,[pre.id],'过期审批样本'),202);
 await db.update(s.operationsContentVersion).set({contentName:'原帖已被其他人更新',updatedAt:new Date('2026-11-05T05:00Z')}).where(eq(s.operationsContentVersion.id,preVersion.contentVersionId));
 const decision=await api(boss,'/api/business-change-proposals/'+obsolete.requestId,{action:'approve',reason:''},409);assert.equal(decision.status,'obsolete');
 await mode('schedule.edit','disabled');await api(staff,path,await input(plan.id,groups[0].id,2,[],'权限测试'),403);await mode('schedule.edit','direct');
 mark('审批资源变化失效、权限关闭拒绝；不覆盖后来保存的内容');
 // 原计划指定的已有帖受保护。
 await db.update(s.operationsMonthlyPlan).set({content:{...plan.content,items:plan.content.items.map((i,index)=>index===0?{...i,kind:'existing' as const,scheduleId:pre.id}:i)}}).where(eq(s.operationsMonthlyPlan.id,plan.id));
 const protectedInput=await input(plan.id,groups[0].id,2,[pre.id]);protectedInput.scheduleIds=[pre.id,legacy.schedule.id];await api(staff,path,protectedInput,422);
 const frozen=(await db.select().from(s.operationsReviewMeetingVersion).where(eq(s.operationsReviewMeetingVersion.id,fixturePlan.version.id)))[0].snapshot;assert.deepEqual(frozen,fixturePlan.snapshot);
 mark('指定已有帖不可替换；月会原冻结快照逐字段保留');
 const january=await seedLinkPlan(db,{month:'2027-01',final:false});await mode('schedule.create','review');
 const old=await api(staff,'/api/operations-content',form({...fields,contentName:'定稿前已受理的旧申请',plannedPublishAt:'2027-01-10T10:00'}),202);
 await db.update(s.operationsChangeProposal).set({createdAt:new Date('2026-11-05T03:58Z')}).where(eq(s.operationsChangeProposal.id,old.requestId));
 await db.update(s.operationsMonthlyPlan).set({firstFinalizedAt:new Date('2026-11-05T03:59Z')}).where(eq(s.operationsMonthlyPlan.id,january.plan.id));
 const oldDecision=await api(boss,'/api/business-change-proposals/'+old.requestId,{action:'approve',reason:''});assert.equal(oldDecision.status,'approved');
 assert(oldDecision.result.id);assert.equal((await db.select().from(s.operationsMonthlyPlanAssignment).where(eq(s.operationsMonthlyPlanAssignment.planId,january.plan.id))).length,0);
 await api(staff,'/api/operations-content',form({...fields,contentName:'定稿后漏选来源的申请',plannedPublishAt:'2027-01-10T10:00'}),422);
 mark('定稿前受理的旧新建申请可批准后补关联；定稿后的遗漏来源不绕过检查');
 await writeFile(folder+'/integration.json',JSON.stringify({passed:true,checks},null,2));
}catch(error){console.error(fixture.logs().slice(-5500));throw error;}finally{await fixture.stop();}
