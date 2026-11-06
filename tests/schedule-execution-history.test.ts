import assert from 'node:assert/strict';
import {test} from 'node:test';
import {executionDescription} from '../src/scripts/schedule-execution-history';
const row={name:'函数与推理',plannedAt:'2026-11-06T02:00:00Z',subjectName:'TMUA',categoryName:'推广讲义',operationType:'non_promotion_standard',projectDocUrl:'https://example.test/doc',syncToMoments:false};
const entry=(before:any,after:any)=>({at:'2026-11-06T02:00Z',actor:'fixture',reason:'首轮排期',before,after});
test('首次排期直接摘要，不改原快照',()=>{const e=entry(null,row),copy=structuredClone(e),text=executionDescription(e);assert.match(text,/建立排期/);assert.match(text,/标题：函数与推理/);assert.match(text,/2026-11-06 10:00/);assert.match(text,/项目文档：https/);assert.doesNotMatch(text,/未填写|→|同步朋友圈：否/);assert.deepEqual(e,copy);});
test('真正的修改含空值填写和清空保留前后值',()=>{assert.match(executionDescription(entry({name:''},{name:'新标题'})),/未填写 → 新标题/);assert.match(executionDescription(entry({projectDocUrl:'https://example.test/doc'},{projectDocUrl:''})),/https:\/\/example.test\/doc → 未填写/);assert.match(executionDescription(entry({syncToMoments:false},{syncToMoments:true})),/否 → 是/);});
test('旧首条更正不能冒充创建；取消和重新安排沿用原语义',()=>{assert.match(executionDescription(entry({name:'旧标题'},{name:'新标题'})),/^调整排期/);assert.match(executionDescription(entry(row,{...row,cancelledAt:'2026-11-06'})),/^取消排期/);assert.match(executionDescription(entry({...row,cancelledAt:'2026-11-06'},row)),/^重新安排/);});
