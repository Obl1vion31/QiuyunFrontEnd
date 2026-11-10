/** 仅隔离测试的上游协议夹具，实际页面、路由、加密与数据库均运行正式实现。 */
import {readFile,appendFile} from 'node:fs/promises';
if(process.env.NODE_ENV!=='test'||!new URL(process.env.DATABASE_URL).pathname.startsWith('/qiuyun_test_'))throw new Error('ISOLATED_TEST_ONLY');
const original=globalThis.fetch;
globalThis.fetch=async(input,init)=>{
 const url=String(input);
 if(!url.startsWith('https://adapi.xiaohongshu.com/'))return original(input,init);
 const scenario=JSON.parse(await readFile(process.env.JUGUANG_SCENARIO_FILE,'utf8'));
 const refresh=url.endsWith('/refresh_token');
 const body=JSON.parse(init.body);
 await appendFile(process.env.JUGUANG_SCENARIO_FILE+'.calls',JSON.stringify({refresh,advertiserId:body.advertiser_id})+'\n');
 while(JSON.parse(await readFile(process.env.JUGUANG_SCENARIO_FILE,'utf8')).hold){if(init.signal?.aborted)throw new DOMException('Test timeout','TimeoutError');await new Promise(resolve=>setTimeout(resolve,50));}
 if(scenario.delay)await new Promise((resolve,reject)=>{const timer=setTimeout(resolve,scenario.delay);init.signal?.addEventListener('abort',()=>{clearTimeout(timer);reject(new DOMException('Test timeout','TimeoutError'));},{once:true});});
 if(scenario.network)throw new TypeError('Test network unavailable');
 if(refresh){
  if(scenario.refreshFailure)return Response.json({code:scenario.refreshFailure,success:false});
  return Response.json({code:0,success:true,data:{access_token:'fictional-refreshed-access',refresh_token:'fictional-refreshed-refresh',access_token_expires_in:86400,refresh_token_expires_in:2592000,user_id:'fictional-upstream',platform_type:1,app_id:42,scope:'["report_service"]'}});
 }
 const code=scenario.expiredAccess && init.headers['Access-Token']!=='fictional-refreshed-access'?410020:scenario.accountErrors?.[body.advertiser_id];
 return Response.json(code?{code,success:false}:{code:0,success:true,data:{total_count:0,data_list:[]}});
};
await import(new URL('../'+(process.env.JUGUANG_APP_ENTRY||'.tools/serve-vercel.mjs'),import.meta.url));
