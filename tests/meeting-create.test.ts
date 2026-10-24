import assert from 'node:assert/strict';
import {test} from 'node:test';
import {meetingReviewSchema} from '../src/db/stage-review-validation';
const fields={meetingType:'weekly',periodStart:'2026-10-17',periodEnd:'2026-10-22',name:''};
test('例会拆分输入的本地时间按上海时区保存',()=>{
  assert.equal(meetingReviewSchema.parse({...fields,meetingAt:'2026-10-24T23:00'}).meetingAt.toISOString(),'2026-10-24T15:00:00.000Z');
});
test('例会兼容带时区的已有接口，拒绝无效本地日期',()=>{
  assert.equal(meetingReviewSchema.parse({...fields,meetingAt:'2026-10-24T23:00:00+08:00'}).meetingAt.toISOString(),'2026-10-24T15:00:00.000Z');
  for(const meetingAt of ['2026-02-30T23:00','2026-10-24T25:00','',null])assert.equal(meetingReviewSchema.safeParse({...fields,meetingAt}).success,false);
});
