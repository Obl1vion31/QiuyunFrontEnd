import assert from 'node:assert/strict';
import {test} from 'node:test';
import {weeklyReportMetrics} from '../src/db/meeting-report-metrics';
import type {PromotionFact} from '../src/db/promotion-overview';

const campaign=(id:string,scheduleId=id)=>({id,scheduleId,startedOn:'2026-10-01',endedOn:null,initialStage:'scaling',currentStage:'scaling',currentStatus:'scaling'});
const fact=(campaignId:string,metricDate:string,spend:number,extra:Partial<PromotionFact>={}):PromotionFact=>({id:crypto.randomUUID(),campaignId,metricDate,spend,dailyStatus:'active',stageTypeSnapshot:'scaling',actualOpenCount:2,actualLeadCount:1,platformOpenCount:3,platformLeadCount:2,reviewDecision:'scaling_continue',note:null,...extra});
const context=(campaigns:ReturnType<typeof campaign>[],metrics:PromotionFact[])=>({campaigns,metrics,meetingDecisions:[],stateChanges:[],pauses:[],targets:[],holds:[],waitRanges:[]}) as unknown as Parameters<typeof weeklyReportMetrics>[0];

test('周度总览读取全部事实，按排期版本去重并加权计算成本，不受阶段卡候选影响',()=>{
 const facts=[fact('a','2026-10-25',100),fact('b','2026-10-26',20),fact('c','2026-10-25',0),fact('d','2026-10-25',0,{dailyStatus:'paused'}),fact('e','2026-10-25',15,{dailyStatus:'paused',recordKind:'test_residual'}),fact('f','2026-10-25',0,{recordKind:'test_residual'}),fact('a','2026-10-18',60)];
 const result=weeklyReportMetrics(context([campaign('a','same-version'),campaign('b','same-version'),campaign('c'),campaign('d'),campaign('e'),campaign('f')],facts),facts,'2026-10-25','2026-10-31',new Date('2026-11-01T00:00:00+08:00'));
 assert.equal(result.current.posts,3);
 assert.equal(result.current.spend,135);
 assert.equal(result.current.actualOpenCost,11.25);
 assert.equal(result.previous.spend,60);
 assert.equal(result.previous.from,'2026-10-18');assert.equal(result.previous.through,'2026-10-24');
 assert.deepEqual(result.weeks.map(w=>[w.from,w.through]),[['2026-10-04','2026-10-10'],['2026-10-11','2026-10-17'],['2026-10-18','2026-10-24'],['2026-10-25','2026-10-31']]);
});

test('等长比较不假定自然周；真实零、空数据和缺填分别保留',()=>{
 const facts=[fact('a','2026-10-25',0,{actualOpenCount:0,actualLeadCount:0})];
 const result=weeklyReportMetrics(context([campaign('a')],facts),facts,'2026-10-25','2026-11-02',new Date('2026-11-02T10:00:00+08:00'));
 assert.equal(result.previous.from,'2026-10-16');assert.equal(result.previous.through,'2026-10-24');
 assert.equal(result.current.posts,1);assert.equal(result.current.spend,0);assert.equal(result.current.actualOpenCost,null);
 assert.equal(result.previous.spend,null);assert.equal(result.previous.posts,0);
 assert.equal(result.current.missing.length,7);assert(!result.current.missing.some(m=>m.date==='2026-11-02'));
 assert.equal(result.current.from,'2026-10-25');assert.equal(result.current.through,'2026-11-02');
});
