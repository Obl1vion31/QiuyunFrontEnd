/** 会中只合并白名单文字；所有指标和非推广内容来自服务端冻结版本。 */
import {z} from 'zod';
import type {WeeklyMeetingDraft} from './schema';
import {WorkflowError} from './schedule-workflow';
const text=z.string().max(10000);
export const discussionSchema=z.object({coreConclusion:text,nextAction:text,situation:text,strategy:text,promotionInputs:z.record(z.string(),z.object({currentSituation:text,activeAction:text}).strict()),promotionDecisions:z.record(z.string(),z.enum(['restart_testing','testing','test_paused','test_pending','scaling','scaling_paused','test_discarded','formal_discarded','ended'])),issues:z.array(z.object({id:z.uuid().optional(),problem:z.string().max(2000),conclusion:text,status:z.enum(['pending','validating','resolved','paused'])}).strict()).max(100)}).strict();
export type Discussion=z.infer<typeof discussionSchema>;
export function mergeDiscussion(snapshot:any,input:Discussion,sourceVersionId:string):WeeklyMeetingDraft{
 const draft:WeeklyMeetingDraft=structuredClone(snapshot.draft),cards=snapshot.generated?.promotions??[];
 const keys=new Set(cards.map((c:any)=>c.key)),campaigns=new Set(cards.filter((c:any)=>!c.testCycleEndedOn).map((c:any)=>c.campaignId));
 if(Object.keys(input.promotionInputs).some(k=>!keys.has(k))||Object.keys(input.promotionDecisions).some(k=>!campaigns.has(k)))throw new WorkflowError('讨论内容与会前版本不匹配，请重新打开。',422);
 const ids=input.issues.flatMap(i=>i.id?[i.id]:[]);
 if(new Set(ids).size!==ids.length)throw new WorkflowError('事项引用不能重复。',422);
 const issues=new Set(draft.issues.flatMap(i=>i.id?[i.id]:[]));
 if(input.issues.some(i=>i.id&&!issues.has(i.id))||draft.issues.some(i=>i.id&&!input.issues.some(next=>next.id===i.id)))throw new WorkflowError('已有事项必须通过已解决状态结束跟进。',422);
 const next={...draft,...input,discussionSourceVersionId:sourceVersionId,hasRevisionDraft:true,promotionInputs:{...draft.promotionInputs}};
 for(const [key,writing]of Object.entries(input.promotionInputs))next.promotionInputs[key]={...draft.promotionInputs[key],...writing};
 return next;
}
