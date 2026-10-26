import {nextDateKey,shanghaiDateKey} from './promotion-rules.mjs';
export function meetingEffectiveOn(meeting:{meetingAt:Date|string},versions:Array<{snapshot:any;versionNumber:number}>){
 const ordered=[...versions].sort((a,b)=>a.versionNumber-b.versionNumber);
 return ordered.find(v=>v.snapshot.finalizationStage==='post'&&v.snapshot.decisionEffectiveOn)?.snapshot.decisionEffectiveOn??ordered.find(v=>v.snapshot.decisionEffectiveOn)?.snapshot.decisionEffectiveOn??nextDateKey(shanghaiDateKey(new Date(meeting.meetingAt))); 
}
export const meetingArrangementsExpired=(effectiveOn:string,now=new Date())=>shanghaiDateKey(now)>=effectiveOn;
export function latestValidMeetingVersion<T extends {versionNumber:number;invalidatedAt?:Date|null}>(versions:T[]){return [...versions].filter(v=>!v.invalidatedAt).sort((a,b)=>b.versionNumber-a.versionNumber)[0];}

/** 早期定稿在落库事项编号前保存；仅为最新版本关联同一会议已持久化的编号。 */
export function meetingVersionDraft(snapshot:any,currentDraft:any){
 const draft=structuredClone(snapshot.draft);
 draft.issues=(draft.issues??[]).map((issue:any)=>issue.id?issue:{...issue,...((currentDraft?.issues??[]).find((i:any)=>i.id&&i.problem===issue.problem&&i.conclusion===issue.conclusion&&i.status===issue.status)?.id?{id:currentDraft.issues.find((i:any)=>i.id&&i.problem===issue.problem&&i.conclusion===issue.conclusion&&i.status===issue.status).id}:{})});
 return draft;
}
