import type {PromotionContext} from './promotion-state.mjs';
import {campaignPauseWindows,campaignWaitWindows,dateInWindows,promotionStateOn} from './promotion-state.mjs';
type Campaign=NonNullable<PromotionContext['campaigns']>[number];
/** 日度队列与例会完整性使用同一组应填日期，保留旧暂停窗口的兼容边界。 */
export function requiredPromotionStage(campaign:Campaign,context:PromotionContext,date:string):string|null{
 const windows=[...campaignPauseWindows(campaign,context),...campaignWaitWindows(campaign,context),...context.holds.filter(row=>row.campaignId===campaign.id)];
 if(dateInWindows(date,windows))return null;
 const state=promotionStateOn(campaign,context,date);
 const terminal=context.stateChanges?.find(row=>row.campaignId===campaign.id&&row.businessDate===date&&!row.meetingDecision&&['test_discarded','formal_discarded','ended'].includes(row.actualStatus??''));
 return state?.currentStage??terminal?.stageType??null;
}
