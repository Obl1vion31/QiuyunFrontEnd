import {z} from 'zod';
import type {APIRoute} from 'astro';
import {readJuguangDailyPreview} from '../../../integrations/juguang-daily';
import {JuguangError} from '../../../integrations/xiaohongshu-juguang';
import {WorkflowError} from '../../../db/schedule-workflow';
export const prerender=false;
export const GET:APIRoute=async({url,locals})=>{
  if(!locals.user || !locals.session)return Response.json({message:'请先登录。'},{status:401});
  const campaigns=z.array(z.uuid()).max(200).safeParse(url.searchParams.getAll('campaignId'));
  if(!campaigns.success)return Response.json({message:'推广活动参数无效。'},{status:422});
  const drafts=z.record(z.uuid(),z.string().regex(/^[a-f0-9]{24}$/i).transform(v=>v.toLowerCase())).safeParse(Object.fromEntries([...url.searchParams].filter(([k])=>k.startsWith('noteId:')).map(([k,v])=>[k.slice(7),v])));
  if(!drafts.success||Object.keys(drafts.data).some(id=>!campaigns.data.includes(id)))return Response.json({message:'待补笔记 ID 参数无效。'},{status:422});
  try{return Response.json(await readJuguangDailyPreview(url.searchParams.get('date')??'',locals.session.id,campaigns.data,drafts.data),{headers:{'Cache-Control':'private, no-store'}});}
  catch(error){
    if(error instanceof WorkflowError || error instanceof JuguangError)return Response.json({message:error.message,...(error instanceof JuguangError?{code:error.code}:{})},{status:error.status});
    console.error('Juguang daily preview unavailable');
    return Response.json({message:'聚光报表暂时不可用，原数据已保留，请稍后重试。'},{status:503});
  }
};
