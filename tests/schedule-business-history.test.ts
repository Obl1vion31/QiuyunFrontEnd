import assert from 'node:assert/strict';
import test from 'node:test';
import {buildScheduleHistoryEvents as build} from '../src/db/schedule-business-history';

type Input=Parameters<typeof build>[0];
const input=(extra:Partial<Input>={}):Input=>({scheduleId:'schedule',execution:[],dateChanges:[],publications:[],applications:[],reservations:[],reasons:[],reviewHistory:[],nodes:[],noteEvents:[],...extra});
const from='2026-11-10T09:00:00.000Z',to='2026-11-25T10:00:00.000Z',at='2026-11-08T02:00:00.000Z';
const execution={at,actor:'运营同事',reason:'需求未到',before:{plannedAt:from,name:'讲义帖'},after:{plannedAt:to,name:'讲义帖 · 已完善'}};

test('一次跨周改期和改标题合为一件事，旧日期轨迹仅保留为依据，输入不变',()=>{
 const data=input({execution:[execution],dateChanges:[{id:'date',revision:0,plannedPublishAt:from,newPlannedPublishAt:to,endedAt:'2026-11-25T10:30:00Z',changedByLabel:execution.actor,reason:execution.reason}]});
 const original=structuredClone(data),events=build(data);
 assert.equal(events.length,1);assert.deepEqual(data,original);
 assert.equal(events[0].at,at);assert.equal(events[0].title,'调整应发时间及标题');
 assert.deepEqual(events[0].categories,['schedule','settings']);
 assert.deepEqual(events[0].changes.map(c=>c.label),['应发时间','标题']);
 assert(events[0].evidence.some(v=>v.includes('R0 → R1')));assert(events[0].evidence.some(v=>v.includes('W2 → W4')));
});

test('不把旧记录的实发结束时间当作操作时间，不凭相同时间或相同日期误合并不同来源',()=>{
 const events=build(input({execution:[execution],dateChanges:[{revision:0,plannedPublishAt:from,newPlannedPublishAt:to,endedAt:to,changedByLabel:'另一位同事',reason:'另一件事'}]}));
 assert.equal(events.length,2);assert.equal(events[1].at,null);assert.equal(events[1].reason,'另一件事');
});

test('发布登记显示操作时间、实发时间前后值、链接和运营确认',()=>{
 const row={id:'published',createdAt:new Date(at),changedByLabel:'发布人',reason:'登记实际发布时间',revision:1,before:{actualPublishAt:null,publicationUrl:null,projectDocUrl:null},after:{actualPublishAt:to,publicationUrl:'https://example.test/note',projectDocUrl:'https://example.test/doc',momentsConfirmation:{momentsSent:true,requestSent:true}}} as Input['publications'][number];
 const [event]=build(input({publications:[row]}));
 assert.equal(event.at,at);assert.equal(event.title,'已登记发布');
 assert.deepEqual(event.changes.map(c=>c.label),['实发时间','帖子链接','项目资料','运营确认']);
 assert.equal(event.changes[0].after,to);assert.equal(event.changes[1].format,'url');
});

test('同一次运营类型保存合并执行快照和复盘配置，不合并远期同值变化或仅时间相近的变化',()=>{
 const data=input({execution:[{...execution,before:{plannedAt:from,operationType:'non_promotion_standard'},after:{plannedAt:to,operationType:'non_promotion_continuous'}}],reviewHistory:[{at:'2026-11-08T02:00:00.050Z',actor:execution.actor,before:{operationType:'non_promotion_standard'},after:{operationType:'non_promotion_continuous',mode:'continuous',day7:false,day15:false}}]});
 const merged=build(data);assert.equal(merged.length,1);assert(merged[0].changes.some(c=>c.label==='复盘方式'));assert.match(merged[0].title,/应发时间及运营类型/);
 assert.equal(build({...data,reviewHistory:[{...data.reviewHistory[0],at:'2026-11-09T02:00:00Z'}]}).length,2);
 assert.equal(build({...data,reviewHistory:[{...data.reviewHistory[0],actor:'另一位同事'}]}).length,2);
 assert.equal(build({...data,reviewHistory:[{...data.reviewHistory[0],after:{contentRole:'promotion'}}]}).length,2);
});

