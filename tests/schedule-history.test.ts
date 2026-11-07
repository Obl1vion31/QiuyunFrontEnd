import assert from 'node:assert/strict';
import {test} from 'node:test';
import {groupScheduleHistory,type SchedulePlanContext,type ScheduleExecutionEvent} from '../src/db/schedule-history';
import {legacyScheduleBaseline,buildScheduleComparison} from '../src/db/schedule-baseline';
const context:SchedulePlanContext={planId:'plan',itemId:'slot',month:'2026-11',week:1,kind:'carry',at:'2026-11-06T08:00:00Z'};
const event=(from:string,to:string,extra:Partial<ScheduleExecutionEvent>={}):ScheduleExecutionEvent=>({at:'2026-11-06T15:05:32.329Z',actor:'fixture',reason:'需求未到',before:{name:'案例',plannedAt:from},after:{name:'案例',plannedAt:to},...extra});
test('遗留接入与跨授权Week合为一条，具体时间只在变更组',()=>{
 const e=event('2026-10-31T07:00:00Z','2026-11-25T07:00:00Z'),copy=structuredClone(e),groups=groupScheduleHistory([e],[{revision:2,plannedPublishAt:String(e.before!.plannedAt),newPlannedPublishAt:String(e.after!.plannedAt),endedAt:e.at,reason:e.reason,changedByLabel:e.actor}],[context]);
 const execution=groups.find(g=>g.key==='execution')!;assert.equal(execution.items.filter(i=>i.reason==='需求未到').length,1);assert.match(execution.items[0].label,/上月遗留接入 11 月.*原授权 W1 → 安排 W4/);assert.doesNotMatch(JSON.stringify(execution),/07:00|2026-10-31/);
 const dates=groups.find(g=>g.key==='schedule')!;assert.equal(dates.items.length,1);assert.equal(dates.items[0].revision,2);assert.equal(groups.some(g=>g.key==='content'),false);assert.deepEqual(e,copy);
});
test('同Week微调只记日期，混合内容变更独立，空组省略',()=>{
 const e=event('2026-11-25T07:00:00Z','2026-11-25T10:00:00Z',{after:{name:'新案例',plannedAt:'2026-11-25T10:00:00Z',isPromoted:true}}),g=groupScheduleHistory([e],[],[context]);
 assert.equal(g.find(g=>g.key==='execution')!.items.length,1);assert.equal(g.find(g=>g.key==='schedule')!.items.length,1);assert.match(g.find(g=>g.key==='content')!.items[0].details!.join(' '),/案例 → 新案例/);assert.deepEqual(groupScheduleHistory([],[]),[]);
});
test('旧日期不冒充授权Week；旧无依据显示未知，新事件冻结计划上下文',()=>{
 const e=event('2026-10-31T07:00:00Z','2026-11-25T07:00:00Z');assert.match(groupScheduleHistory([e],[])[0].items[0].label,/原授权 Week 未知/);
 const later={...context,week:5};e.planContext={before:[context],after:[context]};assert.match(groupScheduleHistory([e],[],[later])[0].items[0].label,/原授权 W1 → 安排 W4/);
});
test('建立与取消沿用真实身份，内容初值不制造差值',()=>{
 const e=event('','2026-11-07T07:00:00Z',{before:null,after:{name:'新帖',operationType:'promotion_only',plannedAt:'2026-11-07T07:00:00Z'}}),g=groupScheduleHistory([e],[]);assert.equal(g.find(g=>g.key==='schedule'),undefined);assert.match(g[0].items[0].label,/建立排期/);assert.doesNotMatch(g[1].items[0].details!.join(' '),/→/);
});
test('旧封存重复名额由冻结具体ID与候选恢复22篇，证据不足未知',()=>{
 const items=Array.from({length:22},(_,i)=>({id:i<2?'duplicate':'slot'+i,groupId:'g',scheduleId:'post'+i,week:i===1?4:1})),candidates=items.map((item,i)=>({id:item.scheduleId,name:'案例'+i,plannedAt:`2026-11-${i===1?'25':'03'}T07:00:00Z`,versionNumber:i===0?1:0})),legacy={items:items.map(item=>({...item,schedule:{id:'post1',name:'错误串联',plannedAt:'2026-11-25T07:00:00Z'}}))};
 const b=legacyScheduleBaseline('2026-11','2026-11-06T08:00:00Z',legacy,{content:{items}},candidates)!;assert.equal(b.items.length,22);assert.equal(new Set(b.items.map(i=>i.id)).size,22);assert.equal(b.items[0].name,'案例0');assert.equal(b.items[0].versionNumber,1);
 assert.equal(buildScheduleComparison([b],[],'2026-11-01','2026-11-30').original,22);assert.equal(legacyScheduleBaseline('2026-11',b.sealedAt,legacy),null);assert.equal(legacyScheduleBaseline('2026-11',b.sealedAt,legacy,{content:{items}},candidates.slice(1)),null);
});
