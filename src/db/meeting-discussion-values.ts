import type {WeeklyMeetingDraft} from './schema';
import type {Discussion} from './meeting-discussion';
export function discussionFromDraft(draft:WeeklyMeetingDraft):Discussion{return {nonPromotionNotes:draft.nonPromotionNotes??{},coreConclusion:draft.coreConclusion,nextAction:draft.nextAction,situation:draft.situation??'',strategy:draft.strategy??'',promotionInputs:Object.fromEntries(Object.entries(draft.promotionInputs).map(([key,input])=>[key,{currentSituation:input.currentSituation,activeAction:input.activeAction}])),promotionDecisions:(draft.promotionDecisions??{}) as Discussion['promotionDecisions'],issues:draft.issues};}

/** 比较业务内容，不把聚焦、对象键顺序、空占位或首尾空格当作新修订。 */
export function meetingValueKey(value:unknown):string{
 const normalize=(v:any):any=>Array.isArray(v)?v.map(normalize):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().filter(k=>v[k]!==undefined).map(k=>[k,normalize(v[k])])):typeof v==='string'?v.trim():v;
 return JSON.stringify(normalize(value));
}
export function meetingDiscussionKey(draft:WeeklyMeetingDraft):string{
 const values=discussionFromDraft(draft);
 values.nonPromotionNotes=Object.fromEntries(Object.entries(values.nonPromotionNotes??{}).filter(([,v])=>v.trim()));
 values.promotionInputs=Object.fromEntries(Object.entries(values.promotionInputs).filter(([,v])=>v.currentSituation?.trim()||v.activeAction?.trim()));
 values.issues=values.issues.filter(i=>i.id||i.problem.trim()||i.conclusion.trim()||i.status!=='pending');
 return meetingValueKey(values);
}
