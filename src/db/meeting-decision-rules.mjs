import {nextActualPromotionState,promotionNextOptions} from './promotion-successors.mjs';
export const meetingNextDecision=(status,target)=>target==='restart_testing'?(status==='test_pending'?'restart_testing':null):promotionNextOptions(status).find(o=>o.value!=='restart_testing'&&nextActualPromotionState(status,o.value)===target)?.value??null;
export function meetingDecisionOn(decisions,campaignId,date){
 return decisions.filter(d=>d.campaignId===campaignId&&d.effectiveOn===date).at(-1)??null;
}

/** 同日会后修订整体替换；不同生效日保留。更正仅影响发生时的版本。 */
export function resolveMeetingDecisions(versions, corrections) {
 const events=[...versions.map(row=>({at:new Date(row.createdAt).getTime(),order:0,row})),...corrections.map(row=>({at:new Date(row.createdAt).getTime(),order:1,correction:row}))].sort((a,b)=>a.at-b.at||a.order-b.order);
 const active=new Map();
 for(const event of events){
  if(event.row){
   if(event.row.invalidatedAt)continue;
   const snapshot=event.row.snapshot;
   if(snapshot.decisionPolicy==='reset'){for(const [key,d] of active)if(d.meetingId===event.row.meetingId&&d.effectiveOn===snapshot.decisionEffectiveOn)active.delete(key);continue;}
   if(snapshot.finalizationStage!=='post'||snapshot.decisionPolicy==='inherit')continue;
   const effectiveOn=snapshot.decisionEffectiveOn;
   if(effectiveOn)for(const [key,decision] of active)if(decision.meetingId===event.row.meetingId&&decision.effectiveOn===effectiveOn)active.delete(key);
   for(const decision of snapshot.generated?.meetingDecisions??[])active.set(decision.id,decision);
  }else{
   const decision=event.correction.after?.meetingDecision;
   if(decision&&active.get(decision.id)?.versionNumber===decision.versionNumber)active.set(decision.id,decision);
  }
 }
 return [...active.values()].sort((a,b)=>a.effectiveOn.localeCompare(b.effectiveOn));
}
