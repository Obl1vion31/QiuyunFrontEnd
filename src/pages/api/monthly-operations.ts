import type {APIRoute} from 'astro';
import {getDb} from '../../db/client';
import {monthlyQuery,readMonthlyOperations} from '../../db/monthly-operations';
import {ZodError} from 'zod';
export const prerender=false;
export const GET:APIRoute=async({url})=>{
 try{return Response.json(await readMonthlyOperations(getDb(),monthlyQuery(url.searchParams)));}
 catch(error){
  if(error instanceof ZodError)return Response.json({message:'请选择有效月份与筛选条件。'},{status:422});
  console.error('monthly operations read failed',error);
  return Response.json({message:'月度数据读取失败，请重试。'},{status:503});
 }
};
