import type {WeeklyMeetingDraft} from './schema';
import type {Discussion} from './meeting-discussion';
export function discussionFromDraft(draft:WeeklyMeetingDraft):Discussion{return {coreConclusion:draft.coreConclusion,nextAction:draft.nextAction,situation:draft.situation??'',strategy:draft.strategy??'',promotionInputs:Object.fromEntries(Object.entries(draft.promotionInputs).map(([key,input])=>[key,{currentSituation:input.currentSituation,activeAction:input.activeAction}])),promotionDecisions:(draft.promotionDecisions??{}) as Discussion['promotionDecisions'],issues:draft.issues};}
