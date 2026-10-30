import assert from 'node:assert/strict';
import {test} from 'node:test';
import {buildMonthlyOperations,monthlyQuery} from '../src/db/monthly-operations';
const now=new Date('2026-10-30T12:00:00+08:00'),query={month:'2026-10',subject:'',category:''};
const post=(id:string,planned='2026-10-01T10:00:00+08:00',actual:string|null=null,extra={})=>({id,contentId:id,contentName:id,versionNumber:0,subjectId:'tmua',subjectName:'TMUA',categoryId:'temporary',categoryName:'临时帖',plannedPublishAt:new Date(planned),actualPublishAt:actual?new Date(actual):null,planRevision:1,isPromoted:false,promotionStatus:'none',...extra});
const campaign=(id:string,scheduleId=id,extra={})=>({id,scheduleId,startedOn:'2026-10-01',dailyReviewEnabledOn:'2026-10-01',endedOn:null,initialStage:'testing',currentStage:'testing',currentStatus:'testing',...extra});
const fact=(id:string,campaignId:string,metricDate:string,spend='10',extra={})=>({id,campaignId,metricDate,spend,stageTypeSnapshot:'testing',dailyStatus:'active',actualStatusSnapshot:'testing',platformOpenCount:1,actualOpenCount:1,platformLeadCount:1,actualLeadCount:1,reviewDecision:'test_continue',note:null,recordKind:'regular',sourceStageStartedOn:'2026-10-01',...extra});
function source(posts:any[]=[],campaigns:any[]=[],metrics:any[]=[],extra:any={}){return {posts,history:[],reasons:[],metrics,context:{campaigns,metrics,stateChanges:[],meetingDecisions:[],pauses:[],targets:[],holds:[],waitRanges:[]},taxonomy:{subjects:[],postCategories:[],subjectCategoryMappings:[]},...extra} as Parameters<typeof buildMonthlyOperations>[0];}
test('月份边界在上海时区，发布延期率只用本月应发中的已登记任务作分母',()=>{
 const data=buildMonthlyOperations(source([post('on','2026-10-01T10:00:00+08:00','2026-10-01T11:59:00+08:00'),post('late','2026-10-01T10:00:00+08:00','2026-10-01T12:00:00+08:00'),post('pending','2026-10-31T10:00:00+08:00'),post('cross','2026-09-30T20:00:00+08:00','2026-10-01T00:00:00+08:00'),post('old','2026-09-29T10:00:00+08:00')]),query,now);
 assert.equal(data.publication.planned,3);assert.equal(data.publication.registered,2);assert.equal(data.publication.delayRate,50);assert.equal(data.publication.published,3);assert.equal(data.publication.crossMonthPublished,1);assert.equal(data.publication.onTime+data.publication.delayed+data.publication.missing+data.publication.pending,3);
 assert.equal(monthlyQuery(new URLSearchParams(),new Date('2026-10-31T16:00:00Z')).month,'2026-11');assert.throws(()=>monthlyQuery(new URLSearchParams('month=2026-13')));
});
test('48小时严格超过才重点提醒，未登记仍与最终延期发布分开',()=>{
 const data=buildMonthlyOperations(source([post('48','2026-10-28T12:00:00+08:00'),post('over','2026-10-28T11:59:59+08:00'),post('2','2026-10-30T10:00:00+08:00'),post('under','2026-10-30T10:00:01+08:00')]),query,now);
 assert.equal(data.publication.missing,3);assert.equal(data.publication.severe,1);assert.equal(data.publication.delayRate,null);assert.equal(data.publication.delayed,0);
});
test('运营原因按当前修订去重，混合归因及改出又移回不会重复计数',()=>{
 const history=(id:string,scheduleId:string,from:string,to:string)=>({id,scheduleId,revision:0,plannedPublishAt:new Date(from),newPlannedPublishAt:new Date(to),endedAt:now,reason:'明确改期'});
 const data=buildMonthlyOperations(source([post('mixed'),post('moved','2026-11-01T10:00:00+08:00'),post('back')],[],[],{history:[history('1','moved','2026-10-02','2026-11-01'),history('2','back','2026-10-02','2026-11-01'),history('3','back','2026-11-01','2026-10-03')],reasons:[{scheduleId:'mixed',planRevision:1,dayNumber:1,dueAt:now,responsibility:'self',reason:'运营原因',changedByLabel:'Admin'},{scheduleId:'mixed',planRevision:1,dayNumber:2,dueAt:now,responsibility:'external',reason:'外部原因'},{scheduleId:'mixed',planRevision:1,dayNumber:3,dueAt:now,responsibility:'self',reason:'另一日'},{scheduleId:'back',planRevision:0,dayNumber:1,dueAt:now,responsibility:'self',reason:'旧原因'}]}),query,now);
 assert.equal(data.publication.operational,1);assert.equal(data.scheduleRows.find(r=>r.id==='mixed')?.mixed,true);assert.equal(data.publication.movedOut,1);assert.equal(data.publication.changedPending,1);assert.equal(data.scheduleRows.find(r=>r.id==='back')?.operational,false);
});
test('跨月失败、V0失败与V1活跃分开，费用回到消耗月；成本按总人数计算',()=>{
 const campaigns=[campaign('v0','v0',{startedOn:'2026-09-30',endedOn:'2026-11-01',currentStage:null,currentStatus:'test_discarded'}),campaign('v1')];
 const metrics=[fact('old','v0','2026-09-30','80',{sourceStageStartedOn:'2026-09-30'}),fact('a','v0','2026-10-01','100',{sourceStageStartedOn:'2026-09-30',actualOpenCount:2}),fact('b','v1','2026-10-02','200',{actualOpenCount:8})];
 const input=source([post('v0'),post('v1',undefined,null,{versionNumber:1})],campaigns,metrics);
 const october=buildMonthlyOperations(input,query,new Date('2026-11-02T12:00:00+08:00'));assert.equal(october.spend.spend,300);assert.equal(october.spend.wasted,100);assert.equal(october.wastedRows[0].totalSpend,180);assert.equal(october.categories[0].actualOpenCost,30);assert.equal(october.wastedRows[0].versionNumber,0);
 const september=buildMonthlyOperations(input,{...query,month:'2026-09'},new Date('2026-11-02T12:00:00+08:00'));assert.equal(september.spend.wasted,80);
 const beforeFailure=source(input.posts,campaigns.map(c=>c.id==='v0'?{...c,endedOn:null,currentStatus:'testing',currentStage:'testing'}:c),metrics);assert.equal(buildMonthlyOperations(beforeFailure,query,now).spend.wasted,0);
});
test('同版本复测只计失败轮次，残留保留；放量淘汰不反推测试失败',()=>{
 const campaigns=[campaign('retry','retry',{endedOn:'2026-10-04',currentStage:null,currentStatus:'test_discarded'}),campaign('scaled','scaled',{endedOn:'2026-10-03',currentStage:null,currentStatus:'formal_discarded'})];
 const metrics=[fact('1','retry','2026-10-01','10',{reviewDecision:'test_pending'}),fact('2','retry','2026-10-02','5',{dailyStatus:'waiting_action',actualStatusSnapshot:'test_pending',reviewDecision:'restart_testing'}),fact('3','retry','2026-10-03','20',{sourceStageStartedOn:'2026-10-03'}),fact('4','retry','2026-10-04','30',{sourceStageStartedOn:'2026-10-03',reviewDecision:'test_discarded'}),fact('5','retry','2026-10-05','7',{sourceStageStartedOn:'2026-10-03',recordKind:'test_residual',reviewDecision:'test_discarded',actualStatusSnapshot:'test_discarded'}),fact('6','scaled','2026-10-01','40',{reviewDecision:'start_scaling'}),fact('7','scaled','2026-10-02','60',{stageTypeSnapshot:'scaling',actualStatusSnapshot:'scaling',reviewDecision:'formal_discarded'})];
 const data=buildMonthlyOperations(source([post('retry'),post('scaled')],campaigns,metrics),query,now);assert.equal(data.spend.wasted,57);assert.equal(data.wastedRows.length,1);assert.equal(data.wastedRows[0].cycle,2);assert.equal(data.wastedRows[0].residualSpend,7);assert.equal(data.spend.spend,172);
});
test('真实零值与缺失不同，分类筛选不混入别的学科',()=>{
 const zero=source([post('z'),post('other',undefined,null,{subjectId:'step',subjectName:'STEP'})],[campaign('z'),campaign('other')],[fact('z','z','2026-10-01','0',{actualOpenCount:0,actualLeadCount:0}),fact('o','other','2026-10-01','100')]);
 const data=buildMonthlyOperations(zero,{...query,subject:'tmua'},now);assert.equal(data.spend.spend,0);assert.equal(data.spend.actualOpenCost,null);assert.equal(data.publication.planned,1);assert.equal(data.missingRows[0].dates.includes('2026-10-02'),true);
 const empty=buildMonthlyOperations(source(),query,now);assert.equal(empty.spend.spend,null);assert.equal(empty.spend.wasted,null);assert.equal(empty.publication.planned,0);
});
