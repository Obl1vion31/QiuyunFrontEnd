import {test} from 'node:test';
import assert from 'node:assert/strict';
import {canFinalizeMeetingPost} from '../src/db/meeting-version-rules';

test('周会双方可定稿，不依赖月计划；月会首次确认预排期仅管理员',()=>{
 for(const confirmed of [false,true]){
  assert.equal(canFinalizeMeetingPost('weekly','employee',confirmed),true);
  assert.equal(canFinalizeMeetingPost('weekly','admin',confirmed),true);
  assert.equal(canFinalizeMeetingPost('monthly','admin',confirmed),true);
 }
 assert.equal(canFinalizeMeetingPost('monthly','employee',false),false);
 assert.equal(canFinalizeMeetingPost('monthly','employee',true),true,'保留已确认预排期后的既有修订权限');
 assert.equal(canFinalizeMeetingPost('weekly',undefined),false);
 assert.equal(canFinalizeMeetingPost('monthly',undefined,true),false);
});
