import {nextDateKey,previousDateKey} from './promotion-rules.mjs';
/** 轮次由明确的复测动作划分，暂停和恢复不产生新轮次。 */
export function testingCycles(campaign,context,through='9999-12-31'){
 const starts=[...new Set([campaign.startedOn,...(context.metrics??[]).filter(m=>m.campaignId===campaign.id&&m.reviewDecision==='restart_testing').map(m=>nextDateKey(m.metricDate)),...(context.stateChanges??[]).filter(c=>c.campaignId===campaign.id&&c.action==='restart_testing').map(c=>c.businessDate),...(context.waitRanges??[]).filter(r=>r.campaignId===campaign.id&&r.nextDecision==='restart_testing'&&r.nextEffectiveOn).map(r=>r.nextEffectiveOn)])].filter(d=>d<=through).sort();
 return starts.map((startedOn,i)=>({startedOn,endedOn:starts[i+1]?previousDateKey(starts[i+1]):null,number:i+1}));
}
export const testingCycleOn=(campaign,context,date)=>testingCycles(campaign,context,date).at(-1);
export const meetingDecisionSelection=decision=>decision.action==='restart_testing'?'restart_testing':decision.targetStatus;
