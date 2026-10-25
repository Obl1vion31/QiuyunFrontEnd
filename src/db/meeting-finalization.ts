import type {WeeklyMeetingDraft} from './schema';

export type MeetingFinalizationTarget =
 | {kind:'candidates'}
 | {kind:'conclusion';field:'situation'|'strategy'|'coreConclusion'|'nextAction'}
 | {kind:'promotion';key:string}
 | {kind:'nonPromotion';key?:string}
 | {kind:'material'};
export interface MeetingFinalizationIssue {message:string;target:MeetingFinalizationTarget}

/** 编辑器先定位缺项，事务内用同一规则再次核对；保存草稿不受限制。 */
export function meetingFinalizationIssue(draft:WeeklyMeetingDraft,stage:'pre'|'post',pendingKeys:string[]):MeetingFinalizationIssue|undefined {
 if(!draft.candidatesConfirmed)return {message:'请先确认纳入本期候选。',target:{kind:'candidates'}};
 const fields=['situation','strategy','coreConclusion',...(stage==='post'?['nextAction' as const]:[])] as const;
 const labels={situation:'衡量情况',strategy:'本期具体动作',coreConclusion:'核心结论',nextAction:'下一步行动'};
 for(const field of fields)if(!String(draft[field]??'').trim())return {message:`请补充${labels[field]}。`,target:{kind:'conclusion',field}};
 for(const key of draft.promotionSelections??[])if(draft.promotionInputs[key]?.clickRate==null)return {message:'请补齐已纳入推广卡片的点击率。',target:{kind:'promotion',key}};
 for(const [key,input] of Object.entries(draft.nonPromotionInputs??{}))if(input.editing)return {message:'请先确认非推广卡片内的修改。',target:{kind:'nonPromotion',key}};
 if(pendingKeys.length)return {message:'请补齐本期应处理的非推广数据，或明确标记不复盘。',target:{kind:'nonPromotion',key:pendingKeys[0]}};
}
