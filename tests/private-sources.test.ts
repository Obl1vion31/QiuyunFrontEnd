import assert from 'node:assert/strict';
import test from 'node:test';
import {privateCostChange,privateUnitCosts,sourceCountsProjection,sumPrivateCounts,sourcePromotionRows} from '../src/db/monthly-private-sources';
import type {SourcePrivateData} from '../src/db/monthly-plan-types';

const sample:SourcePrivateData={schemaVersion:2,promotion:[{subjectId:'tmua',demand:'course',added:3,consulted:3,converted:2},{subjectId:'interview',demand:'course',added:1,consulted:1,converted:0}],nonPromotion:[{id:'organic',subjectId:'tmua',source:'第一时间解析',added:159,consulted:0,converted:0}],note:''};
test('来源分开：自然来源159人不进入推广成本分母',()=>{
 const counts=sourceCountsProjection(sample).total;
 assert.deepEqual(counts,{added:4,consulted:4,converted:2});
 assert.deepEqual(privateUnitCosts(19000,counts),{added:4750,consulted:4750,converted:9500});
 assert.deepEqual(sourceCountsProjection({...sample,nonPromotion:[]}),sourceCountsProjection(sample));
});
test('各项独立完整度：缺意向不抹掉加微与真实零成交',()=>{
 const counts=sumPrivateCounts([{added:3,consulted:null,converted:0},{added:1,consulted:1,converted:0}]);
 assert.deepEqual(counts,{added:4,consulted:null,converted:0});
 assert.deepEqual(privateUnitCosts(100,counts),{added:25,consulted:null,converted:null});
 assert.deepEqual(privateUnitCosts(0,{added:2,consulted:1,converted:1}),{added:0,consulted:0,converted:0});
});
test('有消耗但未提供人数的用途不能从推广总计中消失',()=>{
 const rows=sourcePromotionRows(sample,[{subjectId:'tmua',demand:'handout'}]);
 assert.equal(rows.length,3);assert.deepEqual(sumPrivateCounts(rows),{added:null,consulted:null,converted:null});
});
test('环比保留方向、零基数和未知的区别',()=>{
 assert.deepEqual(privateCostChange(75,100),{amount:-25,percent:-25});
 assert.deepEqual(privateCostChange(100,0),{amount:100,percent:null});
 assert.deepEqual(privateCostChange(0,0),{amount:0,percent:null});
 assert.equal(privateCostChange(null,100),null);
});
