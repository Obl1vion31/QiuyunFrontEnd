import assert from 'node:assert/strict';
import test from 'node:test';
import {businessDate,businessDateTime,delayDayLabel} from '../src/scripts/business-date';
test('完整时间与日期采用同一上海时区格式，午夜跨年不受运行环境时区影响',()=>{
 const midnight='2026-12-31T16:00:00.000Z';
 assert.equal(businessDateTime(midnight),'2027-01-01 00:00');
 assert.equal(businessDate(midnight),'2027-01-01');
 assert.equal(businessDateTime('2026-10-17T01:00:00.000Z'),'2026-10-17 09:00');
});
test('延期标签按所属排期的自然日期计算，覆盖当天、次日及跨年',()=>{
 const planned='2026-10-17T07:00:00+08:00';
 assert.equal(delayDayLabel(planned,'2026-10-17T09:00:00+08:00'),'当日延期');
 assert.equal(delayDayLabel(planned,'2026-10-18T09:00:00+08:00'),'已延期一天');
 assert.equal(delayDayLabel(planned,'2026-10-19T09:00:00+08:00'),'已延期两天');
 assert.equal(delayDayLabel('2026-12-31T23:00:00+08:00','2027-01-01T01:00:00+08:00'),'已延期一天');
});
