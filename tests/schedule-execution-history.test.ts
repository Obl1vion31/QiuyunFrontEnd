import assert from 'node:assert/strict';
import {test} from 'node:test';
import {groupScheduleHistory} from '../src/db/schedule-history';
const row={name:'函数与推理',plannedAt:'2026-11-06T02:00:00Z',subjectName:'TMUA',categoryName:'推广讲义',operationType:'non_promotion_standard',projectDocUrl:'https://example.test/doc',syncToMoments:false};
const entry=(before:any,after:any)=>({at:'2026-11-06T02:00Z',actor:'fixture',reason:'首轮排期',before,after});
const content=(before:any,after:any)=>groupScheduleHistory([entry(before,after)],[]).find(g=>g.key==='content')!.items[0].details!.join('；');
test('首次排期直接摘要，不改原快照',()=>{const e=entry(null,row),copy=structuredClone(e),groups=groupScheduleHistory([e],[]);assert.equal(groups[0].items[0].label,'建立排期');const text=content(null,row);assert.match(text,/标题：函数与推理/);assert.match(text,/项目文档：https/);assert.doesNotMatch(text,/未填写|→|同步朋友圈：否/);assert.deepEqual(e,copy);});
test('真正的修改含空值填写和清空保留前后值',()=>{assert.match(content({name:''},{name:'新标题'}),/未填写 → 新标题/);assert.match(content({projectDocUrl:'https://example.test/doc'},{projectDocUrl:''}),/https:\/\/example.test\/doc → 未填写/);assert.match(content({syncToMoments:false},{syncToMoments:true}),/否 → 是/);});
test('旧首条更正不冒充创建；取消和重新安排沿用原语义',()=>{assert.equal(groupScheduleHistory([entry({name:'旧标题'},{name:'新标题'})],[]).some(g=>g.key==='execution'),false);assert.equal(groupScheduleHistory([entry(row,{...row,cancelledAt:'2026-11-06'})],[])[0].items[0].label,'取消排期');assert.equal(groupScheduleHistory([entry({...row,cancelledAt:'2026-11-06'},row)],[])[0].items[0].label,'重新安排');});
