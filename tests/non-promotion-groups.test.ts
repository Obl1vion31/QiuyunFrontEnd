import assert from 'node:assert/strict';
import {test} from 'node:test';
import {nonPromotionGroups} from '../src/db/non-promotion-groups';
test('分类均值按学科、帖子类型、轮次隔离，缺失不补零，真实零保留',()=>{
 const row=(subjectId:string,categoryId:string,type:string,value:string|null)=>({row:{subjectId,subjectName:subjectId,categoryId,categoryName:categoryId},checkpoint:{type},metric:value===null?undefined:{clickRate:value,threeSecondReadRate:value}});
 const groups=nonPromotionGroups([row('tmua','innovation','day_7','0'),row('tmua','innovation','day_7','10'),row('tmua','innovation','day_15','40'),row('tmua','handout','day_7','90'),row('step','innovation','day_7','80'),row('tmua','innovation','day_15',null)]);
 assert.equal(groups.length,3);
 assert.deepEqual(groups.find(group=>group.key==='tmua:innovation')?.rounds,[{type:'day_7',count:2,reading:null,readingCount:0,click:5,clickCount:2,read:5,readCount:2},{type:'day_15',count:1,reading:null,readingCount:0,click:40,clickCount:1,read:40,readCount:1}]);
 assert.deepEqual(groups.find(group=>group.key==='tmua:handout')?.rounds[1],{type:'day_15',count:0,reading:null,readingCount:0,click:null,clickCount:0,read:null,readCount:0});
});
test('阅读量与两项率使用各自有效分母，保留零和小数均值',()=>{
 const row={subjectId:'tmua',subjectName:'TMUA',categoryId:'innovation',categoryName:'创新帖'};
 const items=[{readCount:0,clickRate:'0',threeSecondReadRate:null},{readCount:101,clickRate:null,threeSecondReadRate:'80'},{readCount:null,clickRate:'20',threeSecondReadRate:'40'}].map(metric=>({row,checkpoint:{type:'day_7'},metric}));
 assert.deepEqual(nonPromotionGroups(items)[0].rounds[0],{type:'day_7',count:3,reading:50.5,readingCount:2,click:10,clickCount:2,read:60,readCount:2});
});
