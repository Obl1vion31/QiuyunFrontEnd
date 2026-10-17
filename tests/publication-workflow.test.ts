import assert from 'node:assert/strict';
import {after,before,test} from 'node:test';
import {PGlite} from '@electric-sql/pglite';
import {drizzle} from 'drizzle-orm/pglite';
import {eq} from 'drizzle-orm';
import * as schema from '../src/db/schema';
import {migrateFixture} from './migrate-fixture';
import {registerPublication} from '../src/db/publication-workflow';
import {readScheduleWorkflow,teamScheduleNotifications} from '../src/db/schedule-workflow';
import {publicationUrlSchema,publicationSchema} from '../src/db/validation';
import {publicationState,mayKeepEmptyPublicationLink} from '../src/db/publication-rules.mjs';
import {nextReviewCheckpoint} from '../src/db/stage-review-rules.mjs';
const pg=new PGlite(),db=drizzle(pg,{schema});
const admin={id:'fictional-admin',username:'虚构管理员',role:'admin' as const},employee={id:'fictional-employee',username:'虚构员工',role:'employee' as const};
const now=new Date('2026-10-17T17:00:00+08:00'),later=new Date('2026-10-17T20:00:00+08:00');
const link='https://xhslink.cn/o/4KuczULK8Ja';
const share=`2026TMUA超完整超全解析来啦！！🤩 所有时区的考试全... ${link} 快戳【小红书】瞧瞧这篇笔记！`;
before(()=>migrateFixture(pg));after(()=>pg.close());
async function seed(actual:Date|null=null,planned=actual??now){
 const[c]=await db.insert(schema.operationsContent).values({}).returning();
 const[v]=await db.insert(schema.operationsContentVersion).values({contentId:c.id,versionNumber:0,workType:'new',contentName:'虚构统一发布验收',subjectId:'tmua',categoryId:'temporary'}).returning();
 return (await db.insert(schema.operationsContentSchedule).values({contentVersionId:v.id,plannedPublishAt:planned,actualPublishAt:actual,completionStatus:actual?'on_time':'pending'}).returning())[0];
}
const revision=(s:{planRevision:number;publicationRevision:number})=>({expectedPlanRevision:s.planRevision,expectedPublicationRevision:s.publicationRevision});
const sent=(s:Parameters<typeof revision>[0])=>({...revision(s),actualPublishAt:now,publicationUrl:link,projectDocUrl:'https://fictional.example.test/doc'});
const read=(id:string,at=now)=>readScheduleWorkflow(db,id,undefined,at);
test('完整分享文案提取 cn／com 短链及长链，保留签名，拒绝伪造域名和多链接',()=>{
 assert.equal(publicationUrlSchema.parse(share),link);
 for(const url of [link,'http://xhslink.com/o/abc123','https://www.xiaohongshu.com/explore/'+'a'.repeat(24)+'?xsec_token=abc_123&xsec_source=pc_feed']){
  assert.equal(publicationUrlSchema.parse(`标题🤩\n${url}，快来看看！`),url);
  assert.equal(publicationUrlSchema.parse(`(${url}).`),url);
 }
 assert.equal(publicationUrlSchema.parse(`${link} ${link}`),link);
 for(const url of ['','https://www.xiaohongshu.com/','https://xhslink.cn.evil.test/o/abc','https://evil.test/?url=https://xhslink.cn/o/abc','https://user:pass@xhslink.cn/o/abc','https://fictional.example.test/doc',`${link} https://xhslink.com/o/other`])assert.equal(publicationUrlSchema.safeParse(url).success,false,url);
});
test('17 点直接登记 20 点，立即已发送，不创建预约或提前开放复盘',async()=>{
 const s=await seed();await registerPublication(db,s.id,{...sent(s),actualPublishAt:later},[],false,employee,now);
 const w=await read(s.id);assert.equal(w.publicationState,'published');assert.equal(w.schedule.actualPublishAt?.getTime(),later.getTime());assert.equal(w.schedule.publicationUrl,link);
 assert.equal(w.publicationReservations.length,0);assert.equal(w.schedule.completionStatus,'delayed');
 assert.equal(nextReviewCheckpoint(later,[],'2026-10-17'),null);
 assert.equal((await db.select().from(schema.operationsPromotionCampaign)).length,0);
});
test('新登记即使补登截止前日期也必须链接，不能冒用旧记录空值规则',async()=>{
 const s=await seed();
 for(const actualPublishAt of [now,new Date('2026-10-16T12:00:00+08:00')])await assert.rejects(registerPublication(db,s.id,{...sent(s),actualPublishAt,publicationUrl:null},[],false,employee,now),/帖子链接/);
 assert.equal(mayKeepEmptyPublicationLink(s),false);
});
test('截止前现存已发允许留空且保持秒数，截止日与已有链接不能清空',async()=>{
 const actual=new Date('2026-10-16T12:00:12+08:00'),s=await seed(actual);
 assert.equal(mayKeepEmptyPublicationLink(s),true);
 const input=publicationSchema.parse({...revision(s),publicationUrl:''});
 await registerPublication(db,s.id,input,[],false,employee,now);
 let w=await read(s.id);assert.equal(w.schedule.publicationUrl,null);assert.equal(w.schedule.actualPublishAt?.getTime(),actual.getTime());assert.equal(w.publicationHistory.length,0);
 await registerPublication(db,s.id,{...revision(w.schedule),publicationUrl:link},[],false,employee,now);
 w=await read(s.id);assert.equal(w.schedule.actualPublishAt?.getTime(),actual.getTime());
 await assert.rejects(registerPublication(db,s.id,{...revision(w.schedule),publicationUrl:null},[],false,employee,now),/帖子链接/);
 const boundary=await seed(new Date('2026-10-17T00:00:00+08:00'));
 assert.equal(mayKeepEmptyPublicationLink(boundary),false);
 await assert.rejects(registerPublication(db,boundary.id,{...revision(boundary),publicationUrl:null},[],false,employee,now),/帖子链接/);
});
test('已有实发时间仅管理员凭原因更正，旧修订不得覆盖，更正旧记录至截止后须链接',async()=>{
 const s=await seed(new Date('2026-10-16T12:00:00+08:00'),now);
 await assert.rejects(registerPublication(db,s.id,{...sent(s),actualPublishAt:later,correctionReason:'核对平台时间'},[],false,employee,now),/管理员/);
 await assert.rejects(registerPublication(db,s.id,{...sent(s),actualPublishAt:later},[],false,admin,now),/填写原因/);
 await assert.rejects(registerPublication(db,s.id,{...sent(s),actualPublishAt:later,publicationUrl:null,correctionReason:'核对平台时间'},[],false,admin,now),/帖子链接/);
 await registerPublication(db,s.id,{...sent(s),actualPublishAt:later,correctionReason:'核对平台时间'},[],false,admin,now);
 const w=await read(s.id);assert.equal(w.publicationHistory[0].before.actualPublishAt,s.actualPublishAt?.toISOString());assert.equal(w.publicationHistory[0].reason,'核对平台时间');
 await assert.rejects(registerPublication(db,s.id,sent(s),[],false,employee,now),/已更新/);
});
test('未来发布时间仅核对已到期理由，随后按时间推进，直到填写的发布时间截止',async()=>{
 const planned=new Date(now.getTime()-34*3600000),future=new Date(now.getTime()+48*3600000),s=await seed(null,planned);
 const w=await readScheduleWorkflow(db,s.id,future,now);assert.equal(w.days.length,2);assert.ok(w.days.every(day=>day.dueAt<=now));
 const reasons=w.days.map(day=>({planRevision:day.planRevision,dayNumber:day.dayNumber,responsibility:'self' as const,reason:'已调整发布安排',expectedUpdatedAt:null}));
 await registerPublication(db,s.id,{...sent(s),actualPublishAt:future},reasons,false,employee,now);
 assert.ok(!(await teamScheduleNotifications(db,now)).missingReasonIds.includes(s.id));
 assert.ok((await teamScheduleNotifications(db,new Date(now.getTime()+24*3600000))).missingReasonIds.includes(s.id));
 const after=await read(s.id,new Date(future.getTime()+72*3600000));assert.ok(after.days.every(day=>day.dueAt<=future));
});
test('旧预约仅保留历史且不产生待审或到点提醒，统一登记后结束旧记录',async()=>{
 const s=await seed();await db.insert(schema.operationsPublicationReservation).values({scheduleId:s.id,planRevision:0,scheduledPublishAt:now,requestKey:crypto.randomUUID(),status:'pending',requestedById:employee.id,requestedByLabel:employee.username});
 assert.equal((await read(s.id)).publicationState,'unpublished');
 const notices=await teamScheduleNotifications(db,now);assert.equal(notices.reservationApprovals,0);assert.equal(notices.publicationDue,0);
 await registerPublication(db,s.id,sent(s),[],false,employee,now);
 const w=await read(s.id);assert.equal(w.publicationReservations[0].status,'fulfilled');assert.equal(publicationState(w.schedule),'published');
 assert.equal((await db.select().from(schema.operationsPublicationEvent).where(eq(schema.operationsPublicationEvent.scheduleId,s.id))).length,1);
});
