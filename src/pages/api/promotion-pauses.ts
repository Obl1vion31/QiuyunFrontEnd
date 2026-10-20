import type {APIRoute} from 'astro';
export const prerender=false;
/** 旧页面不能再次创建或修改已停用的团队暂停。 */
const retired:APIRoute=()=>Response.json({message:'团队暂停功能已移除，请在帖子内处理当日安排。'},{status:410});
export const GET=retired;
export const POST=retired;
export const PATCH=retired;
