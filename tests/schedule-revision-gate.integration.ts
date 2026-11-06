import {withDatabase} from '../src/db/client';
import {decideProposal} from '../src/db/business-approvals';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {eq} from 'drizzle-orm';
import {startPostgresFixture} from './postgres.fixture';
import {prepareMonthlyArrangement} from './monthly-arrangement.fixture';
import {seedLinkPost} from './monthly-plan-links.fixture';
import {businessFetch} from './business-request.helper';
import {admin,employee} from './auth.fixture';
import * as s from '../src/db/schema';
const dir=process.env.SCHEDULE_GATE_DIR??'.tools/test-artifacts/revision-gate';await mkdir(dir,{recursive:true});const clockFile=process.cwd()+'/'+dir+'/clock.txt';await writeFile(clockFile,'2026-11-06T12:00:00+08:00');
const f=await startPostgresFixture({clockFile,entry:process.env.SCHEDULE_GATE_ENTRY}),{db,baseURL}=f,checks:string[]=[];
const login=async(actor:any)=>{const r=await fetch(baseURL+'/api/auth/sign-in/username',{method:'POST',headers:{Origin:baseURL,'Content-Type':'application/json'},body:JSON.stringify(actor)});assert.equal(r.status,200);return r.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');};
try{
 const boss=await login(admin),staff=await login(employee);await prepareMonthlyArrangement(db,baseURL,boss);
 const post=await seedLinkPost(db,'原帖发布门禁','2026-11-05T10:00');
 const revise=async(versionId:string,scheduleId:string,cookie:string)=>{const data=new FormData();for(const[k,v]of Object.entries({sourceScheduleId:scheduleId,contentName:'改帖继承测试',revisionSummary:'按原帖内容调整',subjectId:'tmua',categoryId:'promotional-handout',plannedPublishAt:'2026-11-12T10:00',projectDocUrl:'https://example.test/doc',promotionStatus:'none'}))data.set(k,v);return businessFetch(baseURL+'/api/operations-content/versions/'+versionId+'/revisions',{method:'POST',headers:{Origin:baseURL,Cookie:cookie,Accept:'application/json'},body:data});};
 const before=await db.select().from(s.operationsContentVersion);
 for(const cookie of[boss,staff]){const r=await revise(post.version.id,post.schedule.id,cookie);assert.equal(r.status,422);assert.equal((await r.json()).code,'SOURCE_NOT_PUBLISHED');}
 assert.deepEqual(await db.select().from(s.operationsContentVersion),before);checks.push('两角色未发布直调拒绝422，无新增版本或业务事实');
 await db.update(s.operationsContentSchedule).set({actualPublishAt:new Date('2026-11-05T02:00Z')}).where(eq(s.operationsContentSchedule.id,post.schedule.id));
 const r=await revise(post.version.id,post.schedule.id,boss);assert.equal(r.status,201,await r.clone().text());const created=await r.json();const [v1]=await db.select().from(s.operationsContentVersion).innerJoin(s.operationsContentSchedule,eq(s.operationsContentVersion.id,s.operationsContentSchedule.contentVersionId)).where(eq(s.operationsContentSchedule.id,created.id));
 assert.equal((await revise(v1.operations_content_version.id,created.id,boss)).status,422);assert.equal((await revise(post.version.id,post.schedule.id,boss)).status,409);checks.push('已发布可创建；最新未发V1拒绝；不能绕过版本链从V0继续创建');
 const future=await seedLinkPost(db,'未来发布登记仍按已登记口径','2026-11-05T11:00');await db.update(s.operationsContentSchedule).set({actualPublishAt:new Date('2026-11-07T03:00Z')}).where(eq(s.operationsContentSchedule.id,future.schedule.id));
 const futureResponse=await revise(future.version.id,future.schedule.id,boss);assert.equal(futureResponse.status,201,await futureResponse.clone().text());checks.push('未来登记沿用actualPublishAt非空口径，不增加等时规则');
 const [staffUser]=await db.select().from(s.authUser).where(eq(s.authUser.username,employee.username)),[bossUser]=await db.select().from(s.authUser).where(eq(s.authUser.username,admin.username));
 await db.insert(s.operationsAccountPermission).values({userId:staffUser.id,operation:'schedule.revise',mode:'review'}).onConflictDoUpdate({target:[s.operationsAccountPermission.userId,s.operationsAccountPermission.operation],set:{mode:'review'}});
 const reviewed=await seedLinkPost(db,'审核模式来源门禁','2026-11-05T12:00');
 const proposalsBefore=await db.select().from(s.operationsChangeProposal);
 const unpubReview=await revise(reviewed.version.id,reviewed.schedule.id,staff);assert.equal(unpubReview.status,422);assert.equal((await unpubReview.json()).code,'SOURCE_NOT_PUBLISHED');assert.deepEqual(await db.select().from(s.operationsChangeProposal),proposalsBefore);
 await db.update(s.operationsContentSchedule).set({actualPublishAt:new Date('2026-11-05T04:00Z')}).where(eq(s.operationsContentSchedule.id,reviewed.schedule.id));
 const direct=await revise(reviewed.version.id,reviewed.schedule.id,staff);assert.equal(direct.status,201,await direct.clone().text());assert.deepEqual(await db.select().from(s.operationsChangeProposal),proposalsBefore);
 const actor={id:bossUser.id,username:bossUser.username!,role:'admin' as const};
 // Persisted legacy requests still pass the real approval replay and cannot ignore source changes.
 const legacy=await seedLinkPost(db,'旧待审重放来源变化','2026-11-05T13:00');
 const data=new FormData();for(const[k,v]of Object.entries({sourceScheduleId:legacy.schedule.id,contentName:'历史改帖申请',revisionSummary:'旧申请内容',subjectId:'tmua',categoryId:'promotional-handout',plannedPublishAt:'2026-11-12T10:00',projectDocUrl:'https://example.test/doc',promotionStatus:'none'}))data.set(k,v);
 const encoded=new Response(data),body=await encoded.text();
 const [legacyProposal]=await db.insert(s.operationsChangeProposal).values({requestedById:staffUser.id,requestedByLabel:staffUser.username!,module:'schedule',target:'schedule:'+legacy.schedule.id,operations:['schedule.revise'],path:'/api/operations-content/versions/'+legacy.version.id+'/revisions',method:'POST',contentType:encoded.headers.get('content-type')!,body,fingerprint:'previous-published-source-version',requestKey:crypto.randomUUID(),before:{},after:{}}).returning();
 const beforeReplay=await db.select().from(s.operationsContentVersion);
 const replay=await withDatabase(db,()=>decideProposal(legacyProposal.id,true,'尝试重放',actor,baseURL));assert.equal(replay.status,409);assert.deepEqual(await db.select().from(s.operationsContentVersion),beforeReplay);
 await db.update(s.operationsAccountPermission).set({mode:'disabled'}).where(eq(s.operationsAccountPermission.userId,staffUser.id));assert.equal((await revise(legacy.version.id,legacy.schedule.id,staff)).status,403);
 checks.push('旧review配置归一为直接保存，未发布仍拒绝；遗留过期申请重放无写入；关闭权限仍拒绝');
 await writeFile(dir+'/result.json',JSON.stringify({passed:true,checks},null,2));console.log(checks.join('\n'));
}finally{await f.stop();}
