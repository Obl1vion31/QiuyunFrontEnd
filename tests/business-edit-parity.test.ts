import assert from 'node:assert/strict';
import {before,after,test} from 'node:test';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {drizzle} from 'drizzle-orm/pglite';
import {eq} from 'drizzle-orm';
import {migrateFixture} from './migrate-fixture';
import * as s from '../src/db/schema';
import {readContentConfigurations,saveContentConfiguration} from '../src/db/content-config';
import {readTaxonomy} from '../src/db/taxonomy-store';
import {readMonthlyWorkspace} from '../src/db/monthly-workspace';
import {savePrivate,privateInput} from '../src/db/monthly-private';
import {reviseSealedMeetingText} from '../src/db/meeting-sealed-revision';
import {seedPrivateSources,seedFrozenPrivateMeeting,octoberData} from './private-sources.fixture';

const pg=new PGlite(),db=drizzle(pg,{schema:s});
const admin={id:'config-admin',username:'配置管理员',role:'admin' as const},staff={id:'config-staff',username:'业务员工',role:'employee' as const};
before(async()=>{await migrateFixture(pg);await db.insert(s.authUser).values([admin,staff].map(a=>({...a,name:a.username,email:a.id+'@example.test'})));});
after(()=>pg.close());
const subject=async(id='tmua')=>(await readContentConfigurations(db)).configurations.find(c=>c.subjectId===id)!;

