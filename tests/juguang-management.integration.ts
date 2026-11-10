import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {startPostgresFixture} from './postgres.fixture';
import {admin,employee} from './auth.fixture';
import {withDatabase} from '../src/db/client';
import {saveJuguangConnection,decryptJuguangTokens} from '../src/integrations/xiaohongshu-juguang';
import {xiaohongshuJuguangConnection as connections} from '../src/db/schema';
process.env.NODE_ENV='test';process.env.XHS_JUGUANG_APP_ID='42';process.env.XHS_JUGUANG_APP_SECRET='fictional-app-secret';process.env.BETTER_AUTH_SECRET='fictional-browser-secret-at-least-32-characters';
const directory=await mkdtemp(join(tmpdir(),'juguang-management-'));const scenario=join(directory,'scenario.json');
process.env.JUGUANG_SCENARIO_FILE=scenario;await writeFile(scenario,'{}');await writeFile(scenario+'.calls','');
const fixture=await startPostgresFixture({entry:'tests/juguang-server.fixture.mjs'});
const db=fixture.db;const base=fixture.baseURL;
async function login(account:typeof admin|typeof employee){const r=await fetch(base+'/api/auth/sign-in/username',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify(account)});assert.equal(r.status,200);const cookie=r.headers.getSetCookie().map(s=>s.split(';')[0]).join('; ');const user=await(await fetch(base+'/api/auth/get-session',{headers:{Cookie:cookie}})).json();return{cookie,id:user.user.id};}
const path='/api/integrations/xiaohongshu/check';
async function post(cookie:string,origin=base,body:unknown={authorizationUserId:'fictional-upstream'}){return fetch(base+path,{method:'POST',headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify(body)});}
async function mode(value:unknown){await writeFile(scenario,JSON.stringify(value));await writeFile(scenario+'.calls','');}
async function calls(){return(await readFile(scenario+'.calls','utf8')).trim().split('\n').filter(Boolean).map(s=>JSON.parse(s));}
try{
 const boss=await login(admin),staff=await login(employee);
 assert.equal((await post('')).status,401);assert.equal((await post(staff.cookie)).status,403);assert.equal((await post(boss.cookie,'https://untrusted.example')).status,403);assert.equal((await post(boss.cookie,base,{})).status,400);assert.equal((await post(boss.cookie)).status,404);
 assert.equal((await fetch(base+'/business/settings?view=integrations',{headers:{Cookie:staff.cookie}})).status,403);
 const token={access_token:'fictional-access',refresh_token:'fictional-refresh',access_token_expires_in:86400,refresh_token_expires_in:2592000,user_id:'fictional-upstream',platform_type:1 as const,scope:'["report_service"]',approval_advertisers:[{advertiser_id:11,advertiser_name:'隔离验收账户一'},{advertiser_id:22,advertiser_name:'隔离验收账户二'}]};
 await withDatabase(db,()=>saveJuguangConnection(token,'42',boss.id));
 let response=await post(boss.cookie);assert.equal(response.status,200);let check=(await response.json()).check;assert.equal(check.status,'ok');assert.equal(check.accounts.length,2,'空报表验证读取成功');
 let [stored]=await db.select().from(connections);assert.equal(stored.lastCheck?.status,'ok');assert.ok(!(await(await fetch(base+'/api/integrations/xiaohongshu/status',{headers:{Cookie:boss.cookie}})).text()).includes('fictional-access'));
 await mode({accountErrors:{22:410027}});response=await post(boss.cookie);assert.equal((await response.json()).check.status,'partial');
 await mode({network:true});response=await post(boss.cookie);assert.equal((await response.json()).check.status,'failed');
 await mode({});await db.update(connections).set({accessTokenExpiresAt:new Date(0)});
 response=await post(boss.cookie);assert.equal((await response.json()).check.status,'ok');assert.equal((await calls()).filter(c=>c.refresh).length,1);
 [stored]=await db.select().from(connections);assert.equal(decryptJuguangTokens(stored.encryptedTokens,'42:fictional-upstream').refreshToken,'fictional-refreshed-refresh');
 await withDatabase(db,()=>saveJuguangConnection(token,'42',boss.id));await db.update(connections).set({accessTokenExpiresAt:new Date(0)});await mode({accountErrors:{11:410029,22:410029}});
 response=await post(boss.cookie);assert.equal((await response.json()).check.status,'failed');[stored]=await db.select().from(connections);assert.equal(decryptJuguangTokens(stored.encryptedTokens,'42:fictional-upstream').accessToken,'fictional-refreshed-access','报表失败不回滚刷新结果');
 await withDatabase(db,()=>saveJuguangConnection(token,'42',boss.id));await mode({expiredAccess:true});response=await post(boss.cookie);assert.equal((await response.json()).check.status,'ok');assert.equal((await calls()).filter(c=>c.refresh).length,1);
 await withDatabase(db,()=>saveJuguangConnection(token,'42',boss.id));await db.update(connections).set({accessTokenExpiresAt:new Date(0)});await mode({refreshFailure:410017});response=await post(boss.cookie);assert.equal((await response.json()).check.status,'reauthorize');
 await withDatabase(db,()=>saveJuguangConnection(token,'42',boss.id));await db.update(connections).set({accessTokenExpiresAt:new Date(0)});await mode({delay:700});
 const first=post(boss.cookie);await new Promise(r=>setTimeout(r,250));const second=await post(boss.cookie);assert.equal(second.status,409);assert.equal((await(await first).json()).check.status,'ok');assert.equal((await calls()).filter(c=>c.refresh).length,1,'竞争中只轮换一次令牌');
 await withDatabase(db,()=>saveJuguangConnection(token,'42',boss.id));[stored]=await db.select().from(connections);assert.equal(stored.lastCheck,null,'重授权清除旧摘要');
 const html=await(await fetch(base+'/business/settings?view=integrations',{headers:{Cookie:boss.cookie}})).text();assert.match(html,/推广复盘的数据边界/);assert.match(html,/尚未自动带入/);assert.ok(!html.includes('fictional-access')&&!html.includes('fictional-refresh'));
 console.log('通过：管理员／同源门禁、空报表、部分异常、断网、过期刷新、上游失效重试、刷新后失败保持、失效重授权、真实 PostgreSQL 并发锁、重授权清理与 SSR 用途边界。');
}catch(error){console.error(fixture.logs().slice(-2000));throw error;}finally{await fixture.stop();}
