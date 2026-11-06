import {test} from 'node:test';
import assert from 'node:assert/strict';
import {historicalDayCanFollow,historicalDayBridge} from '../src/db/promotion-day-rules.mjs';
test('单日暂停前后可以衔接，不按当前状态自身的后继限制历史更正',()=>{
 for(const [previous,target,next]of [['testing','test_paused','testing'],['test_paused','testing','test_paused'],['scaling','scaling_paused','scaling'],['scaling_paused','scaling','scaling_paused'],['testing','test_pending','test_paused']]){
  assert(historicalDayCanFollow(previous,target));assert(historicalDayCanFollow(target,next));assert(historicalDayBridge(target,next));
 }
});
test('旧轮结束不能接旧轮继续，已存在的新轮标记保留而非虚构',()=>{
 assert.equal(historicalDayCanFollow('test_pending','testing'),false);assert(historicalDayCanFollow('test_pending','testing',true));assert.equal(historicalDayBridge('testing','testing',true),'restart_testing');
 for(const terminal of ['test_discarded','formal_discarded','ended'])assert.equal(historicalDayCanFollow(terminal,'testing'),false);
 assert.equal(historicalDayCanFollow('scaling','testing'),false);
});
