import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readingTrend} from '../src/db/non-promotion-trend';
test('真实日期决定位置，缺失断线且累计值不相加',()=>{
 const trend=readingTrend([{key:'d',through:'2026-11-11',value:200},{key:'a',through:'2026-11-01',value:0},{key:'b',through:'2026-11-02',value:100},{key:'c',through:'2026-11-03',value:null}]);
 assert.equal(trend.maximum,200);assert.equal(trend.visible,true);assert.equal(trend.segments.length,2);
 assert.equal(trend.points[0].x,16);assert.equal(trend.points[0].y,132);assert.ok(Math.abs(trend.points[1].x-76.8)<1e-9);assert.equal(trend.points[3].x,624);
 assert.equal(readingTrend([{key:'a',through:'2026-11-01',value:0}]).visible,false);
 assert.equal(readingTrend([]).visible,false);
});
