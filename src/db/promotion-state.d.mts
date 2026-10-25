export interface PromotionWindow { startedOn: string; endedOn: string }
export interface PromotionPause { id: string; startsAt: Date | string; endsAt: Date | string; resumedAt?: Date | string | null }
export interface PromotionContext {
  meetingDecisions?:Array<import('./meeting-decisions').MeetingDecision>;
  stateChanges?: Array<{campaignId:string;businessDate:string;stageType:string;actualStatus?:string|null;reason?:string|null;meetingDecision?:boolean;action?:string}>;
  waitRanges?: Array<PromotionWindow & { id?: string; campaignId: string; stageType: string; nextDecision?: string | null; nextEffectiveOn?: string | null }>;
  campaigns?: PromotionCampaign[];
  metrics?: Array<{ campaignId: string; metricDate: string; dailyStatus: string; stageTypeSnapshot: string; reviewDecision: string;actualStatusSnapshot?:string|null;recordKind?:string;sourceStageStartedOn?:string|null }>;
  pauses: PromotionPause[];
  targets: Array<{ pauseId: string; campaignId: string }>;
  holds: Array<PromotionWindow & { campaignId: string; resumeStage: string; stageType: string; reason?: string }>;
}
export interface PromotionCampaign { id: string; startedOn: string; currentStatus: string; dailyReviewEnabledOn?:string; initialStage?: string; endedOn?: string | null }
export const promotionLabels: Record<string, string>;
export const pauseEnd: (pause: PromotionPause) => Date;
export const pauseIsActive: (pause: PromotionPause, now?: Date) => boolean;
export const fullPauseRange: (pause: PromotionPause) => PromotionWindow | null;
export const effectivePromotionStatus: (status: string, stage: string | null, campaignId: string | null, context: PromotionContext, now?: Date) => string;
export const campaignPauseWindows: (campaign: PromotionCampaign, context: PromotionContext) => PromotionWindow[];
export const campaignWaitWindows: (campaign: PromotionCampaign, context: PromotionContext) => PromotionWindow[];
export const promotionStateOn: (campaign: PromotionCampaign, context: PromotionContext, date?: string) => ReturnType<typeof import('./promotion-rules.mjs').replayPromotionHistory>;
export const promotionDayStatusEdit:(campaign:PromotionCampaign,context:PromotionContext,date:string)=>{currentStatus:string;originalStatus:string;originalStage:string|null;options:Array<{value:string;label:string}>}|null;
export const dateInWindows: (date: string, windows: PromotionWindow[]) => boolean;
export const nextReviewDate: (latestDate: string | undefined, startedOn: string, windows?: PromotionWindow[]) => string;
export const firstMissingPromotionDate: (metrics: Array<{metricDate:string}>, startedOn:string, windows?:PromotionWindow[]) => string;
export const countPromotionDays: (startedOn: string, endedOn: string, windows?: PromotionWindow[]) => number;
export const waitingPromotionDays: (campaign: PromotionCampaign, context: PromotionContext, waitingDates: string[], from: string, to: string) => number;
export const promotionReplayOptions: (campaign: PromotionCampaign, context: PromotionContext) => { initialStage: string; stateChanges: NonNullable<PromotionContext['stateChanges']>; waitRanges: NonNullable<PromotionContext['waitRanges']>; holds: Array<PromotionWindow & { resumeStage?: string; preserveWaiting?: boolean }> };
