import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promotionReviewDays,promotionReviewQueue,type SavedReviewMetric} from '../src/db/promotion-review-days';
import type {PromotionTimelineRow} from '../src/db/promotion-pending';
import type {PromotionContext} from '../src/db/promotion-state.mjs';
const campaign={id:'c',scheduleId:'s',startedOn:'2026-10-19',initialStage:'testing',currentStage:'testing',currentStatus:'testing',endedOn:null,createdAt:new Date('2026-10-19'),updatedAt:new Date('2026-10-19')};
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
test('已完成日期不再计待填写，20号安排来自19号真实决定',()=>{
 const facts=[{campaignId:'c',metricDate:'2026-10-19',stageTypeSnapshot:'testing',dailyStatus:'active',reviewDecision:'start_scaling'}];
 const days=promotionReviewDays([row],{...context,metrics:facts},at('2026-10-20T18:00:00'))[0].days;
 assert.deepEqual(days.map(d=>d.date),['2026-10-20']);assert.equal(days[0].status,'放量');
 const next=promotionReviewDays([row],{...context,metrics:facts},at('2026-10-21T00:00:00'))[0].days;
 assert.equal(next[0].date,'2026-10-20');assert.equal(next[0].editable,true);assert.equal(next[0].stage,'scaling');
});

const savedMetric=(date:string,updated='2026-10-20T02:00Z'):SavedReviewMetric=>({id:'m'+date,campaignId:'c',metricDate:date,updatedAt:new Date(updated),dailyStatus:'active',actualStatusSnapshot:'testing',recordKind:'regular',stageTypeSnapshot:'testing',spend:'0.00',platformOpenCount:0,actualOpenCount:0,platformLeadCount:0,actualLeadCount:0,reviewDecision:'test_continue',note:null});
test('昨天已保存记录仍在主区，真实零保留且待填数为0',()=>{
 const fact=savedMetric('2026-10-19'),days=promotionReviewDays([row],{...context,metrics:[fact]},at('2026-10-20T12:00:00'),[fact]),queue=promotionReviewQueue(days);
 assert.equal(queue.ready.length,0);assert.equal(queue.main.length,1);assert.equal(queue.saved.length,1);assert.equal(queue.main[0].day.kind,'saved');assert.equal(queue.main[0].day.savedMetric?.spend,'0.00');assert.equal(queue.upcoming[0].day.date,'2026-10-20');
});
test('主区仅保留昨日已存，今天补录或更正旧日也不回流，次日切换到新的昨日',()=>{
 const older={...row.campaign!,startedOn:'2026-10-18'},facts=[savedMetric('2026-10-18'),savedMetric('2026-10-19')],scoped={...context,campaigns:[older],metrics:facts};
 const today=promotionReviewQueue(promotionReviewDays([{...row,campaign:older}],scoped,at('2026-10-20T12:00:00'),facts));assert.deepEqual(today.saved.map(r=>r.day.date),['2026-10-19']);assert.equal(today.main.some(r=>r.day.date==='2026-10-18'),false);
 const tomorrow=promotionReviewQueue(promotionReviewDays([{...row,campaign:older}],scoped,at('2026-10-21T00:00:01'),facts));assert.equal(tomorrow.saved.length,0);assert.equal(tomorrow.ready[0].day.date,'2026-10-20');
});
test('误选终态后仍保留昨日已保存行；残留指标不混入正常复盘工作区',()=>{
 const fact={...savedMetric('2026-10-19'),reviewDecision:'test_discarded'},ended={...row.campaign!,currentStatus:'test_discarded',endedOn:'2026-10-19'},scoped={...context,campaigns:[ended],metrics:[fact]};
 const queue=promotionReviewQueue(promotionReviewDays([{...row,campaign:ended}],scoped,at('2026-10-20T12:00:00'),[fact]));assert.equal(queue.saved.length,1);assert.equal(queue.upcoming.length,0);assert.equal(queue.ready.length,0);
 const residual={...fact,recordKind:'test_residual'};assert.equal(promotionReviewQueue(promotionReviewDays([{...row,campaign:ended}],scoped,at('2026-10-20T12:00:00'),[residual])).saved.length,0);
});
test('保存行区分恢复原轮和重新测试，不把新轮边界回显为普通继续测试',()=>{
 for(const decision of ['test_continue','restart_testing']){
  const fact={...savedMetric('2026-10-19'),actualStatusSnapshot:'test_paused',reviewDecision:decision},scoped={...context,metrics:[fact]};
  const queue=promotionReviewQueue(promotionReviewDays([row],scoped,at('2026-10-20T12:00:00'),[fact]));
  assert.equal(queue.saved[0].day.meetingNext,decision);
 }
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

test('首次待定灰行每日只推导昨日，有限截止锚定末日且不计指标队列',()=>{
 const initial={...row,campaign:null,canArrangeInitial:true,pending:true,plan:{waitingThrough:null,plannedOn:null},waitingThrough:null} as unknown as PromotionTimelineRow;
 for(const day of ['2026-10-21','2026-10-22']){
  const posts=promotionReviewDays([initial],{...context,campaigns:[]},at(day+'T08:00:00')),queue=promotionReviewQueue(posts);
  assert.equal(queue.main.length,1);assert.equal(queue.ready.length,0);assert.equal(queue.arrangements.length,0);assert.equal(queue.main[0].day.status,'待定');
  assert.equal(queue.main[0].day.date,day==='2026-10-21'?'2026-10-20':'2026-10-21');
 }
 const finite={...initial,waitingThrough:'2026-10-23'};
 assert.equal(promotionReviewQueue(promotionReviewDays([finite],{...context,campaigns:[]},at('2026-10-22T08:00:00'))).main[0].day.date,'2026-10-21');
 assert.equal(promotionReviewQueue(promotionReviewDays([finite],{...context,campaigns:[]},at('2026-10-26T08:00:00'))).main[0].day.date,'2026-10-23');
 const fresh={...initial,plan:null};assert.equal(promotionReviewQueue(promotionReviewDays([fresh],{...context,campaigns:[]},at('2026-10-22T08:00:00'))).main[0].day.date,'2026-10-19');
});