test('兼容迁移导入原名称顺序和已保存用途，保留空归类且可重复执行',async()=>{
 await db.insert(s.operationsMonthlyCostMapping).values({id:'global',entries:{'tmua:mock-exam':null},updatedBy:admin.username});
 const migration=await readFile(new URL('../drizzle/0050_subject_content_config.sql',import.meta.url),'utf8');
 const seed=migration.slice(migration.indexOf('INSERT INTO operations_content_config'));
 const before=await subject();await pg.exec(seed);await pg.exec(seed);
 const after=await subject();assert.deepEqual(after.config,before.config);assert.equal(after.revision,0);
 assert.equal(after.config.types.find(t=>t.id==='mock-exam')!.purposeId,null);
});
test('学科独立名称、顺序及默认值；配置并发和用途引用在事务内校验',async()=>{
 const tmua=await subject(),step=await subject('step'),config=structuredClone(tmua.config);
 config.types.reverse();config.types.find(t=>t.id==='small-class-or-tutoring')!.name='TMUA 专题课程';
 config.types.find(t=>t.id==='small-class-or-tutoring')!.defaultOperationType='non_promotion_instant';
 await assert.rejects(saveContentConfiguration(db,{subjectId:'tmua',expectedRevision:tmua.revision,config},staff),/管理员/);
 await saveContentConfiguration(db,{subjectId:'tmua',expectedRevision:tmua.revision,config},admin);
 assert.deepEqual((await subject('step')).config,step.config);
 const effective=await readTaxonomy(db);assert.equal(effective.subjectCategories.find(t=>t.subjectId==='tmua'&&t.id==='small-class-or-tutoring')!.name,'TMUA 专题课程');
 assert.equal(effective.subjectCategories.filter(t=>t.subjectId==='tmua')[0].id,config.types[0].id);
 await assert.rejects(saveContentConfiguration(db,{subjectId:'tmua',expectedRevision:tmua.revision,config},admin),/已更新/);
 const latest=await subject(),invalid=structuredClone(latest.config);invalid.types[0].purposeId='foreign-purpose';
 await assert.rejects(saveContentConfiguration(db,{subjectId:'tmua',expectedRevision:latest.revision,config:invalid},admin),/本学科/);
 invalid.types[0].purposeId=null;invalid.types[0].name=invalid.types[1].name;
 await assert.rejects(saveContentConfiguration(db,{subjectId:'tmua',expectedRevision:latest.revision,config:invalid},admin),/重复/);
});
test('新增用途参与真实消耗与人数校验；往月重算不移动人数，冻结材料保留',async()=>{
 await seedPrivateSources(db);
 const frozen=await seedFrozenPrivateMeeting(db,'2026-10','封存口径测试'),before=await readMonthlyWorkspace(db,{month:'2026-10',subject:'',category:''});
 const current=await subject(),config=structuredClone(current.config),purposeId=randomUUID(),categoryId='category-'+randomUUID();
 config.purposes.push({id:purposeId,name:'专题活动'});
 config.types.find(t=>t.id==='small-class-or-tutoring')!.purposeId=purposeId;
 config.types.push({id:categoryId,name:'TMUA 活动通知',purposeId,defaultOperationType:'non_promotion_standard'});
 await saveContentConfiguration(db,{subjectId:'tmua',expectedRevision:current.revision,config},admin);
 const after=await readMonthlyWorkspace(db,{month:'2026-10',subject:'',category:''});
 assert.equal(after.privateData.subjects.find(s=>s.id==='tmua')!.demands.find(d=>d.demand===purposeId)!.spend,14000);
 assert.equal(after.privateData.subjects.find(s=>s.id==='tmua')!.demands.find(d=>d.demand==='course')!.counts.added,3);
 assert.equal(after.privateData.subjects.find(s=>s.id==='tmua')!.demands.find(d=>d.demand===purposeId)!.counts.added,null);
 assert.equal(after.spend.spend,before.spend.spend);
 const stored=(await db.select().from(s.operationsMonthlyPrivate).where(eq(s.operationsMonthlyPrivate.month,'2026-10')))[0];
 assert.deepEqual((stored.data as any).promotion,octoberData.promotion);
 const input={...structuredClone(octoberData),promotion:[...octoberData.promotion,{subjectId:'tmua',demand:purposeId,added:2,consulted:1,converted:0}]};
 await savePrivate(db,privateInput.parse({month:'2026-10',expectedRevision:0,data:input}),staff.username);
 await savePrivate(db,privateInput.parse({month:'2026-10',expectedRevision:0,data:input}),admin.username);
 input.promotion.at(-1)!.demand='unrecognized';
 await assert.rejects(savePrivate(db,privateInput.parse({month:'2026-10',expectedRevision:1,data:input}),staff.username),/用途/);
 const old=(await db.select().from(s.operationsReviewMeetingVersion).where(eq(s.operationsReviewMeetingVersion.id,frozen.version.id)))[0];
 assert.deepEqual(old.snapshot,frozen.snapshot);
});
test('双方封存文字修订直接追加有效版本，不改变计划、封存时间、统计或事项',async()=>{
 const [meeting]=await db.select().from(s.operationsReviewMeeting);
 const [plan]=await db.select().from(s.operationsMonthlyPlan).where(eq(s.operationsMonthlyPlan.meetingId,meeting.id));
 const [original]=await db.select().from(s.operationsReviewMeetingVersion).where(eq(s.operationsReviewMeetingVersion.id,plan.sealedVersionId!));
 let source=original.id,stamp=meeting.updatedAt.toISOString(),versionNumber=original.versionNumber;
 for(const actor of [staff,admin]){
  const payload={action:'revise_sealed_text',sourceVersionId:source,expectedUpdatedAt:stamp,coreConclusion:actor.username+'修订结论',nextAction:'下一步继续核对'};
  const result=await reviseSealedMeetingText(db,meeting.id,payload,actor.username);
  assert.equal(result.versionNumber,++versionNumber);source=result.versionId;stamp=result.updatedAt;
  const [created]=await db.select().from(s.operationsReviewMeetingVersion).where(eq(s.operationsReviewMeetingVersion.id,source));
  assert.equal(created.lifecycleStatus,'finalized');assert.equal(created.finalizedByLabel,actor.username);assert.deepEqual(created.businessEffects,[]);
  assert.deepEqual((created.snapshot as any).generated,(original.snapshot as any).generated);
  assert.deepEqual((created.snapshot as any).draft.monthlyPlan,(original.snapshot as any).draft.monthlyPlan);
  const noChange=await reviseSealedMeetingText(db,meeting.id,{...payload,sourceVersionId:source,expectedUpdatedAt:stamp},actor.username);assert.equal(noChange.unchanged,true);
  await assert.rejects(reviseSealedMeetingText(db,meeting.id,{...payload,sourceVersionId:source,expectedUpdatedAt:stamp,issues:[]},actor.username),/Unrecognized key/);
  await assert.rejects(reviseSealedMeetingText(db,meeting.id,payload,actor.username),/已有新的修订/);
 }
 const [unchangedPlan]=await db.select().from(s.operationsMonthlyPlan).where(eq(s.operationsMonthlyPlan.id,plan.id));assert.deepEqual(unchangedPlan,plan);
 const [unchangedOriginal]=await db.select().from(s.operationsReviewMeetingVersion).where(eq(s.operationsReviewMeetingVersion.id,original.id));assert.deepEqual(unchangedOriginal,original);
 const [updated]=await db.select().from(s.operationsReviewMeeting).where(eq(s.operationsReviewMeeting.id,meeting.id));assert.deepEqual(updated.finalizedAt,meeting.finalizedAt);
});
