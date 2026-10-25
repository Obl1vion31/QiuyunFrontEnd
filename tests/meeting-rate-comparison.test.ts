import {test} from 'node:test';
import assert from 'node:assert/strict';
import {rateComparison,rateDifference,promotionRateComparison} from '../src/db/meeting-rate-comparison';
import {discussionSchema,mergeDiscussion} from '../src/db/meeting-discussion';
test('同类包含本帖、零值与截止前全部样本，按稳定键去重且首二轮由调用层隔离',()=>{
 const b=rateComparison([{key:'a',through:'2026-10-21',clickRate:0,threeSecondReadRate:20},{key:'b',through:'2026-10-22',clickRate:10,threeSecondReadRate:40},{key:'b',through:'2026-10-22',clickRate:20,threeSecondReadRate:50},{key:'future',through:'2026-10-25',clickRate:99}], '2026-10-24');
 assert.equal(b.n,2);assert.equal(b.clickRate,10);assert.equal(b.threeSecondReadRate,35);assert.equal(rateDifference(0,b),-10);
 assert.equal(rateDifference(10,rateComparison([{key:'only',through:'2026-10-21',clickRate:10}],'2026-10-24')),null);
});
test('人工点击率确认后覆盖本轮旧样本，区间待核对与未知旧版本不补算',()=>{
 const row:any={key:'a',originKey:'a',sourceHash:'x',dataRange:{from:'2026-10-20',through:'2026-10-22'},rateAsOf:'2026-10-24',rateSamples:[{key:'a',through:'2026-10-21',clickRate:50},{key:'b',through:'2026-10-21',clickRate:10}]};
 const input:any={clickRate:0,confirmed:true,rateRange:row.dataRange};
 assert.equal(promotionRateComparison(row,input)?.clickRate,5);assert.equal(promotionRateComparison(row,{...input,rateNeedsReview:true})?.n,1);assert.equal(promotionRateComparison({...row,rateSamples:undefined},input),undefined);
});
test('讨论白名单拒绝指标和非推广注入，合并不修改冻结事实',()=>{
 const baseline:any={draft:{promotionInputs:{a:{clickRate:5,currentSituation:'原',activeAction:'原'}},issues:[],nonPromotionInputs:{n:{clickRate:8}}},generated:{promotions:[{key:'a',campaignId:'c'}]}};
 const writing:any={coreConclusion:'结论',nextAction:'行动',situation:'情况',strategy:'动作',promotionInputs:{a:{currentSituation:'新',activeAction:'新'}},promotionDecisions:{c:'test_paused'},issues:[]};
 assert.equal(discussionSchema.safeParse({...writing,clickRate:90}).success,false);assert.equal(discussionSchema.safeParse({...writing,promotionInputs:{a:{...writing.promotionInputs.a,clickRate:90}}}).success,false);
 const draft=mergeDiscussion(baseline,discussionSchema.parse(writing),'source');assert.equal(draft.promotionInputs.a.clickRate,5);assert.deepEqual(draft.nonPromotionInputs,baseline.draft.nonPromotionInputs);assert.equal(baseline.draft.promotionInputs.a.currentSituation,'原');
});
