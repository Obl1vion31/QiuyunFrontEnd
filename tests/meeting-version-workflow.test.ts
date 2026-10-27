import {readFile} from 'node:fs/promises';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {drizzle} from 'drizzle-orm/pglite';
import {eq} from 'drizzle-orm';
import {migrateFixture} from './migrate-fixture';
import * as s from '../src/db/schema';
import {reviseMeetingVersion as writeVersion} from '../src/db/meeting-version-workflow';
import {discussionFromDraft} from '../src/db/meeting-discussion-values';
import {withFrozenRateComparisons} from '../src/db/meeting-rate-comparison';
import {meetingArrangementsExpired} from '../src/db/meeting-version-rules';
import {resolveMeetingDecisions} from '../src/db/meeting-decision-rules.mjs';
async function reviseMeetingVersion(db:any,id:string,payload:any,actor:string,at?:Date){
 if(payload.action==='save_version_revision')payload={...payload,action:'finalize_version_draft',stage:'pre'};
 if(payload.action==='finalize_version')payload={...payload,action:'finalize_version_draft',stage:'post'};
 const [source]=await db.select().from(s.operationsReviewMeetingVersion).where(eq(s.operationsReviewMeetingVersion.id,payload.sourceVersionId));
 if(payload.stage==='pre'&&(source?.snapshot as any)?.finalizationStage==='post')payload.stage='post';
 return writeVersion(db,id,payload,actor,at);
}
const before=new Date('2026-10-25T18:00:00+08:00'),after=new Date('2026-10-26T00:00:00+08:00');
async function fixture(run:(db:any,m:any,v:any)=>Promise<void>){const pg=new PGlite(),db=drizzle(pg,{schema:s});try{await migrateFixture(pg);const draft={schemaVersion:4,workflowVersion:5,candidatesConfirmed:true,coreConclusion:'核心结论',nextAction:'下一步',situation:'衡量情况',strategy:'具体动作',promotionInputs:{},promotionDecisions:{},nonPromotionSelections:[],issues:[{problem:'跟进问题',conclusion:'解决方案',status:'pending'}]};const[m]=await db.insert(s.operationsReviewMeeting).values({name:'隔离例会',periodStart:'2026-10-16',periodEnd:'2026-10-24',meetingAt:before,status:'completed',draftSnapshot:draft as any,createdByLabel:'fixture'}).returning();const[v]=await db.insert(s.operationsReviewMeetingVersion).values({meetingId:m.id,versionNumber:0,finalizedByLabel:'fixture',changeSummary:'会前',snapshot:{schemaVersion:4,meeting:{name:m.name,periodEnd:m.periodEnd},draft,finalizationStage:'pre',decisionEffectiveOn:'2026-10-26',generated:{promotions:[],nonPromotions:[],summary:{}}},businessEffects:[]}).returning();await run(db,m,v);}finally{await pg.close();}}
test('旧冻结样本补出带本帖均值，源快照不变；零值与截止日保留',()=>{const rows=[10,20,0].map((clickRate,i)=>({key:'p'+i,subjectId:'tmua',categoryId:'解析',checkpointType:'day_7',recordedThrough:'2026-10-24',clickRate,threeSecondReadRate:40+i,peers:{samples:[]},historical:{samples:[]}}));const source={schemaVersion:4,meeting:{periodEnd:'2026-10-24'},draft:{promotionInputs:{}},generated:{nonPromotions:rows,promotions:[]}},original=JSON.stringify(source);const shown:any=withFrozenRateComparisons(source);assert.equal(shown.generated.nonPromotions[0].rateComparison.n,3);assert.equal(shown.generated.nonPromotions[0].rateComparison.clickRate,10);assert.equal(JSON.stringify(source),original);assert.equal(meetingArrangementsExpired('2026-10-26',new Date('2026-10-25T23:59:59+08:00')),false);assert.equal(meetingArrangementsExpired('2026-10-26',after),true);});
test('最新会前另存版本，旧版与注入指标拒绝，原版指标和JSON不变',()=>fixture(async(db,m,v)=>{const original=JSON.stringify(v.snapshot),input=discussionFromDraft(v.snapshot.draft as any);input.coreConclusion='修订结论';const result=await reviseMeetingVersion(db,m.id,{action:'save_version_revision',sourceVersionId:v.id,expectedUpdatedAt:m.updatedAt.toISOString(),discussion:input},'fixture',before);assert.equal(result.versionNumber,1);assert.equal(JSON.stringify((await db.select().from(s.operationsReviewMeetingVersion).where(eq(s.operationsReviewMeetingVersion.id,v.id)))[0].snapshot),original);await assert.rejects(()=>reviseMeetingVersion(db,m.id,{action:'save_version_revision',sourceVersionId:v.id,expectedUpdatedAt:result.updatedAt,discussion:input},'fixture',before),/最新有效/);const[current]=await db.select().from(s.operationsReviewMeetingVersion).where(eq(s.operationsReviewMeetingVersion.id,result.versionId));await assert.rejects(()=>reviseMeetingVersion(db,m.id,{action:'save_version_revision',sourceVersionId:current.id,expectedUpdatedAt:result.updatedAt,discussion:{...input,clickRate:99}},'fixture',before),/格式/);}));
test('会后过期仍可改文字，安排不顺延、不重复流转，零点起禁止回溯',()=>fixture(async(db,m,v)=>{const input=discussionFromDraft(v.snapshot.draft as any);const post=await reviseMeetingVersion(db,m.id,{action:'finalize_version',sourceVersionId:v.id,expectedUpdatedAt:m.updatedAt.toISOString(),discussion:input},'fixture',before);const[p]=await db.select().from(s.operationsReviewMeetingVersion).where(eq(s.operationsReviewMeetingVersion.id,post.versionId));const values=discussionFromDraft(p.snapshot.draft as any);values.coreConclusion='过期修订文字';const next=await reviseMeetingVersion(db,m.id,{action:'save_version_revision',sourceVersionId:p.id,expectedUpdatedAt:post.updatedAt,discussion:values},'fixture',after);const[n]=await db.select().from(s.operationsReviewMeetingVersion).where(eq(s.operationsReviewMeetingVersion.id,next.versionId));assert.equal(n.snapshot.decisionEffectiveOn,'2026-10-26');assert.equal(n.snapshot.decisionPolicy,'inherit');assert.equal((await db.select().from(s.operationsReviewActionItem)).length,1);await assert.rejects(()=>reviseMeetingVersion(db,m.id,{action:'rollback_version',sourceVersionId:v.id,expectedUpdatedAt:next.updatedAt,confirmed:true},'fixture',after),/已过/);}));
test('回溯原子失效后续版本并撤销事项，V号续增且需重新确认安排',()=>fixture(async(db,m,v)=>{const post=await reviseMeetingVersion(db,m.id,{action:'finalize_version',sourceVersionId:v.id,expectedUpdatedAt:m.updatedAt.toISOString(),discussion:discussionFromDraft(v.snapshot.draft as any)},'fixture',before);const[p]=await db.select().from(s.operationsReviewMeetingVersion).where(eq(s.operationsReviewMeetingVersion.id,post.versionId));const values=discussionFromDraft(p.snapshot.draft as any);values.issues[0].conclusion='新方案';const next=await reviseMeetingVersion(db,m.id,{action:'save_version_revision',sourceVersionId:p.id,expectedUpdatedAt:post.updatedAt,discussion:values},'fixture',before);const restored=await reviseMeetingVersion(db,m.id,{action:'rollback_version',sourceVersionId:v.id,expectedUpdatedAt:next.updatedAt,confirmed:true},'fixture',before);assert.equal(restored.versionNumber,3);const rows=await db.select().from(s.operationsReviewMeetingVersion);assert.equal(rows.filter((r:any)=>r.invalidatedAt).length,2);assert.equal((await db.select().from(s.operationsReviewActionItem)).length,0);assert.equal((rows.find((r:any)=>r.id===restored.versionId)!.snapshot as any).draft.arrangementsRequireConfirmation,true);assert.deepEqual(resolveMeetingDecisions(rows,[]),[]);}));
test('事项被别处更新时回溯全部回滚，不产生部分失效',()=>fixture(async(db,m,v)=>{const post=await reviseMeetingVersion(db,m.id,{action:'finalize_version',sourceVersionId:v.id,expectedUpdatedAt:m.updatedAt.toISOString(),discussion:discussionFromDraft(v.snapshot.draft as any)},'fixture',before);await db.update(s.operationsReviewActionItem).set({problem:'其他会议修改'});await assert.rejects(()=>reviseMeetingVersion(db,m.id,{action:'rollback_version',sourceVersionId:v.id,expectedUpdatedAt:post.updatedAt,confirmed:true},'fixture',before),/其他工作更新/);assert.equal((await db.select().from(s.operationsReviewMeetingVersion)).length,2);assert.equal((await db.select().from(s.operationsReviewMeetingVersion)).filter((r:any)=>r.invalidatedAt).length,0);}));

