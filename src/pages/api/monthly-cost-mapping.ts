import type {APIRoute} from 'astro';
export const prerender=false;
const retired:APIRoute=async()=>Response.json({message:'推广用途配置已移至系统设置，请进入业务配置。'},{status:410});
export const GET=retired,PATCH=retired;
