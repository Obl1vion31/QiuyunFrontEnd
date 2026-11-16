import type {APIRoute} from 'astro';
import {readJuguangDailyPreview} from '../../../integrations/juguang-daily';
import {JuguangError} from '../../../integrations/xiaohongshu-juguang';
import {WorkflowError} from '../../../db/schedule-workflow';
export const prerender=false;
export const GET:APIRoute=async({url,locals})=>{
  if(!locals.user || !locals.session)return Response.json({message:'请先登录。'},{status:401});
  try{return Response.json(await readJuguangDailyPreview(url.searchParams.get('date')??'',locals.session.id),{headers:{'Cache-Control':'private, no-store'}});}
  catch(error){
    if(error instanceof WorkflowError || error instanceof JuguangError)return Response.json({message:error.message},{status:error.status});
    console.error('Juguang daily preview unavailable');
    return Response.json({message:'聚光报表暂时不可用，原数据已保留，请稍后重试。'},{status:503});
  }
};