test('纯文字修订继承执行来源，不盖掉日度更正；失效版本不再执行',()=>{const decision={id:'m:c:2026-10-26',campaignId:'c',meetingId:'m',versionNumber:1,effectiveOn:'2026-10-26',targetStatus:'testing'};const first={meetingId:'m',createdAt:'2026-10-25T10:00:00Z',snapshot:{finalizationStage:'post',decisionEffectiveOn:'2026-10-26',generated:{meetingDecisions:[decision]}}};const correction={createdAt:'2026-10-25T11:00:00Z',after:{meetingDecision:{...decision,targetStatus:'test_paused'}}};const revision={...first,createdAt:'2026-10-25T12:00:00Z',snapshot:{...first.snapshot,decisionPolicy:'inherit'}};assert.equal(resolveMeetingDecisions([first,revision],[correction])[0].targetStatus,'test_paused');assert.deepEqual(resolveMeetingDecisions([{...first,invalidatedAt:new Date()}, {...revision,invalidatedAt:new Date()}],[correction]),[]);});

test('回溯至旧会后也撤销本场安排，重新会后定稿前不沿用目标安排',()=>{const d={id:'m:c',meetingId:'m',campaignId:'c',versionNumber:1,effectiveOn:'2026-10-26',targetStatus:'testing'};const old={meetingId:'m',createdAt:'2026-10-25T10:00:00Z',snapshot:{finalizationStage:'post',decisionEffectiveOn:d.effectiveOn,generated:{meetingDecisions:[d]}}};const reset={meetingId:'m',createdAt:'2026-10-25T12:00:00Z',snapshot:{finalizationStage:'pre',decisionPolicy:'reset',decisionEffectiveOn:d.effectiveOn,generated:{meetingDecisions:[]}}};assert.deepEqual(resolveMeetingDecisions([old,reset],[]),[]);});

