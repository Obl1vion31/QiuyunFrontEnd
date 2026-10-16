import assert from 'node:assert/strict';
import {after,before,test} from 'node:test';
import {PGlite} from '@electric-sql/pglite';
import {drizzle} from 'drizzle-orm/pglite';
import {randomUUID} from 'node:crypto';
import * as schema from '../src/db/schema';
import {migrateFixture} from './migrate-fixture';
import {createReservation,decideReservation,registerPublication,reservationDecisionSchema} from '../src/db/publication-workflow';
import {changeSchedulePlan,readScheduleWorkflow,teamScheduleNotifications} from '../src/db/schedule-workflow';
import {publicationUrlSchema,publicationSchema} from '../src/db/validation';
import {publicationState} from '../src/db/publication-rules.mjs';
const pg=new PGlite(),db=drizzle(pg,{schema});
const admin={id:'fictional-admin',username:'虚构管理员',role:'admin' as const},employee={id:'fictional-employee',username:'虚构员工',role:'employee' as const};
const now=new Date('2026-10-16T17:00:00+08:00'),later=new Date('2026-10-16T20:00:00+08:00');
const link='https://www.xiaohongshu.com/explore/'+ 'a'.repeat(24);
before(()=>migrateFixture(pg));after(()=>pg.close());
async function seed(actual:Date|null=null){
 const[c]=await db.insert(schema.operationsContent).values({}).returning();
 const[v]=await db.insert(schema.operationsContentVersion).values({contentId:c.id,versionNumber:0,workType:'new',contentName:'虚构预约验收',subjectId:'tmua',categoryId:'temporary'}).returning();
 return (await db.insert(schema.operationsContentSchedule).values({contentVersionId:v.id,plannedPublishAt:now,actualPublishAt:actual,completionStatus:actual?'on_time':'pending'}).returning())[0];
}
const revision=(s:{planRevision:number;publicationRevision:number})=>({expectedPlanRevision:s.planRevision,expectedPublicationRevision:s.publicationRevision});
const booking=(s:Parameters<typeof revision>[0])=>({...revision(s),scheduledPublishAt:later,requestKey:randomUUID()});
const sent=(s:Parameters<typeof revision>[0])=>({...revision(s),actualPublishAt:now,publicationUrl:link,projectDocUrl:'https://fictional.example.test/doc'});
const read=(id:string,at=now)=>readScheduleWorkflow(db,id,undefined,at);
test('帖子链接只接受小红书帖子或分享链接，项目文档不能冒充发布证据',()=>{
 for(const url of [link+'?xsec_token=fictional',link.replace('/explore/','/discovery/item/'),'http://xhslink.com/o/abc123'])assert.equal(publicationUrlSchema.safeParse(url).success,true,url);
 for(const url of ['','https://www.xiaohongshu.com/','https://www.xiaohongshu.com.evil.test/explore/'+'a'.repeat(24),'https://fictional.example.test/doc','javascript:alert(1)','https://user:pass@xhslink.com/o/abc'])assert.equal(publicationUrlSchema.safeParse(url).success,false,url);
 assert.equal(publicationSchema.safeParse({...sent({planRevision:0,publicationRevision:0}),actualPublishAt:'2026-10-16T17:00',publicationUrl:''}).success,false);
});
test('17点可登记20点预约，员工待审，到点不自动实发或进入复盘',async()=>{
 const s=await seed(),created=await createReservation(db,s.id,booking(s),employee,now);
 let w=await read(s.id);assert.equal(created.status,'pending');assert.equal(w.publicationState,'awaiting_approval');assert.equal(w.schedule.actualPublishAt,null);assert.equal(w.schedule.plannedPublishAt.getTime(),now.getTime());
 w=await read(s.id,later);assert.equal(w.publicationState,'needs_confirmation');assert.equal(w.schedule.actualPublishAt,null);
 assert.equal((await db.select().from(schema.operationsPromotionCampaign)).length,0);assert.equal((await db.select().from(schema.operationsNonPromotionReview)).length,0);
 const reminders=await teamScheduleNotifications(db,later);assert.ok(reminders.reservationApprovalIds.includes(s.id));assert.ok(reminders.publicationDueIds.includes(s.id));
 await assert.rejects(decideReservation(db,s.id,created.id,{...revision(w.schedule),action:'approve',reason:''},employee,later),/管理员/);
 await decideReservation(db,s.id,created.id,{...revision(w.schedule),action:'approve',reason:''},admin,later);
 assert.equal((await read(s.id,later)).publicationState,'needs_confirmation','管理员晚审仍不生成实发');
});
test('预约提交幂等、修改使旧预约失效，取消保留历史',async()=>{
 const s=await seed(),input=booking(s),first=await createReservation(db,s.id,input,employee,now);
 assert.equal((await createReservation(db,s.id,input,employee,later)).id,first.id,'到点后的网络重试仍返回原记录');
 await assert.rejects(createReservation(db,s.id,{...input,scheduledPublishAt:new Date(later.getTime()+60000)},employee,now),/提交标识/);
 const w=await read(s.id);const next=await createReservation(db,s.id,{...booking(w.schedule),scheduledPublishAt:new Date(later.getTime()+60000)},employee,now);
 let updated=await read(s.id);assert.equal(updated.publicationReservations.find(r=>r.id===first.id)?.status,'obsolete');
 await decideReservation(db,s.id,next.id,{...revision(updated.schedule),action:'cancel',reason:''},employee,now);
 updated=await read(s.id);assert.equal(updated.publicationReservations[0].status,'cancelled');assert.deepEqual(updated.publicationReservations[0].history.map(row=>row.status),['pending','cancelled']);assert.equal(updated.schedule.actualPublishAt,null);
});
test('管理员登记直接生效，驳回重提留痕，过期新预约被拒绝',async()=>{
 const s=await seed();await assert.rejects(createReservation(db,s.id,{...booking(s),scheduledPublishAt:now},employee,now),/晚于当前时间/);
 const created=await createReservation(db,s.id,booking(s),admin,now);assert.equal(created.status,'approved');assert.equal((await read(s.id)).publicationState,'scheduled');
 const unchanged=await read(s.id);assert.equal((await createReservation(db,s.id,booking(unchanged.schedule),employee,now)).status,'approved','相同预约重新打开保存不撤销已有审核');
 const other=await seed(),pending=await createReservation(db,other.id,booking(other),employee,now);const w=await read(other.id);
 assert.equal(reservationDecisionSchema.safeParse({...revision(w.schedule),action:'reject',reason:''}).success,false);
 await decideReservation(db,other.id,pending.id,{...revision(w.schedule),action:'reject',reason:'请核对平台定时设置'},admin,now);
 assert.equal((await read(other.id)).publicationState,'rejected');
});
test('改期使预约失效，旧修订不能审批或覆盖发布记录',async()=>{
 const s=await seed(),created=await createReservation(db,s.id,booking(s),employee,now),w=await read(s.id);
 await db.transaction(tx=>changeSchedulePlan(tx,w.schedule,new Date(later.getTime()+3600000),'需求调整',admin,now));
 const changed=await read(s.id);assert.equal(changed.publicationReservations[0].status,'obsolete');
 await assert.rejects(decideReservation(db,s.id,created.id,{...revision(w.schedule),action:'approve',reason:''},admin,now),/已更新/);
 await assert.rejects(registerPublication(db,s.id,sent(w.schedule),[],false,employee,now),/已更新/);
});
test('首次实发直提并结束预约，未来实发与已有时间的员工更正被拒绝',async()=>{
 const s=await seed();await assert.rejects(registerPublication(db,s.id,{...sent(s),actualPublishAt:later},[],false,employee,now),/预约发送/);
 await createReservation(db,s.id,booking(s),employee,now);let w=await read(s.id);
 await registerPublication(db,s.id,sent(w.schedule),[],false,employee,now);
 w=await read(s.id);assert.equal(w.publicationState,'published');assert.equal(w.schedule.actualPublishAt?.getTime(),now.getTime());assert.equal(w.publicationReservations[0].status,'fulfilled');assert.equal(w.publicationHistory[0].changedByLabel,employee.username);
 const correction={...sent(w.schedule),actualPublishAt:new Date(now.getTime()-60000),correctionReason:'核对帖子链接后更正时间'};
 await assert.rejects(registerPublication(db,s.id,correction,[],false,employee,now),/管理员/);
 await assert.rejects(registerPublication(db,s.id,{...correction,correctionReason:''},[],false,admin,now),/更正原因|填写原因/);
 await registerPublication(db,s.id,correction,[],false,admin,now);
 w=await read(s.id);assert.equal(w.publicationHistory.length,2);assert.equal(w.publicationHistory[0].before.actualPublishAt,now.toISOString());assert.equal(w.publicationHistory[0].reason,correction.correctionReason);
});
test('历史已发可由员工补链接，无需改变原始实发时间与项目文档',async()=>{
 const actual=new Date(now.getTime()-123456),s=await seed(actual);
 await registerPublication(db,s.id,{...revision(s),publicationUrl:link},[],false,employee,now);
 const w=await read(s.id);assert.equal(w.schedule.actualPublishAt?.getTime(),actual.getTime());assert.equal(w.schedule.publicationUrl,link);assert.equal(w.schedule.completionStatus,'on_time');
 assert.equal(publicationState(w.schedule,undefined,now),'published');
});
