import type {APIRoute} from 'astro';
import {randomUUID} from 'node:crypto';
import {eq} from 'drizzle-orm';
import {getDb} from '../../../db/client';
import {permissionErrorResponse} from '../../../auth/permissions';
import {WorkflowError} from '../../../db/schedule-workflow';
import {lockPromotionWorkflow} from '../../../db/promotion-pauses';
import {saveHistoricalPromotionDay} from '../../../db/promotion-day-edit';
import {promotionDailyUpdateSchema,promotionDailyUpdateInputFromForm} from '../../../db/promotion-validation';
import * as s from '../../../db/schema';
export const prerender=false;
export const PATCH:APIRoute=async({request,url,params,locals})=>{
 if(request.headers.get('origin')!==url.origin)return new Response('拒绝跨站写入。',{status:403});
 let form:FormData;try{form=await request.formData();}catch{return Response.json({message:'请求必须使用有效的表单格式。'},{status:400});}
 const parsed=promotionDailyUpdateSchema.safeParse(promotionDailyUpdateInputFromForm(form));
 if(!parsed.success)return Response.json({message:'请检查日度数据。',fields:Object.fromEntries(parsed.error.issues.map(i=>[String(i.path[0]??'form'),[i.message]]))},{status:422});
 try{
  const data=parsed.data;
  if(data.changeDayStatus){
   if(!data.dayStatus)throw new WorkflowError('请选择当天的安排。',422);
   const result=await saveHistoricalPromotionDay(getDb(),{metricId:params.id!,targetStatus:data.dayStatus,requestKey:data.requestKey,fingerprint:data.fingerprint,confirmDayContext:data.confirmDayContext,contextFingerprint:data.contextFingerprint,values:{spend:data.spend,platformOpenCount:data.platformOpenCount,actualOpenCount:data.actualOpenCount,platformLeadCount:data.platformLeadCount,actualLeadCount:data.actualLeadCount,note:data.note}},locals.user!);
   return Response.json(result,{status:'contextRequired' in result?409:200});
  }
  const result=await getDb().transaction(async tx=>{
   await lockPromotionWorkflow(tx);
   const [existing]=await tx.select().from(s.operationsPromotionDailyMetric).where(eq(s.operationsPromotionDailyMetric.id,params.id!));
   if(!existing)throw new WorkflowError('没有找到这一天的复盘记录。',404);
   const [campaign]=await tx.select().from(s.operationsPromotionCampaign).where(eq(s.operationsPromotionCampaign.id,existing.campaignId));
   if(!campaign)throw new WorkflowError('没有找到推广活动。',404);
   const values={spend:data.spend.toFixed(2),platformOpenCount:data.platformOpenCount,actualOpenCount:data.actualOpenCount,platformLeadCount:data.platformLeadCount,actualLeadCount:data.actualLeadCount,note:data.note??null};
   const signature=JSON.stringify({metricId:existing.id,...values});
   if(data.requestKey){
    const [repeat]=await tx.select().from(s.operationsPromotionTimelineAudit).where(eq(s.operationsPromotionTimelineAudit.requestKey,data.requestKey));
    if(repeat){if(repeat.changedById!==locals.user!.id||repeat.after.metricValuesSignature!==signature)throw new WorkflowError('请求编号已被使用，请重新保存。',422);return {ok:true,repeated:true};}
   }
   // 旧历史表单不能继续用“次日安排”改变其他日期；新表单的隐藏旧值不覆盖当前状态。
   if(data.dayStatus===undefined&&data.reviewDecision!==existing.reviewDecision)throw new WorkflowError('历史编辑已改为“当日安排”。请刷新后编辑当天状态，当前输入已保留。',422);
   const [saved]=await tx.update(s.operationsPromotionDailyMetric).set({...values,updatedAt:new Date(Math.max(Date.now(),existing.updatedAt.getTime()+1))}).where(eq(s.operationsPromotionDailyMetric.id,existing.id)).returning();
   await tx.insert(s.operationsPromotionTimelineAudit).values({scheduleId:campaign.scheduleId,requestKey:data.requestKey??randomUUID(),businessDate:existing.metricDate,action:'metric_values',reason:data.note?.trim()||'更正日度指标',before:{metrics:[existing]},after:{metrics:[saved],metricId:existing.id,metricValuesSignature:signature},changedById:locals.user!.id,changedByLabel:locals.user!.username});
   return {ok:true,deleted:0};
  });
  return Response.json(result);
 }catch(error){
  const denied=permissionErrorResponse(error);if(denied)return denied;
  if(error instanceof WorkflowError)return Response.json({message:error.message,...(error.code?{code:error.code}:{})},{status:error.status});
  console.error('promotion daily update failed',error);return Response.json({message:'当天数据保存失败，请稍后重试。'},{status:503});
 }
};