test('0039追加迁移保留原快照与附件，旧写入默认仍有效',async()=>{const pg=new PGlite();try{await pg.exec(`CREATE TABLE operations_meeting_attachment (id int primary key); CREATE TABLE operations_review_meeting_version(id int primary key,snapshot jsonb NOT NULL); INSERT INTO operations_review_meeting_version VALUES(1,'{"frozen":true,"value":12.34}')`);await pg.exec((await readFile(new URL('../drizzle/0039_meeting_version_revisions.sql',import.meta.url),'utf8')).replaceAll('--> statement-breakpoint',''));const result=await pg.query<any>('select snapshot,version_kind,invalidated_at from operations_review_meeting_version');assert.deepEqual(result.rows[0],{snapshot:{frozen:true,value:12.34},version_kind:'finalization',invalidated_at:null});await pg.exec(`INSERT INTO operations_review_meeting_version(id,snapshot) VALUES(2,'{"legacyWrite":true}')`);assert.equal((await pg.query<any>('select version_kind from operations_review_meeting_version where id=2')).rows[0].version_kind,'finalization');}finally{await pg.close();}});

test('每版草稿反复保存与定稿同号；草稿不执行事项、安排，不允许旧客户端写入',()=>fixture(async(db,m,v)=>{
 const input=discussionFromDraft(v.snapshot.draft as any);input.issues=[{problem:'',conclusion:'半填写不丢失',status:'pending'}];
 let result=await writeVersion(db,m.id,{action:'save_version_draft',sourceVersionId:v.id,expectedUpdatedAt:m.updatedAt.toISOString(),discussion:input},'fixture',before);
 const draftId=result.versionId;assert.equal(result.versionNumber,1);assert.equal(result.lifecycleStatus,'draft');
 assert.equal((await db.select().from(s.operationsReviewActionItem)).length,0);
 assert.equal((await db.select().from(s.operationsReviewMeeting))[0].currentVersionNumber,0);
 await assert.rejects(()=>writeVersion(db,m.id,{action:'save_version_revision',sourceVersionId:v.id,expectedUpdatedAt:result.updatedAt,discussion:input},'fixture',before),/刷新/);
 await assert.rejects(()=>writeVersion(db,m.id,{action:'save_version_draft',sourceVersionId:v.id,expectedUpdatedAt:result.updatedAt,discussion:input},'fixture',before),/已有版本草稿/);
 input.issues[0].problem='补全问题';input.coreConclusion='第二次保存';
 result=await writeVersion(db,m.id,{action:'save_version_draft',sourceVersionId:v.id,draftVersionId:draftId,expectedUpdatedAt:result.updatedAt,discussion:input},'fixture',before);
 assert.equal(result.versionId,draftId);assert.equal(result.versionNumber,1);assert.equal((await db.select().from(s.operationsReviewMeetingVersion)).length,2);
 await assert.rejects(()=>writeVersion(db,m.id,{action:'finalize_version_draft',stage:'post',sourceVersionId:v.id,draftVersionId:draftId,expectedUpdatedAt:m.updatedAt.toISOString(),discussion:input},'fixture',before),/已更新/);
 result=await writeVersion(db,m.id,{action:'finalize_version_draft',stage:'post',sourceVersionId:v.id,draftVersionId:draftId,expectedUpdatedAt:result.updatedAt,discussion:input},'fixture',before);
 assert.equal(result.versionId,draftId);assert.equal(result.versionNumber,1);assert.equal(result.lifecycleStatus,'finalized');assert.equal((await db.select().from(s.operationsReviewActionItem)).length,1);
 const rows=await db.select().from(s.operationsReviewMeetingVersion);assert.deepEqual(rows.find((r:any)=>r.id===v.id).snapshot,v.snapshot);
 const current=rows.find((r:any)=>r.id===draftId),next=discussionFromDraft(current.snapshot.draft);next.coreConclusion='过期仅改文字';
 const saved=await writeVersion(db,m.id,{action:'save_version_draft',sourceVersionId:draftId,expectedUpdatedAt:result.updatedAt,discussion:next},'fixture',after);
 await writeVersion(db,m.id,{action:'finalize_version_draft',stage:'post',sourceVersionId:draftId,draftVersionId:saved.versionId,expectedUpdatedAt:saved.updatedAt,discussion:next},'fixture',after);
 assert.equal((await db.select().from(s.operationsReviewActionProgress)).length,1);
}));

