import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {startPostgresFixture} from './postgres.fixture';
import {admin} from './auth.fixture';
import {withDatabase} from '../src/db/client';
import {saveJuguangConnection,decryptJuguangTokens} from '../src/integrations/xiaohongshu-juguang';
import {xiaohongshuJuguangConnection as connections} from '../src/db/schema';
process.env.NODE_ENV='test';process.env.XHS_JUGUANG_APP_ID='42';process.env.XHS_JUGUANG_APP_SECRET='fictional-app-secret';process.env.BETTER_AUTH_SECRET='fictional-browser-secret-at-least-32-characters';process.env.CRON_SECRET='fictional-cron-secret-at-least-32-characters';
const directory=await mkdtemp(join(tmpdir(),'juguang-renewal-'));const scenario=join(directory,'scenario.json');process.env.JUGUANG_SCENARIO_FILE=scenario;
await writeFile(scenario,'{}');await writeFile(scenario+'.calls','');
const fixture=await startPostgresFixture({entry:'tests/juguang-server.fixture.mjs'});const db=fixture.db,base=fixture.baseURL,path='/api/cron/juguang-renewal';
async function mode(value:unknown){await writeFile(scenario,JSON.stringify(value));await writeFile(scenario+'.calls','');}
async function calls(){return(await readFile(scenario+'.calls','utf8')).trim().split('\n').filter(Boolean).map(s=>JSON.parse(s));}
const invoke=(secret=process.env.CRON_SECRET!,method='GET')=>fetch(base+path,{method,headers:{Authorization:'Bearer '+secret,Origin:base}});
try{
 const output=JSON.parse(await readFile('.vercel/output/config.json','utf8'));const configuration=JSON.parse(await readFile('vercel.json','utf8'));assert.deepEqual(output.crons,configuration.crons,'实际发布产物必须携带三个定时配置');
 const login=await fetch(base+'/api/auth/sign-in/username',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify(admin)});assert.equal(login.status,200);const cookie=login.headers.getSetCookie().map(s=>s.split(';')[0]).join('; ');
 const session=await(await fetch(base+'/api/auth/get-session',{headers:{Cookie:cookie}})).json();
 const token={access_token:'fictional-access',refresh_token:'fictional-refresh',access_token_expires_in:86400,refresh_token_expires_in:2592000,user_id:'fictional-upstream',platform_type:1 as const,scope:'["report_service"]',approval_advertisers:[{advertiser_id:11,advertiser_name:'隔离续期测试账户'}]};
 const reset=async()=>{await withDatabase(db,()=>saveJuguangConnection(token,'42',session.user.id));await mode({});};
 assert.equal((await fetch(base+path)).status,401);assert.equal((await fetch(base+path,{headers:{Cookie:cookie}})).status,401);assert.equal((await invoke('incorrect')).status,401);assert.equal((await invoke(process.env.CRON_SECRET,'HEAD')).status,405);assert.equal((await invoke(process.env.CRON_SECRET,'POST')).status,405);assert.equal((await calls()).length,0);
 await reset();let response=await invoke();assert.equal(response.status,200);assert.equal((await response.json()).refreshed,0);assert.equal((await calls()).length,0,'未临近过期不轮换');
 await db.update(connections).set({accessTokenExpiresAt:new Date(Date.now()+15*3600_000)});response=await invoke();assert.equal(response.status,200);assert.equal((await response.json()).refreshed,1);
 let [stored]=await db.select().from(connections);assert.equal(stored.lastRenewal?.status,'ok');assert.equal(stored.lastCheck,null,'续期不冒充报表检查');assert.ok(stored.accessTokenExpiresAt.getTime()>Date.now()+23*3600_000);assert.ok(stored.refreshTokenExpiresAt.getTime()>Date.now()+29*86400_000);assert.equal(decryptJuguangTokens(stored.encryptedTokens,'42:fictional-upstream').refreshToken,'fictional-refreshed-refresh');assert.ok((await calls()).every(c=>c.refresh),'后台不读取报表');
 response=await invoke();assert.equal((await response.json()).refreshed,0);assert.equal((await calls()).length,1,'重复投递不再刷新');
 let status=await(await fetch(base+'/api/integrations/xiaohongshu/status',{headers:{Cookie:cookie}})).text();assert.ok(!status.includes('fictional-refreshed-access')&&!status.includes('fictional-refreshed-refresh'));assert.match(status,/lastRenewal/);
 await reset();await db.update(connections).set({accessTokenExpiresAt:new Date(0)});[stored]=await db.select().from(connections);const previous=stored.encryptedTokens;await mode({network:true});response=await invoke();assert.equal(response.status,503);[stored]=await db.select().from(connections);assert.equal(stored.encryptedTokens,previous);assert.equal(stored.lastRenewal?.status,'error');
 await mode({});assert.equal((await invoke()).status,200,'下次定时触发可恢复');
 await reset();await db.update(connections).set({accessTokenExpiresAt:new Date(0)});await mode({refreshFailure:410017});assert.equal((await invoke()).status,200);[stored]=await db.select().from(connections);assert.equal(stored.lastRenewal?.status,'reauthorize');let state=await(await fetch(base+'/api/integrations/xiaohongshu/status',{headers:{Cookie:cookie}})).json();assert.equal(state.connections[0].needsReauthorization,true);
 await reset();[stored]=await db.select().from(connections);assert.equal(stored.lastRenewal,null,'重新授权清除旧续期失败');
 await db.update(connections).set({accessTokenExpiresAt:new Date(0),refreshTokenExpiresAt:new Date(0)});await invoke();assert.equal((await calls()).length,0,'刷新令牌到期不请求上游');
 await reset();await db.update(connections).set({accessTokenExpiresAt:new Date(0),scope:'["report_service","ad_manage"]'});await invoke();assert.equal((await calls()).length,0,'不续期扩大后的权限');
 await reset();await db.update(connections).set({accessTokenExpiresAt:new Date(0)});await mode({hold:true});const first=invoke();
 for(let i=0;i<100 && !(await calls()).length;i++)await new Promise(r=>setTimeout(r,30));assert.equal((await calls()).length,1);
 assert.equal((await invoke()).status,409);assert.equal((await fetch(base+'/api/integrations/xiaohongshu/check',{method:'POST',headers:{Origin:base,Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({authorizationUserId:'fictional-upstream'})})).status,409);
 await writeFile(scenario,'{}');assert.equal((await first).status,200);assert.equal((await calls()).length,1,'真实 PostgreSQL 锁串行化后台与人工刷新');
 await invoke();assert.equal((await calls()).length,1);
 console.log('通过：无网页会话续期、Bearer门禁、方法限制、提前刷新、重复触发、有效期／新凭据保存、无报表读取、断网保留与恢复、失效重授权、只读scope、重授权清理、真实PostgreSQL与手动检查并发。');
}catch(error){console.error(fixture.logs().slice(-1800));throw error;}finally{await fixture.stop();}
