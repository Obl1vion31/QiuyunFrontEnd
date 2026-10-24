import assert from 'node:assert/strict';
import {test} from 'node:test';
import {meetingNextDecision,meetingDecisionOn,resolveMeetingDecisions} from '../src/db/meeting-decision-rules.mjs';
import {replayPrecisePromotionHistory} from '../src/db/promotion-replay.mjs';
const d=(date='2026-10-24',target='test_paused',version=1)=>({id:'meeting:campaign:'+date,meetingId:'meeting',campaignId:'campaign',scheduleId:'schedule',effectiveOn:date,targetStatus:target,versionNumber:version,stageType:'testing'});
const version=(at:string,stage:string,decisions:any[],effectiveOn='2026-10-24')=>({meetingId:'meeting',createdAt:at,snapshot:{finalizationStage:stage,decisionEffectiveOn:effectiveOn,generated:{meetingDecisions:decisions}}});
test('会前没有状态效果，同日会后最新版整体替换，跨日历史保留',()=>{
 const rows=[version('2026-10-23T10:00Z','pre',[d()]),version('2026-10-23T11:00Z','post',[d()]),version('2026-10-23T12:00Z','post',[d('2026-10-24','scaling',2)]),version('2026-10-24T11:00Z','post',[d('2026-10-25','scaling',3)],'2026-10-25')];
 assert.deepEqual(resolveMeetingDecisions(rows.slice(0,1),[]),[]);
 const resolved=resolveMeetingDecisions(rows,[]);assert.equal(resolved.length,2);assert.equal(meetingDecisionOn(resolved,'campaign','2026-10-24')?.targetStatus,'scaling');assert.equal(resolved[0].versionNumber,2);
 assert.deepEqual(resolveMeetingDecisions([...rows.slice(0,2),version('2026-10-23T13:00Z','post',[])],[]),[]);
});
test('旧版本的理由更正不能覆盖较晚定稿，新更正只覆盖其当前版本',()=>{
 const rows=[version('2026-10-23T10:00Z','post',[d()]),version('2026-10-23T12:00Z','post',[d('2026-10-24','scaling',2)])];
 const corrections=[{createdAt:'2026-10-23T11:00Z',after:{meetingDecision:d('2026-10-24','testing')}}];
 assert.equal(resolveMeetingDecisions(rows,corrections)[0].targetStatus,'scaling');
 corrections.push({createdAt:'2026-10-23T13:00Z',after:{meetingDecision:d('2026-10-24','test_discarded',2)}});
 assert.equal(resolveMeetingDecisions(rows,corrections)[0].targetStatus,'test_discarded');
});
test('次日暂停或淘汰保留会议当天正常跑量，待定不能回退测试',()=>{
 assert.equal(meetingNextDecision('test_pending','scaling'),'start_scaling');assert.equal(meetingNextDecision('test_pending','testing'),null);
 const facts=[{metricDate:'2026-10-23',actualStatusSnapshot:'testing',stageTypeSnapshot:'testing',recordKind:'regular',dailyStatus:'active',reviewDecision:'test_continue'}];
 for(const target of ['test_paused','test_discarded']){
  const options={initialStage:'testing',stateChanges:[{businessDate:'2026-10-24',actualStatus:target,stageType:'testing',meetingDecision:true}]};
  assert.equal(replayPrecisePromotionHistory('2026-10-23',facts,{...options,asOf:'2026-10-23'})?.currentStatus,'testing');
  const state=replayPrecisePromotionHistory('2026-10-23',facts,{...options,asOf:'2026-10-24'})!;assert.equal(state.currentStatus,target);assert.equal(state.stages[0].endedOn,'2026-10-23');
 }
});
