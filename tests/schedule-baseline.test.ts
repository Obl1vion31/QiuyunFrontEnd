import assert from 'node:assert/strict';
import {test} from 'node:test';
import {buildScheduleComparison,legacyScheduleBaseline,type BaselineItem,type ExecutionRecord,type ScheduleBaseline} from '../src/db/schedule-baseline';
import {scheduleReasonRequired} from '../src/db/schedule-plan-policy';
const at=(day:number,hour='10')=>'2026-11-'+String(day).padStart(2,'0')+'T'+hour+':00:00+08:00';
const item=(id:string,day=10):BaselineItem=>({id,name:id,plannedAt:new Date(at(day)).toISOString(),versionId:id+'-v',versionNumber:0});
const record=(i:BaselineItem):ExecutionRecord=>({...i,createdAt:'2026-10-30T00:00:00Z',cancelledAt:null,actualAt:null,history:[]});
const baseline=(items:BaselineItem[]):ScheduleBaseline=>({schemaVersion:1,month:'2026-11',sealedAt:'2026-11-01T00:00:00Z',items});
test('月排期净构成25+4-1=28，新增后取消不占净新增，未知不伪造0',()=>{
 const original=Array.from({length:25},(_,n)=>item('base-'+n));
 const rows=original.map(record);rows[0].cancelledAt=at(3);
 rows.push(...Array.from({length:4},(_,n)=>record(item('new-'+n))));
 rows.push({...record(item('added-then-cancelled')),cancelledAt:at(4)});
 const result=buildScheduleComparison([baseline(original)],rows,'2026-11-01','2026-11-30',new Date(at(30)));
 assert.deepEqual([result.original,result.added,result.removed,result.current],[25,4,1,28]);
 const unknown=buildScheduleComparison([],rows,'2026-11-01','2026-11-30',new Date(at(30)));assert.equal(unknown.original,null);assert.equal(unknown.added,null);
});
test('周会回放截止结构，不让后来的改期覆盖当期；未来实发不计本期',()=>{
 const i=item('one',7),r=record(i);r.plannedAt=new Date(at(20)).toISOString();
 r.history=[{at:new Date(at(9)).toISOString(),actor:'staff',reason:'下周发布',before:{...i},after:{...r}}];
 r.actualAt=new Date(at(20)).toISOString();
 const result=buildScheduleComparison([baseline([i])],[r],'2026-11-01','2026-11-07',new Date(at(30)));
 assert.equal(result.current,1);assert.equal(result.removed,0);assert.equal(result.published,0);assert.equal(result.missing,1);assert.equal(result.rows[0].plannedAt,i.plannedAt);assert(!result.rows[0].flags.includes('漏发'));
});
test('真实同名排期按ID分别计数，实发按真实时间且不受当前应发范围限制',()=>{
 const a=item('a',7),b={...item('b',8),name:a.name},ra=record(a),rb=record(b);
 ra.actualAt=new Date(at(6)).toISOString();rb.actualAt=new Date(at(7)).toISOString();
 const result=buildScheduleComparison([baseline([a,b])],[ra,rb],'2026-11-01','2026-11-07',new Date(at(30)));
 assert.equal(result.original,1);assert.equal(result.published,2);assert.equal(result.rows.length,2);assert.equal(result.missing,0);
});
test('移出再移回恢复净构成，真实历史保留',()=>{
 const i=item('a'),r=record(i);
 r.history=[{at:new Date(at(3)).toISOString(),actor:'staff',reason:'调整',before:{...i},after:{...i,plannedAt:'2026-12-02T02:00:00Z'}},{at:new Date(at(4)).toISOString(),actor:'staff',reason:'恢复',before:{...i,plannedAt:'2026-12-02T02:00:00Z'},after:{...i}}];
 const result=buildScheduleComparison([baseline([i])],[r],'2026-11-01','2026-11-30',new Date(at(30)));
 assert.deepEqual([result.original,result.added,result.removed,result.current],[1,0,0,1]);assert.equal(result.rows[0].history.length,2);
});
test('旧封存只投影真实基准；定稿前同Week免理由、跨原Week和定稿后必填',()=>{
 assert.equal(legacyScheduleBaseline('2026-11',at(1),{items:[{id:'slot',group:{},schedule:{id:'a',name:'旧帖',plannedAt:at(7)}}]})?.items[0].plannedAt,new Date(at(7)).toISOString());
 assert.equal(legacyScheduleBaseline('2026-11',at(1),{items:[{id:'slot'}]}),null);
 assert.equal(scheduleReasonRequired(false,'2026-11',1,'2026-11-07'),null);
 assert(scheduleReasonRequired(false,'2026-11',1,'2026-11-15'));
 assert(scheduleReasonRequired(true,'2026-11',1,'2026-11-07'));
 assert.equal(scheduleReasonRequired(false,null,null,'2026-11-07'),null);
});

test('同毫秒多次调整按真实追加顺序回放',()=>{const i=item('tie',7),r=record(i);r.plannedAt=new Date(at(21)).toISOString();const middle={...i,plannedAt:new Date(at(14)).toISOString()};r.history=[{at:new Date(at(9)).toISOString(),actor:'staff',reason:'一次',before:{...i},after:middle},{at:new Date(at(9)).toISOString(),actor:'staff',reason:'二次',before:middle,after:{...r}}];const result=buildScheduleComparison([baseline([i])],[r],'2026-11-01','2026-11-07',new Date(at(30)));assert.equal(result.rows[0].plannedAt,i.plannedAt);});

test('跨月基准按排期ID去重，补建后的历史实发只计真实发生日',()=>{const a=item('shared',30),next={...a,plannedAt:'2026-12-01T02:00:00Z'},late={...record(item('late',12)),createdAt:'2026-12-03T02:00:00Z',actualAt:'2026-11-12T02:00:00Z'};const result=buildScheduleComparison([baseline([a]),{schemaVersion:1,month:'2026-12',sealedAt:'2026-12-01T00:00:00Z',items:[next]}],[record(a),late],'2026-11-01','2026-12-02',new Date('2026-12-05T00:00:00Z'));assert.equal(result.original,1);assert.equal(result.published,1);assert.equal(result.rows.find(r=>r.id==='late')!.plannedAt,null);});
