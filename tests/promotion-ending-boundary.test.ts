import {test} from 'node:test';
import assert from 'node:assert/strict';
import {requiredPromotionStage} from '../src/db/promotion-review-required';
import {promotionReviewDays,promotionReviewQueue,type SavedReviewMetric} from '../src/db/promotion-review-days';
import {promotionStateOn,type PromotionContext} from '../src/db/promotion-state.mjs';
import type {PromotionTimelineRow} from '../src/db/promotion-pending';
import {weeklyReportMetrics} from '../src/db/meeting-report-metrics';

const endings=[['test_discarded','testing'],['formal_discarded','scaling'],['ended','scaling']] as const;
const now=new Date('2026-11-13T12:00:00+08:00');
function sample(status:string,stage:string,sameDay:boolean,repeat:boolean){
 const endedOn=sameDay?'2026-11-11':'2026-11-10';
 const campaign={id:'c',scheduleId:'s',startedOn:'2026-11-10',dailyReviewEnabledOn:'2026-11-10',initialStage:stage,currentStage:null,currentStatus:status,endedOn};
 const prior:SavedReviewMetric={id:'prior',campaignId:'c',metricDate:'2026-11-10',dailyStatus:'active',actualStatusSnapshot:stage,stageTypeSnapshot:stage,reviewDecision:sameDay?(stage==='testing'?'test_continue':'scaling_continue'):status,recordKind:'regular',spend:'80.00',platformOpenCount:3,actualOpenCount:2,platformLeadCount:1,actualLeadCount:1,updatedAt:now,note:null};
 const stateChanges=[...(sameDay?[{campaignId:'c',businessDate:'2026-11-11',stageType:stage,actualStatus:status}]:[]),...(repeat?[{campaignId:'c',businessDate:'2026-11-11',stageType:stage,actualStatus:status},{campaignId:'c',businessDate:'2026-11-12',stageType:stage,actualStatus:status}]:[])];
 const context:PromotionContext={campaigns:[campaign],metrics:[prior],stateChanges,pauses:[],targets:[],holds:[],waitRanges:[]};
 const row={scheduleId:'s',contentName:status,publishedOn:'2026-11-10',isPromoted:true,promotionStatus:status,campaign,plan:null,waitingThrough:null,date:'2026-11-10',pending:false,ranges:[],canArrangeInitial:false} as unknown as PromotionTimelineRow;
 return {campaign,prior,context,row};
}
for(const[status,stage]of endings){
 test(status+'：尚在暂停／待定期间结束，没有投放区间也保留收尾',()=>{
  const {campaign,context,row,prior}=sample(status,stage,true,false);
  const paused=stage==='testing'?'test_pending':'scaling_paused';
  context.metrics=[{...prior,dailyStatus:'waiting_action',actualStatusSnapshot:paused,reviewDecision:'wait_continue'}];
  context.stateChanges!.unshift({campaignId:'c',businessDate:'2026-11-10',stageType:stage,actualStatus:paused});
  assert.equal(requiredPromotionStage(campaign,context,'2026-11-11'),stage);
  assert.deepEqual(promotionReviewQueue(promotionReviewDays([row],context,now)).ready.map(r=>r.day.date),['2026-11-11']);
 });
 test(status+'：当天结束保留收尾，重复结束状态不延后日期',()=>{
  for(const repeat of [false,true]){
   const {campaign,context,row}=sample(status,stage,true,repeat);
   assert.equal(requiredPromotionStage(campaign,context,'2026-11-11'),stage);
   assert.equal(requiredPromotionStage(campaign,context,'2026-11-12'),null);
   assert.equal(promotionStateOn(campaign,context,'2026-11-12')!.endedOn,'2026-11-11');
   const queue=promotionReviewQueue(promotionReviewDays([row],context,now));
   assert.deepEqual(queue.ready.map(r=>r.day.date),['2026-11-11']);assert.equal(queue.blocked.length,0);
  }
 });
 test(status+'：前日已安排停止，重复记录不制造零值待办',()=>{
  for(const repeat of [false,true]){
   const {campaign,context,row,prior}=sample(status,stage,false,repeat);
   assert.equal(requiredPromotionStage(campaign,context,'2026-11-10'),stage);
   assert.equal(requiredPromotionStage(campaign,context,'2026-11-11'),null);
   assert.equal(requiredPromotionStage(campaign,context,'2026-11-12'),null);
   assert.equal(promotionReviewQueue(promotionReviewDays([row],context,now)).main.length,0);
   assert.equal(promotionStateOn(campaign,context,'2026-11-12')!.endedOn,'2026-11-10');
   const report=weeklyReportMetrics(context as Parameters<typeof weeklyReportMetrics>[0],[prior],'2026-11-10','2026-11-12',now);
   assert.deepEqual(report.current.missing,[]);assert.equal(report.current.spend,80);
  }
 });
 test(status+'：结束后已有真实指标保留为已保存，不变成待办',()=>{
  const {campaign,context,row,prior}=sample(status,stage,false,true);
  const fact={...prior,id:'legacy',metricDate:'2026-11-11',dailyStatus:'waiting_action',actualStatusSnapshot:status,reviewDecision:status,spend:'12.50'};
  context.metrics=[prior,fact];const frozen=JSON.stringify(context);
  const queue=promotionReviewQueue(promotionReviewDays([row],context,new Date('2026-11-12T12:00:00+08:00'),[fact]));
  assert.equal(queue.ready.length,0);assert.equal(queue.saved.length,1);assert.equal(queue.saved[0].day.savedMetric!.spend,'12.50');
  assert.equal(promotionStateOn(campaign,context,'2026-11-12')!.endedOn,'2026-11-10');assert.equal(JSON.stringify(context),frozen);
 });
}
