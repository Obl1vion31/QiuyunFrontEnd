import assert from 'node:assert/strict';
import {test} from 'node:test';
import {promotionAuditView,promotionSnapshotLabel} from '../src/db/promotion-audit-view';
import type {operationsPromotionTimelineAudit} from '../src/db/schema';
type Audit=typeof operationsPromotionTimelineAudit.$inferSelect;
const audit=(values:Partial<Audit>={}):Audit=>({id:'audit',scheduleId:'s',requestKey:'r',businessDate:'2026-10-17',action:'wait',reason:'首次推广安排',before:{schedule:{promotionStatus:'awaiting_promotion'},campaigns:[]},after:{plan:{waitingThrough:'2026-10-17'},campaigns:[]},changedById:'fictional',changedByLabel:'虚构运营',createdAt:new Date('2026-10-18T01:00:00Z'),...values});
test('首次安排明确前后，业务原因不重复标题，原审计不变',()=>{
 const original=audit(),copy=JSON.stringify(original),view=promotionAuditView(original);
 assert.equal(view.category,'initial');assert.equal(view.visible,true);assert.equal(view.title,'首次推广安排');assert.equal(view.beforeLabel,'尚未开始');assert.equal(view.afterLabel,'待定至 2026-10-17');assert.equal(view.reason,'');assert.equal(JSON.stringify(original),copy);
});
test('明确的开发撤销和维护元数据不进入业务历史，不误伤测试业务原因',()=>{
 for(const values of [{action:'maintenance_reset',before:null as any,after:{metrics:'原始诊断快照'}},{reason:'按用户要求撤销此前推广操作，恢复初始状态供测试',action:'start_testing'},{action:'maintenance_reset'},{after:{auditCategory:'technical',plan:{waitingThrough:'2026-10-17'}}}]){
  const view=promotionAuditView(audit(values));assert.equal(view.category,'technical');assert.equal(view.visible,false);
 }
 const business=promotionAuditView(audit({reason:'用户要求修改测试安排，先待定至当天'}));assert.equal(business.visible,true);assert.equal(business.category,'initial');
});
test('业务阶段更正和复盘下一步给出对应日期的具体前后状态',()=>{
 const values={schedule:{promotionStatus:'scaling'},campaigns:[{id:'c',startedOn:'2026-10-16',initialStage:'scaling'}]};
 const change=promotionAuditView(audit({action:'start_testing',before:values,after:{...values,campaigns:[{...values.campaigns[0],initialStage:'testing'}]}}));
 assert.equal(change.category,'business');assert.match(change.beforeLabel,/2026-10-16 开始放量/);assert.match(change.afterLabel,/2026-10-16 开始测试/);
 const fact={id:'m',metricDate:'2026-10-17',reviewDecision:'test_continue'};
 const review=promotionAuditView(audit({action:'metric_correction',before:{metrics:[fact]},after:{metrics:[{...fact,reviewDecision:'start_scaling'}]}}));
 assert.equal(review.beforeLabel,'2026-10-18 的安排：测试继续');assert.equal(review.afterLabel,'2026-10-18 的安排：测试接放量');assert.equal(review.visible,true);
});
test('待定延长和恢复计划使用真实截止及生效日期',()=>{
 const view=promotionAuditView(audit({action:'next',before:{ranges:[{startedOn:'2026-10-16',endedOn:'2026-10-17',stageType:'testing'}]},after:{ranges:[{startedOn:'2026-10-16',endedOn:'2026-10-17',stageType:'testing',nextDecision:'start_scaling',nextEffectiveOn:'2026-10-18'}]}}));
 assert.equal(view.beforeLabel,'测试待定至 2026-10-17');assert.equal(view.afterLabel,'测试待定至 2026-10-17；2026-10-18 测试接放量');
});
test('历史初始化只展示业务事实，未知类别先保留在底层等待确认',()=>{
 const initial=promotionAuditView(audit({action:'legacy_defer',reason:'迁移旧未推广确认',before:{promotionDeferredThrough:'2026-10-17'},after:{waitingThrough:'2026-10-17',legacySource:true}}));assert.equal(initial.category,'initial');assert.equal(initial.visible,true);assert.equal(initial.reason,'');assert.equal(initial.beforeLabel,'待定至 2026-10-17');assert.equal(initial.afterLabel,'待定至 2026-10-17');
 const unknown=promotionAuditView(audit({action:'unknown_future_operation'}));assert.equal(unknown.category,'unclassified');assert.equal(unknown.visible,false);
});
test('发布时间与推广身份更正不被误认作技术重置',()=>{
 const view=promotionAuditView(audit({action:'publication_reset',before:{schedule:{actualPublishAt:'2026-10-17T10:00:00Z',promotionStatus:'awaiting_promotion'}},after:{schedule:{actualPublishAt:'2026-10-17T11:00:00Z',promotionStatus:'awaiting_promotion'}}}));
 assert.equal(view.category,'business');assert.match(view.beforeLabel,/2026-10-17 18:00/);assert.match(view.afterLabel,/2026-10-17 19:00/);
 assert.equal(promotionSnapshotLabel({schedule:{isPromoted:false,promotionStatus:'none'}},'2026-10-17','usage_change'),'非推广');
});

test('例会安排理由更正作为真实业务事件展示具体前后状态',()=>{
 const decision={effectiveOn:'2026-10-24',targetStatus:'test_paused',versionNumber:1};
 const view=promotionAuditView(audit({action:'meeting_decision_correction',reason:'会后补充核对，继续测试',before:{meetingDecision:decision},after:{meetingDecision:{...decision,targetStatus:'testing'}}}));
 assert.equal(view.visible,true);assert.equal(view.category,'business');assert.equal(view.title,'例会安排更正');assert.match(view.beforeLabel,/2026-10-24.*测试暂停/);assert.match(view.afterLabel,/2026-10-24.*测试中/);assert.equal(view.reason,'会后补充核对，继续测试');
});