test('保留明确的0和false，创建时的支持信息收纳为初始信息',()=>{
 const [event]=build(input({execution:[{at,actor:'运营同事',reason:'首轮排期填写',before:null,after:{plannedAt:from,name:'讲义帖',syncToMoments:false}}],reviewHistory:[]}));
 assert(event.initial);assert.equal(event.reason,'');assert.equal(event.changes[1].after,'讲义帖');
 const [review]=build(input({reviewHistory:[{at,actor:'运营同事',before:{day7:true},after:{day7:false}}]}));assert.equal(review.changes[0].after,'不启用');
});

test('复盘历史按排期作用域读取，取消保留原日期，技术自动续建不产生人工事件',()=>{
 const node={id:'node',scheduleId:'schedule',contentId:'content',createdAt:new Date(at),cancelledAt:new Date(to),revision:2,dueOn:'2026-11-20',history:[{at,actor:'运营同事',before:null,after:{dueOn:'2026-11-20'}},{at:to,actor:'运营同事',before:{dueOn:'2026-11-20'},after:{action:'cancel'},reason:'取消这次复盘'},{at,actor:'运营同事',after:{dueOn:'2026-12-20'},source:'weekly',statisticsFrom:'2026-11-15'},{at,actor:'运营同事',before:{dueOn:'2026-12-20'},after:{action:'cancel'},reason:'按最终日期重新安排'}]} as Input['nodes'][number];
 const events=build(input({nodes:[node],reviewHistory:[{at,actor:'运营同事',scheduleId:'another-schedule',before:{day7:true},after:{day7:false}}]}));
 assert.equal(events.length,2);assert.equal(events[0].title,'取消复盘节点');assert.deepEqual(events[0].changes[0],{label:'复盘截止日',before:'2026-11-20',after:'已取消'});
});

test('延期说明不进入业务历史，已完成改期申请仍保留',()=>{
 const application={id:'request',status:'approved',requestedByLabel:'同事',originalPlannedPublishAt:new Date(from),requestedPublishAt:new Date(to),reason:'改期',decidedAt:new Date(at),decidedByLabel:'管理员',decisionReason:null} as Input['applications'][number];
 const reason={id:'reason',planRevision:0,dayNumber:1,dueAt:new Date(from),reason:'已联系需求方',responsibility:'external',source:'manual',updatedAt:new Date(to),changedByLabel:'同事',history:[]} as unknown as Input['reasons'][number];
 const [event]=build(input({applications:[application],reasons:[reason]}));assert.equal(event.title,'同意改期申请');assert.deepEqual(event.categories,['schedule']);
 assert.equal(build(input({reasons:[reason]})).length,0);
});

test('技术修复不混入业务历史，笔记ID更正保留真实来源',()=>{
 const events=build(input({execution:[{...execution,reason:'数据修复：清理旧占位'}],noteEvents:[{id:'note',createdAt:new Date(at),changedByLabel:'运营同事',reason:'校对实际链接',beforeLabel:'111111111111111111111111',afterLabel:'222222222222222222222222'}]}));
 assert.equal(events.length,1);assert.equal(events[0].title,'更正笔记 ID');assert.deepEqual(events[0].categories,['publication']);
});

test('即时复盘日期以节点前值为准，同次配置与节点变更只显示一个事件',()=>{
 const node={id:'instant',scheduleId:'schedule',contentId:'content',createdAt:new Date(at),cancelledAt:null,revision:1,dueOn:'2026-11-22',history:[{at,actor:'运营同事',before:{dueOn:'2026-11-20'},after:{action:'reschedule',dueOn:'2026-11-22'},reason:'调整即时复盘日期'}]} as Input['nodes'][number];
 const data=input({reviewHistory:[{at,actor:'运营同事',before:{mode:'instant',day7:false,day15:false},after:{mode:'instant',day7:false,day15:false,dueOn:'2026-11-22'}}],nodes:[node]}),original=structuredClone(data);
 const events=build(data);assert.equal(events.length,1);assert.deepEqual(events[0].changes,[{label:'复盘截止日',before:'2026-11-20',after:'2026-11-22',format:'date'}]);assert.deepEqual(data,original);
});
