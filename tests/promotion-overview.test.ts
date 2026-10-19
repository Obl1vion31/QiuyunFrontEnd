import assert from 'node:assert/strict';
import {test} from 'node:test';
import {promotionTotals,promotionOverview,type PromotionFact} from '../src/db/promotion-overview';
import type {PromotionTimelineRow} from '../src/db/promotion-pending';
const fact=(v:Partial<PromotionFact>={}):PromotionFact=>({id:'m',campaignId:'c',metricDate:'2026-10-17',dailyStatus:'active',stageTypeSnapshot:'testing',spend:'100',platformOpenCount:20,actualOpenCount:10,platformLeadCount:5,actualLeadCount:2,reviewDecision:'test_continue',note:null,...v});
const context={stateChanges:[],pauses:[],targets:[],holds:[],waitRanges:[],campaigns:[],metrics:[]};
test('累计成本用累计消耗除实际人数，空白、真实零和旧待定记录有不同含义',()=>{
 const totals=promotionTotals([fact(),fact({id:'2',metricDate:'2026-10-18',spend:'20',actualOpenCount:2,actualLeadCount:0})]);
 assert.equal(totals.spend,120);assert.equal(totals.actualOpenCost,10);assert.equal(totals.actualLeadCost,60);assert.equal(totals.recordedDays,2);
 assert.equal(promotionTotals([]).spend,null);assert.equal(promotionTotals([fact({dailyStatus:'waiting_action'})]).spend,null);
 const zero=promotionTotals([fact({spend:'0',actualOpenCount:0,actualLeadCount:0})]);assert.equal(zero.spend,0);assert.equal(zero.actualOpenCost,null);
});
test('同一排期多个活动合成一条，阶段保留原日期，暂停和已结束均能查看之前数据',()=>{
 const posts=[{scheduleId:'s',contentName:'测试',publishedOn:'2026-10-15',isPromoted:true,promotionStatus:'scaling'}] as PromotionTimelineRow[];
 const campaigns=[{id:'c',scheduleId:'s',startedOn:'2026-10-15',endedOn:'2026-10-17',initialStage:'testing',currentStage:'testing',currentStatus:'ended'},{id:'d',scheduleId:'s',startedOn:'2026-10-18',endedOn:null,initialStage:'scaling',currentStage:'scaling',currentStatus:'scaling'}];
 const stages=[{campaignId:'c',stageType:'testing',startedOn:'2026-10-15',endedOn:'2026-10-17'},{campaignId:'d',stageType:'scaling',startedOn:'2026-10-18',endedOn:null}];
 const rows=promotionOverview({posts,campaigns,stages,metrics:[fact(),fact({id:'n',campaignId:'d',metricDate:'2026-10-18',stageTypeSnapshot:'scaling'})],context,today:'2026-10-19',now:new Date('2026-10-19T20:00:00+08:00')});
 assert.equal(rows.length,1);assert.equal(rows[0].stages.length,2);assert.equal(rows[0].totals.spend,200);assert.deepEqual(rows[0].stages[0].missingDates,['2026-10-15','2026-10-16']);assert.equal(rows[0].stages[1].totals.from,'2026-10-18');
 campaigns[1].currentStatus='ended';campaigns[1].endedOn='2026-10-18' as any;
 const ended=promotionOverview({posts,campaigns,stages,metrics:[fact()],context,today:'2026-10-19'})[0];assert.equal(ended.closed,true);assert.equal(ended.stages[0].totals.spend,100);assert.equal(ended.stages[1].totals.spend,null);
});
test('没有活动明细的历史结束帖不变为首次安排，也不补零值',()=>{
 const [row]=promotionOverview({posts:[{scheduleId:'legacy',contentName:'历史',publishedOn:'2026-04-01',isPromoted:true,promotionStatus:'ended'}] as PromotionTimelineRow[],campaigns:[],stages:[],metrics:[],context,today:'2026-10-19'});
 assert.equal(row.closed,true);assert.equal(row.statusLabel,'推广结束');assert.equal(row.totals.spend,null);assert.equal(row.stages.length,0);
});
test('按真实时刻叠加团队暂停，等待窗口不形成漏填指标',()=>{
 const campaign={id:'c',scheduleId:'s',startedOn:'2026-10-15',endedOn:null,initialStage:'testing',currentStage:'testing',currentStatus:'testing'};
 const posts=[{scheduleId:'s',contentName:'暂停',publishedOn:'2026-10-15',isPromoted:true,promotionStatus:'testing'}] as PromotionTimelineRow[];
 const pausedContext={...context,pauses:[{id:'p',startsAt:'2026-10-19T19:00:00+08:00',endsAt:'2026-10-20T00:00:00+08:00'}],targets:[{pauseId:'p',campaignId:'c'}],holds:[{campaignId:'c',stageType:'testing',resumeStage:'testing',startedOn:'2026-10-15',endedOn:'2026-10-16'}]};
 const input={posts,campaigns:[campaign],stages:[{campaignId:'c',stageType:'testing',startedOn:'2026-10-15',endedOn:null}],metrics:[fact()],context:pausedContext,today:'2026-10-19'};
 const before=promotionOverview({...input,now:new Date('2026-10-19T18:59:00+08:00')})[0],after=promotionOverview({...input,now:new Date('2026-10-19T19:01:00+08:00')})[0];
 assert.equal(before.status,'testing');assert.equal(after.status,'promotion_paused');assert.equal(after.stages[0].totals.spend,100);assert.deepEqual(after.stages[0].missingDates,['2026-10-18']);
});
