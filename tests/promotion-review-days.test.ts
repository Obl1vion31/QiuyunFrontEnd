import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promotionReviewDays} from '../src/db/promotion-review-days';
import type {PromotionTimelineRow} from '../src/db/promotion-pending';
import type {PromotionContext} from '../src/db/promotion-state.mjs';
const campaign={id:'c',scheduleId:'s',startedOn:'2026-10-19',initialStage:'testing',currentStage:'testing',currentStatus:'testing',endedOn:null};
const row={scheduleId:'s',contentName:'虚构一对一',publishedOn:'2026-10-19',isPromoted:true,promotionStatus:'testing',campaign,plan:null,waitingThrough:null,date:'2026-10-19',pending:false,ranges:[],canArrangeInitial:false} as unknown as PromotionTimelineRow;
const context={campaigns:[campaign],metrics:[],stateChanges:[],pauses:[],targets:[],holds:[],waitRanges:[]} as PromotionContext;
const at=(time:string)=>new Date(time+'+08:00');
test('20号补改19号开始：19号立即可填，20号已显示但21号零点才开放',()=>{
 const days=promotionReviewDays([row],context,at('2026-10-20T08:00:00'))[0].days;
 assert.deepEqual(days.map(d=>[d.date,d.kind,d.editable]),[['2026-10-19','metric',true],['2026-10-20','preview',false]]);
 assert.equal(days[1].opensAt,'2026-10-21T00:00:00+08:00');assert.equal(days[1].status,'待安排');
});
test('零点开放以数据日期为准，跨午夜仍不能越过前日；当天只能预览',()=>{
 const before=promotionReviewDays([row],context,at('2026-10-20T23:59:59'))[0].days;
 assert.equal(before.find(d=>d.date==='2026-10-20')!.kind,'preview');
 const after=promotionReviewDays([row],context,at('2026-10-21T00:00:00'))[0].days;
 assert.equal(after.find(d=>d.date==='2026-10-20')!.kind,'metric');assert.equal(after.find(d=>d.date==='2026-10-20')!.blockedBy,'2026-10-19');
 assert.equal(after.at(-1)!.date,'2026-10-21');
});
test('已完成日期退出待办，20号安排来自19号真实决定',()=>{
 const facts=[{campaignId:'c',metricDate:'2026-10-19',stageTypeSnapshot:'testing',dailyStatus:'active',reviewDecision:'start_scaling'}];
 const days=promotionReviewDays([row],{...context,metrics:facts},at('2026-10-20T18:00:00'))[0].days;
 assert.deepEqual(days.map(d=>d.date),['2026-10-20']);assert.equal(days[0].status,'放量');
 const next=promotionReviewDays([row],{...context,metrics:facts},at('2026-10-21T00:00:00'))[0].days;
 assert.equal(next[0].date,'2026-10-20');assert.equal(next[0].editable,true);assert.equal(next[0].stage,'scaling');
});
test('当天刚开始也有预览，已结束不追加结束后的日期',()=>{
 assert.equal(promotionReviewDays([row],context,at('2026-10-19T15:00:00'))[0].days[0].kind,'preview');
 const ended={...campaign,currentStatus:'ended',currentStage:null,endedOn:'2026-10-19'};
 const facts=[{campaignId:'c',metricDate:'2026-10-19',stageTypeSnapshot:'testing',dailyStatus:'active',reviewDecision:'ended'}];
 assert.equal(promotionReviewDays([{...row,campaign:ended} as PromotionTimelineRow],{...context,campaigns:[ended],metrics:facts},at('2026-10-20T08:00:00')).length,0);
});
test('持续待定只显示当日灰色状态，不制造欠填；末日下一步到期后保留',()=>{
 const range={id:'r',campaignId:'c',startedOn:'2026-10-19',endedOn:'2026-10-21',stageType:'testing',nextDecision:null,nextEffectiveOn:null};
 const held={...row,ranges:[range]} as unknown as PromotionTimelineRow;
 const days=promotionReviewDays([held],{...context,waitRanges:[range]} as PromotionContext,at('2026-10-20T15:00:00'))[0].days;
 assert.deepEqual(days.map(d=>[d.date,d.kind,d.status]),[['2026-10-20','preview','待定']]);assert.equal(days[0].waitingThrough,'2026-10-21');
 const overdue=promotionReviewDays([held],{...context,waitRanges:[range]} as PromotionContext,at('2026-10-22T08:00:00'))[0].days;
 assert.equal(overdue[0].kind,'arrangement');assert.equal(overdue[0].date,'2026-10-21');assert.equal(overdue.at(-1)!.status,'待安排');
});
