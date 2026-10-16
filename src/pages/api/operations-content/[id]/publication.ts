/** 实发登记：独立于预约，真实时间、帖子链接、延期原因和历史原子保存。 */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { getDb } from '../../../../db/client';
import { reasonSchema } from '../../../../db/schedule-workflow';
import { workflowErrorResponse } from '../../../../db/workflow-api';
import { registerPublication } from '../../../../db/publication-workflow';
import { issuesByField, publicationInputFromForm, publicationSchema } from '../../../../db/validation';
export const prerender=false;
export const PATCH: APIRoute = async({params,request,url,locals})=>{
  if(request.headers.get('origin')!==url.origin)return Response.json({message:'拒绝跨站写入。'},{status:403});
  let form:FormData;try{form=await request.formData()}catch{return Response.json({message:'请求必须使用有效表单。'},{status:400})}
  const parsed=publicationSchema.safeParse(publicationInputFromForm(form));
  if(!parsed.success)return Response.json({message:'请检查实发登记。',fields:issuesByField(parsed.error.issues)},{status:422});
  let reasons;try{reasons=z.array(reasonSchema).parse(JSON.parse(String(form.get('dailyReasons')||'[]')))}catch{return Response.json({message:'请检查逐日延期理由。'},{status:422})}
  try {
    const result=await registerPublication(getDb(),params.id!,parsed.data,reasons,form.get('confirmPromotionReset')==='1',locals.user!);
    if(result.kind==='reset-required')return Response.json({message:'更正实发时间会重置这条排期的推广活动、日度事实及待定区间。',resetRequired:true,impact:{campaigns:result.campaigns,dailyMetrics:result.dailyMetrics}},{status:409});
    return Response.json({ok:true});
  }catch(error){return workflowErrorResponse(error)}
};
