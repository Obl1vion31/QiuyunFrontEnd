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

test('只有课程实际推广：无事实的空讲义不阻断学科与全站成本',()=>{
 const data:SourcePrivateData={...sample,promotion:[
  {...sample.promotion[0]}, {...sample.promotion[1],consulted:0},
  {subjectId:'tmua',demand:'handout',added:null,consulted:null,converted:null},
  {subjectId:'interview',demand:'handout',added:null,consulted:null,converted:null},
 ]};
 const promotion=sourcePromotionRows(data,[{subjectId:'tmua',demand:'course'},{subjectId:'interview',demand:'course'}]);
 assert.equal(promotion.length,2);
 assert.deepEqual(sourceCountsProjection({...data,promotion}).total,{added:4,consulted:3,converted:2});
 assert.deepEqual(privateUnitCosts(5580.53,sumPrivateCounts(promotion)),{added:1395.13,consulted:1860.18,converted:2790.27});
});

test('全空行按实际事实判定，手填真实零不被清除',()=>{
 const data:SourcePrivateData={...sample,promotion:[{subjectId:'tmua',demand:'handout',added:null,consulted:null,converted:null},{subjectId:'step',demand:'mock',added:0,consulted:null,converted:0}]};
 assert.equal(sourcePromotionRows(data,[]).length,1);
 const rows=sourcePromotionRows(data,[{subjectId:'tmua',demand:'handout'}]);
 assert.equal(rows.length,2);
 assert.deepEqual(sumPrivateCounts(rows),{added:null,consulted:null,converted:null});
});
