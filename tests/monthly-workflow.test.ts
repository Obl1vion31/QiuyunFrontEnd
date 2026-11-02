import test from 'node:test';
import assert from 'node:assert/strict';
import {monthWeeks,adjacentMonth} from '../src/db/monthly-plan-types';
import {privateCosts} from '../src/db/monthly-private';
import {requireNewMonthlyPeriod} from '../src/db/monthly-meeting';
test('月计划按月内七天分Week，二月及跨年范围正确',()=>{assert.equal(monthWeeks('2026-02').length,4);assert.equal(monthWeeks('2028-02')[4].through,'2028-02-29');assert.equal(monthWeeks('2026-11')[4].from,'2026-11-29');assert.equal(adjacentMonth('2026-01',-1),'2025-12');});
test('月度成本区分未知、零分母和零费用，不推断跨月漏斗',()=>{assert.deepEqual(privateCosts(100,{added:0,consulted:20,converted:null}),{added:null,consulted:5,converted:null});assert.equal(privateCosts(0,{added:2,consulted:2,converted:3}).converted,0);assert.equal(privateCosts(null,{added:3,consulted:4,converted:5}).added,null);});
test('新月会只接受上个完整自然月及紧接的开会月',()=>{const now=new Date('2026-11-03T12:00:00+08:00');requireNewMonthlyPeriod('2026-10-01','2026-10-31',now,now);assert.throws(()=>requireNewMonthlyPeriod('2026-10-01','2026-10-30',now,now));assert.throws(()=>requireNewMonthlyPeriod('2026-09-01','2026-09-30',now,now));assert.throws(()=>requireNewMonthlyPeriod('2026-10-01','2026-10-31',new Date('2026-12-01'),now));});
