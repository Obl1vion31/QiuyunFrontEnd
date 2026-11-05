import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promotionNextOptions} from '../src/db/promotion-successors.mjs';
import {replayPromotionHistory} from '../src/db/promotion-rules.mjs';
import {testingCycles} from '../src/db/promotion-cycles.mjs';
test('暂停有5种后续，结束待定有4种后续，恢复和重新测试区分原轮与新轮',()=>{
 assert.deepEqual(promotionNextOptions('test_paused').map(o=>o.value),['wait_continue','test_continue','start_scaling','test_discarded','restart_testing']);
 assert.deepEqual(promotionNextOptions('test_pending').map(o=>o.value),['wait_continue','start_scaling','test_discarded','restart_testing']);
 const c={id:'x',startedOn:'2026-10-29'};
 for(const decision of ['test_continue','restart_testing']){
  const metrics=[{campaignId:'x',metricDate:'2026-10-29',dailyStatus:'waiting_action',stageTypeSnapshot:'testing',actualStatusSnapshot:'test_paused',reviewDecision:decision}];
  assert.equal(replayPromotionHistory(c.startedOn,metrics,{asOf:'2026-10-30',stateChanges:[{businessDate:c.startedOn,stageType:'testing',actualStatus:'test_paused'}]})?.currentStatus,'testing');
  assert.equal(testingCycles(c,{metrics},'2026-10-30').length,decision==='test_continue'?1:2);
 }
});
test('历史兼容读仍可读取旧暂停快照，受更正日期影响的待定不能借旧快照继续测试',()=>{
 const metrics=[{metricDate:'2026-10-29',dailyStatus:'waiting_action',stageTypeSnapshot:'testing',actualStatusSnapshot:'test_paused',reviewDecision:'test_continue'}];
 const options={asOf:'2026-10-30',stateChanges:[{businessDate:'2026-10-29',stageType:'testing',actualStatus:'test_pending'}]};
 assert.equal(replayPromotionHistory('2026-10-29',metrics,options)?.currentStatus,'testing');
 assert.equal(replayPromotionHistory('2026-10-29',metrics,{...options,strictFrom:'2026-10-29'}),null);
});
