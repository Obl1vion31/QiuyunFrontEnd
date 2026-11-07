import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import MonthlyPlanSummary from '../src/components/MonthlyPlanSummary';
import {compactPlanItems,type PlanContent} from '../src/db/monthly-plan-types';

const content:PlanContent={groups:[{id:'g',annualPlanId:null,annualVersion:null,name:'TMUA 案例',subjectId:'tmua',categoryId:'success-story',quantity:3,note:'',reason:''}],items:[{id:'one',groupId:'g',week:1,kind:'carry',scheduleId:'old'},{id:'two',groupId:'g',week:1,kind:'existing',scheduleId:'future'},{id:'three',groupId:'g',week:2,kind:'new',scheduleId:null}]};
test('周次汇总使用真实登记，不将未来登记算未登记，遗留仍包含在总数中',()=>{
 const html=renderToStaticMarkup(React.createElement(MonthlyPlanSummary,{month:'2026-11',content,candidates:[{id:'old',name:'遗留原帖',plannedAt:'2026-10-28T02:00:00Z',actualAt:null},{id:'future',name:'已登记原帖',plannedAt:'2026-11-05T02:00:00Z',actualAt:'2026-11-05T02:00:00Z'}]}));
 assert.match(html,/Week 1/);assert.match(html,/计划 <b>2<\/b> 篇/);assert.match(html,/未登记 <b>1<\/b> 篇/);assert.match(html,/上月遗留/);assert.match(html,/2026-11-01—2026-11-07/);assert.match(html,/查看详情/);assert.doesNotMatch(html,/负责人/);
});
test('旧材料缺少已关联排期状态时保持未知，不伪造未登记数',()=>{
 const html=renderToStaticMarkup(React.createElement(MonthlyPlanSummary,{month:'2026-11',content}));assert.match(html,/未登记 <b>—<\/b> 篇/);assert.match(html,/>未记录<\/td>/);
});
test('同名不同规划组不合并，未分周名额有独立入口',()=>{
 const next:PlanContent={groups:[...content.groups,{...content.groups[0],id:'other'}],items:[...content.items,{...content.items[2],id:'four',groupId:'other',week:null}]};
 const html=renderToStaticMarkup(React.createElement(MonthlyPlanSummary,{month:'2026-11',content:next}));assert.equal((html.match(/data-plan-project=/g)||[]).length,3);assert.match(html,/>待分配<\/h3>/);
});

test('同周同来源空名额合并计数，已关联的不同帖子保持独立',()=>{
 const next:PlanContent={...content,items:[...content.items,{...content.items[2],id:'four'}]};
 const html=renderToStaticMarkup(React.createElement(MonthlyPlanSummary,{month:'2026-11',content:next,cards:true}));
 assert.equal((html.match(/data-plan-project=/g)||[]).length,3);assert.match(html,/×2/);assert.match(html,/data-plan-count="2"/);
});

test('已提交或有落实记录的名额独立显示，不把审批进展藏入合并卡',()=>{
 const items=[content.items[2],{...content.items[2],id:'other'}];
 assert.equal(compactPlanItems(items,new Set(['other'])).length,2);
});

test('只读周板保留遗留、新做和指定原帖的真实身份',()=>{
 const html=renderToStaticMarkup(React.createElement(MonthlyPlanSummary,{month:'2026-11',content,cards:true}));
 assert.match(html,/data-kind="carry">遗留/);assert.match(html,/data-kind="existing">指定/);assert.match(html,/data-kind="new">新/);
});

test('旧冻结重复名额按具体排期及冻结候选读，两帖分别呈现',()=>{
 const next:PlanContent={...content,items:[{...content.items[0],id:'duplicate',scheduleId:'a'},{...content.items[0],id:'duplicate',scheduleId:'b',week:4}]};
 const candidates=[{id:'a',name:'案例1',plannedAt:'2026-11-03T08:00:00Z',actualAt:null},{id:'b',name:'案例3',plannedAt:'2026-11-25T07:00:00Z',actualAt:null}];
 const execution=next.items.map(item=>({...item,schedule:candidates[1],submittedAt:null,pending:false,history:[]}));
 const html=renderToStaticMarkup(React.createElement(MonthlyPlanSummary,{month:'2026-11',content:next,candidates,execution:execution as any,cards:true}));
 assert.equal((html.match(/data-plan-project=/g)??[]).length,2);assert.match(html,/案例1/);assert.match(html,/案例3/);assert.doesNotMatch(html,/×2/);assert.match(html,/2026-11-03 16:00/);assert.match(html,/2026-11-25 15:00/);
 const missingHistory=execution.map(({history,...row})=>row);assert.doesNotThrow(()=>renderToStaticMarkup(React.createElement(MonthlyPlanSummary,{month:'2026-11',content:next,candidates,execution:missingHistory as any,cards:true})));
});
