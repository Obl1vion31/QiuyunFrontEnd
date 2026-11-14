import type {PromotionContext} from './promotion-state.mjs';
import {campaignPauseWindows,campaignWaitWindows,dateInWindows,promotionStateOn} from './promotion-state.mjs';
type Campaign=NonNullable<PromotionContext['campaigns']>[number];
/** 日度队列与例会完整性使用同一组应填日期，保留旧暂停窗口的兼容边界。 */
export function requiredPromotionStage(campaign:Campaign,context:PromotionContext,date:string):string|null{
 const windows=[...campaignPauseWindows(campaign,context),...campaignWaitWindows(campaign,context),...context.holds.filter(row=>row.campaignId===campaign.id)];
 if(dateInWindows(date,windows))return null;
 const state=promotionStateOn(campaign,context,date);
 if(!state)return null;
 if(state.currentStage)return state.currentStage;
 // 当天才结束的活动仍需收尾；重复的结束状态不能延长原收尾日期。
 if(state.endedOn!==date||!['test_discarded','formal_discarded','ended'].includes(state.currentStatus))return null;
 // 归属原测试／放量阶段；暂停期间可能尚未形成投放区间，不能据此漏掉收尾。
 return context.stateChanges?.find(row=>row.campaignId===campaign.id&&row.businessDate===date&&!row.meetingDecision&&row.actualStatus===state.currentStatus)?.stageType
  ??state.stages.at(-1)?.stageType??campaign.initialStage??null;
}