test('草稿中伪造的安排不执行；回溯撤销凭独立日志且不依赖可编辑快照',()=>{
 const decision={id:'m:c',meetingId:'m',campaignId:'c',versionNumber:1,effectiveOn:'2026-10-26',targetStatus:'testing'};
 const old={meetingId:'m',createdAt:'2026-10-25T10:00:00Z',snapshot:{finalizationStage:'post',decisionEffectiveOn:decision.effectiveOn,generated:{meetingDecisions:[decision]}}};
 const draft={...old,lifecycleStatus:'draft',createdAt:'2026-10-25T12:00:00Z',snapshot:{...old.snapshot,generated:{meetingDecisions:[{...decision,targetStatus:'scaling'}]}}};
 assert.equal(resolveMeetingDecisions([old,draft],[])[0].targetStatus,'testing');
 assert.deepEqual(resolveMeetingDecisions([old,{...draft,businessEffects:[{type:'meeting_decisions_reset',effectiveOn:decision.effectiveOn}]}],[]),[]);
});

test('无实际修改不建立新修订；会前转会后和已有草稿同号定稿除外',()=>fixture(async(db,m,v)=>{
 const input=discussionFromDraft(v.snapshot.draft as any),base={sourceVersionId:v.id,expectedUpdatedAt:m.updatedAt.toISOString(),discussion:input};
 await assert.rejects(()=>writeVersion(db,m.id,{...base,action:'save_version_draft'},'fixture',before),/尚无实际修改/);
 await assert.rejects(()=>writeVersion(db,m.id,{...base,action:'finalize_version_draft',stage:'pre'},'fixture',before),/尚无实际修改/);
 await assert.rejects(()=>writeVersion(db,m.id,{...base,action:'save_version_draft',discussion:{...input,coreConclusion:' '+input.coreConclusion+' ',nonPromotionNotes:{}}},'fixture',before),/尚无实际修改/);
 assert.equal((await db.select().from(s.operationsReviewMeetingVersion)).length,1);
 const post=await writeVersion(db,m.id,{...base,action:'finalize_version_draft',stage:'post'},'fixture',before);
 const [p]=await db.select().from(s.operationsReviewMeetingVersion).where(eq(s.operationsReviewMeetingVersion.id,post.versionId));
 const next=discussionFromDraft(p.snapshot.draft as any),postBase={sourceVersionId:p.id,expectedUpdatedAt:post.updatedAt,discussion:next};
 await assert.rejects(()=>writeVersion(db,m.id,{...postBase,action:'finalize_version_draft',stage:'post'},'fixture',before),/尚无实际修改/);
 next.coreConclusion='真正修订';
 const saved=await writeVersion(db,m.id,{...postBase,discussion:next,action:'save_version_draft'},'fixture',before);
 const finalized=await writeVersion(db,m.id,{...postBase,discussion:next,expectedUpdatedAt:saved.updatedAt,draftVersionId:saved.versionId,action:'finalize_version_draft',stage:'post'},'fixture',before);
 assert.equal(finalized.versionNumber,saved.versionNumber);assert.equal(finalized.versionId,saved.versionId);
}));
