import {test} from 'node:test';
import assert from 'node:assert/strict';
import {actualDataRange,reconcileClickRateRanges,sortMeetingNonPromotions,defaultMeetingName,refreshedMeetingName,hasMeetingIssueContent} from '../src/db/meeting-card-rules';
import {meetingDraftSchema} from '../src/db/meeting-snapshots';
import {meetingFinalizationIssue} from '../src/db/meeting-finalization';
import type {WeeklyMeetingDraft} from '../src/db/schema';
const fact=(day:string,values={})=>({metricDate:'2026-10-'+day,spend:'0',platformOpenCount:0,actualOpenCount:0,platformLeadCount:0,actualLeadCount:0,...values});
test('非零首末日包含暂停后的转化及中间零值，首尾零值不延长',()=>{
 const rows=[fact('15'),fact('16',{spend:'100'}),fact('17'),fact('25',{actualOpenCount:1,actualLeadCount:1}),fact('26')],before=JSON.stringify(rows);
 assert.deepEqual(actualDataRange(rows),{from:'2026-10-16',through:'2026-10-25'});assert.equal(JSON.stringify(rows),before);
 assert.deepEqual(actualDataRange([fact('18',{platformOpenCount:1}),fact('19',{platformLeadCount:1})]),{from:'2026-10-18',through:'2026-10-19'});
 assert.equal(actualDataRange([fact('18'),fact('19')]),null);assert.equal(actualDataRange([]),null);
 assert.equal(actualDataRange([{metricDate:'2026-10-18',spend:'0',actualOpenCount:0,actualLeadCount:0} as any]),null);
});
test('点击率区间变化保留人工数值，不能通过反复刷新消除待核对',()=>{
 const before=[{key:'p',facts:[fact('16',{spend:'100'})]}],after=[{key:'p',facts:[...before[0].facts,fact('25',{actualLeadCount:1})]}];
 const input={p:{clickRate:4.62,recordedThrough:'2026-10-16',currentSituation:'观察保留',activeAction:'行动保留',confirmed:true}};
 const changed=reconcileClickRateRanges(input,before,after);assert.equal(changed.p.clickRate,4.62);assert.equal(changed.p.rateNeedsReview,true);assert.equal(changed.p.confirmed,false);assert.equal(changed.p.currentSituation,'观察保留');
 assert.equal(reconcileClickRateRanges(changed,after,after).p.rateNeedsReview,true);
 const confirmed={p:{...changed.p,confirmed:true,rateNeedsReview:false,rateRange:{from:'2026-10-16',through:'2026-10-25'}}};assert.equal(reconcileClickRateRanges(confirmed,before,after).p.rateNeedsReview,false);
 const unchanged=reconcileClickRateRanges(input,before,[{key:'p',facts:[...before[0].facts,fact('19')]}]);assert.equal(unchanged.p.confirmed,true);assert.equal(unchanged.p.rateNeedsReview,false);
 const firstEntry=reconcileClickRateRanges(input,before,after,{});assert.equal(firstEntry.p.rateNeedsReview,false);assert.deepEqual(firstEntry.p.rateRange,{from:'2026-10-16',through:'2026-10-25'});
});
test('非推广混合节点按发布时间排序，同帖首轮在二轮前，缺日期放末尾',()=>{
 const rows=[{key:'b:day_7',scheduleId:'b',checkpointType:'day_7',actualPublishAt:'2026-10-16T08:00:00Z'},{key:'a:day_15',scheduleId:'a',checkpointType:'day_15',actualPublishAt:'2026-10-14T08:00:00Z'},{key:'unknown:day_7',checkpointType:'day_7'},{key:'a:day_7',scheduleId:'a',checkpointType:'day_7',actualPublishAt:'2026-10-14T08:00:00Z'}];
 assert.deepEqual(sortMeetingNonPromotions(rows).map(r=>r.key),['a:day_7','a:day_15','b:day_7','unknown:day_7']);
 assert.deepEqual(sortMeetingNonPromotions([{...rows[1],actualPublishAt:undefined,publishedOn:'2026-10-14'},rows[3]]).map(r=>r.key),['a:day_7','a:day_15']);
});
test('自动名称随区间变化，自定义保留且跨年明确两端年份',()=>{
 const meeting={name:defaultMeetingName('2026-10-17','2026-10-23'),periodStart:'2026-10-17',periodEnd:'2026-10-23',meetingType:'weekly'};
 assert.equal(refreshedMeetingName(meeting,'2026-10-16','2026-10-24'),'2026.10.16—10.24 周度业务复盘');
 assert.equal(refreshedMeetingName({...meeting,name:'面试课专题会'},'2026-10-16','2026-10-24'),'面试课专题会');
 assert.equal(defaultMeetingName('2026-12-28','2027-01-03'),'2026.12.28—2027.01.03 周度业务复盘');
});
test('半填写事项允许草稿保存，定稿定位缺少的问题',()=>{
 const draft:WeeklyMeetingDraft={schemaVersion:4,workflowVersion:5,candidatesConfirmed:true,coreConclusion:'结论',situation:'衡量',strategy:'动作',nextAction:'下一步',promotionInputs:{},promotionSelections:[],nonPromotionSelections:[],issues:[{problem:'',conclusion:'先填写的方案',status:'pending'}]};
 assert.equal(meetingDraftSchema.safeParse(draft).success,true);assert.equal(hasMeetingIssueContent(draft.issues[0]),true);
 assert.deepEqual(meetingFinalizationIssue(draft,'pre',[])?.target,{kind:'issue',index:0});
 assert.equal(hasMeetingIssueContent({problem:'',conclusion:'',status:'pending'}),false);
});
