import assert from 'node:assert/strict';
import {test} from 'node:test';
import {meetingClickRate,missingClickRateDateRanges,reconcileClickRateRanges} from '../src/db/meeting-card-rules';
import {meetingFinalizationIssue} from '../src/db/meeting-finalization';
import {meetingDraftSchema} from '../src/db/meeting-snapshots';
import type {WeeklyMeetingDraft} from '../src/db/schema';

const fact=(day:string,impressionCount:number|null,clickCount:number|null,spend='10')=>({metricDate:'2026-10-'+day,spend,platformOpenCount:0,platformLeadCount:0,actualOpenCount:0,actualLeadCount:0,impressionCount,clickCount});
const input={clickRate:88,recordedThrough:'2026-10-01',currentSituation:'观察保留',activeAction:'行动保留',confirmed:true};
const draft=(promotionInputs:WeeklyMeetingDraft['promotionInputs']):WeeklyMeetingDraft=>({schemaVersion:4,candidatesConfirmed:true,situation:'衡量',strategy:'动作',coreConclusion:'结论',nextAction:'行动',promotionSelections:['p'],promotionInputs,issues:[],nonPromotionSelections:[]});

test('总点击除以总曝光，排除原统计区间之外的首尾零值日，不平均百分比',()=>{
 const card={key:'p',facts:[fact('01',9999,999,'0'),fact('02',100,10),fact('03',900,9),fact('04',null,null,'0')]};
 const result=meetingClickRate(card);assert.equal(result.clickRate,1.9);assert.deepEqual(result.basis,{mode:'auto',impressionCount:1000,clickCount:19,missingDates:[]});
 const normalized=reconcileClickRateRanges({p:input},[card],[card]);assert.equal(normalized.p.clickRate,1.9);assert.equal(normalized.p.rateNeedsReview,false);assert.equal(normalized.p.currentSituation,input.currentSituation);assert.equal(normalized.p.activeAction,input.activeAction);assert.equal(normalized.p.confirmed,true);
 assert.equal(meetingFinalizationIssue(draft(normalized),'pre',[]),undefined);assert(meetingDraftSchema.safeParse(draft(normalized)).success);
});

test('真实0点击保持0%，零曝光和无有效区间为未知，确认定稿不强填',()=>{
 for(const card of [{key:'p',facts:[fact('01',100,0)]},{key:'p',facts:[fact('01',0,0)]},{key:'p',facts:[fact('01',100,0,'0')]}]){
  const values=reconcileClickRateRanges({},[],[card]),rate=values.p;
  assert.equal(rate.clickRate,card.facts[0].impressionCount===100&&card.facts[0].spend!=='0'?0:null);
  assert.equal(meetingFinalizationIssue(draft(values),'pre',[]),undefined);
 }
});

test('缺失日期必须完整列出，不把0与缺失混同；手填按原区间保留',()=>{
 const card={key:'p',facts:[fact('01',100,0),fact('02',null,0),fact('03',0,null),fact('04',null,null)]};
 const calc=meetingClickRate(card);assert.equal(calc.clickRate,null);assert.equal(calc.basis.mode,'manual');assert.deepEqual(calc.basis.missingDates,['2026-10-02','2026-10-03','2026-10-04']);
 assert.equal(missingClickRateDateRanges([...calc.basis.missingDates,'2026-10-07','2026-10-02']),'2026-10-02 至 2026-10-04、2026-10-07');
 const values=reconcileClickRateRanges({},[],[card]);assert.equal(meetingFinalizationIssue(draft(values),'pre',[])?.target.kind,'promotion');
 values.p.clickRate=0;values.p.confirmed=true;values.p.rateRange={from:'2026-10-01',through:'2026-10-04'};const kept=reconcileClickRateRanges(values,[card],[card]);assert.equal(kept.p.clickRate,0);assert.equal(kept.p.confirmed,true);assert.equal(meetingFinalizationIssue(draft(kept),'pre',[]),undefined);
 const extended={...card,facts:[...card.facts,fact('07',null,null)]},changed=reconcileClickRateRanges(kept,[card],[extended]);assert.equal(changed.p.clickRate,0);assert.equal(changed.p.rateNeedsReview,true);assert.equal(changed.p.confirmed,false);
});

test('补齐计数后恢复自动，计数更正即时重算；自动来源退回缺数不冒充人工值',()=>{
 const partial={key:'p',facts:[fact('01',null,null)]};
 const manual=reconcileClickRateRanges({p:input},[],[partial]);
 const complete={key:'p',facts:[fact('01',100,5)]},automatic=reconcileClickRateRanges(manual,[partial],[complete]);assert.equal(automatic.p.clickRate,5);assert.equal(automatic.p.clickRateBasis?.mode,'auto');
 const revised={key:'p',facts:[fact('01',200,5)]};assert.equal(reconcileClickRateRanges(automatic,[complete],[revised]).p.clickRate,2.5);
 const missing=reconcileClickRateRanges(automatic,[complete],[partial]);assert.equal(missing.p.clickRate,null);assert.equal(missing.p.confirmed,false);assert.equal(missing.p.currentSituation,input.currentSituation);
});

test('未登记的必需日期纳入缺失依据，不凭空补造其他日期',()=>{
 const card={key:'p',facts:[fact('01',100,5),fact('04',100,5)],missingDates:['2026-10-02']};
 assert.deepEqual(meetingClickRate(card).basis.missingDates,['2026-10-02']);
});
