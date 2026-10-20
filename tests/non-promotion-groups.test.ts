import assert from 'node:assert/strict';
import {test} from 'node:test';
import {nonPromotionGroups} from '../src/db/non-promotion-groups';
test('分类均值按学科、帖子类型、轮次隔离，缺失不补零，真实零保留',()=>{
 const row=(subjectId:string,categoryId:string,type:string,value:string|null)=>({row:{subjectId,subjectName:subjectId,categoryId,categoryName:categoryId},checkpoint:{type},metric:value===null?undefined:{clickRate:value,threeSecondReadRate:value}});
 const groups=nonPromotionGroups([row('tmua','innovation','day_7','0'),row('tmua','innovation','day_7','10'),row('tmua','innovation','day_15','40'),row('tmua','handout','day_7','90'),row('step','innovation','day_7','80'),row('tmua','innovation','day_15',null)]);
 assert.equal(groups.length,3);
 assert.deepEqual(groups.find(group=>group.key==='tmua:innovation')?.rounds,[{type:'day_7',count:2,click:5,read:5},{type:'day_15',count:1,click:40,read:40}]);
 assert.deepEqual(groups.find(group=>group.key==='tmua:handout')?.rounds[1],{type:'day_15',count:0,click:null,read:null});
});
