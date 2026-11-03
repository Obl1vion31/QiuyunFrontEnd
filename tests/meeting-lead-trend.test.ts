import assert from 'node:assert/strict';
import {test} from 'node:test';
import {promotionLeadCostTrend,type LeadCostReview} from '../src/db/meeting-lead-trend';

const review=(key:string,from:string,through:string,value:number|null,extra:Partial<LeadCostReview>={}):LeadCostReview=>({key,from,through,value,contentId:'post',scheduleId:'v0',versionNumber:0,stageType:'scaling',finalizedAt:'2026-10-28T00:00:00Z',...extra});
test('留资成本跨改帖比较、按真实区间排序，同区间修订只留最新定稿',()=>{
 const current=review('now','2026-10-25','2026-10-31',12,{scheduleId:'v1',versionNumber:1});
 const history=[review('old','2026-10-01','2026-10-07',40),review('revised','2026-10-01','2026-10-07',35,{finalizedAt:'2026-10-29T00:00:00Z'}),review('next','2026-10-08','2026-10-14',25,{scheduleId:'v1',versionNumber:1}),review('testing','2026-10-15','2026-10-21',2,{stageType:'testing'}),review('other','2026-10-15','2026-10-21',3,{contentId:'other'}),review('same','2026-10-25','2026-10-31',18,{scheduleId:'v1'}),review('future','2026-11-01','2026-11-07',1)];
 assert.deepEqual(promotionLeadCostTrend(current,history).map(p=>[p.key,p.value,p.versionNumber,p.current]),[['revised',35,0,undefined],['next',25,1,undefined],['now',12,1,true]]);
});
test('只取四个有效历史点；成本零值保留，零留资成本未知不冒充零',()=>{
 const history=Array.from({length:6},(_,i)=>review('h'+i,`2026-10-${String(i*3+1).padStart(2,'0')}`,`2026-10-${String(i*3+3).padStart(2,'0')}`,i===5?0:30-i));
 history.push(review('missing','2026-10-20','2026-10-21',null));
 const current=review('now','2026-10-25','2026-10-31',null);
 const points=promotionLeadCostTrend(current,history);
 assert.deepEqual(points.map(p=>p.key),['h2','h3','h4','h5','now']);assert.equal(points[3].value,0);assert.equal(points[4].value,null);
 assert.deepEqual(promotionLeadCostTrend(current,[]).map(p=>[p.value,p.current]),[[null,true]]);
});
