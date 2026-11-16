import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,writeFile,readFile,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {eq} from 'drizzle-orm';
import {startPostgresFixture} from './postgres.fixture';
import {seedJuguangPilot,pilotReports} from './juguang-daily.fixture';
import {seedLinkPlan} from './monthly-plan-links.fixture';
import {admin,employee} from './auth.fixture';
import {withDatabase} from '../src/db/client';
import * as s from '../src/db/schema';
import {saveJuguangConnection,decryptJuguangTokens} from '../src/integrations/xiaohongshu-juguang';
import {promotionSnapshot,timelineFingerprint} from '../src/db/promotion-timeline';
import {promotionClickRate} from '../src/integrations/juguang-metric-types';
process.env.NODE_ENV='test';process.env.XHS_JUGUANG_APP_ID='42';process.env.XHS_JUGUANG_APP_SECRET='fictional-app-secret';process.env.BETTER_AUTH_SECRET='fictional-browser-secret-at-least-32-characters';
const dir=await mkdtemp(join(tmpdir(),'juguang-daily-')),scenario=join(dir,'scenario.json'),clock=join(dir,'clock');
process.env.JUGUANG_SCENARIO_FILE=scenario;await writeFile(scenario,'{}');await writeFile(scenario+'.calls','');await writeFile(clock,'2026-11-16T04:00:00Z');
const f=await startPostgresFixture({entry:'tests/juguang-server.fixture.mjs',clockFile:clock}),{db,baseURL:base}=f,checks:string[]=[];
async function login(actor:typeof admin|typeof employee){const r=await fetch(base+'/api/auth/sign-in/username',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify(actor)});assert.equal(r.status,200);const cookie=r.headers.getSetCookie().map(s=>s.split(';')[0]).join('; ');const user=await(await fetch(base+'/api/auth/get-session',{headers:{Cookie:cookie}})).json();return {cookie,id:user.user.id};}
async function mode(value:unknown){await writeFile(scenario,JSON.stringify(value));await writeFile(scenario+'.calls','');}
async function calls(){return(await readFile(scenario+'.calls','utf8')).trim().split('\n').filter(Boolean).map(v=>JSON.parse(v));}
async function preview(cookie:string,date='2026-11-15',status=200){const r=await fetch(base+'/api/promotion-daily/juguang-preview?date='+date,{headers:{Cookie:cookie}});const v=await r.json();assert.equal(r.status,status,JSON.stringify(v));return v;}
async function patch(cookie:string,id:string,form:FormData,status=200,origin=base){const r=await fetch(base+'/api/promotion-daily/'+id,{method:'PATCH',headers:{Cookie:cookie,Origin:origin},body:form});const text=await r.text();let v:any;try{v=JSON.parse(text);}catch{v={message:text};}assert.equal(r.status,status,JSON.stringify(v));return v;}
function body(metric:any,row?:any,more:Record<string,unknown>={}){const form=new FormData();for(const [k,v]of Object.entries({...metric,...row?.source.original,juguangReceipt:row?.receipt,requestKey:randomUUID(),...more}))if(v!=null)form.set(k,String(v));return form;}
const token={access_token:'fictional-access',refresh_token:'fictional-refresh',access_token_expires_in:86400,refresh_token_expires_in:2592000,user_id:'fictional-upstream',platform_type:1 as const,scope:'["report_service"]',approval_advertisers:[11,22,33].map(advertiser_id=>({advertiser_id,advertiser_name:'隔离报表账户 '+advertiser_id}))};
try {
 const boss=await login(admin),staff=await login(employee),cases=await seedJuguangPilot(db);
 const [one,two,closed]=cases;
 await preview('','2026-11-15',401);await preview(boss.cookie,'2026-11-14',422);await preview(boss.cookie,'2026-11-15',503);
 await withDatabase(db,()=>saveJuguangConnection(token,'42',boss.id));await mode({reports:pilotReports});
 await seedLinkPlan(db);
 const strategies=await Promise.all([db.select().from(s.operationsPromotionCampaign),db.select().from(s.operationsPromotionStage),db.select().from(s.operationsPromotionDayDecision),db.select().from(s.operationsContentSchedule),db.select().from(s.operationsReviewMeetingVersion)]);
 const before=await db.select().from(s.operationsPromotionDailyMetric);
 let data=await preview(boss.cookie),row=data.rows.find((r:any)=>r.metricId===one.metric.id);
 assert.equal(data.rows.length,2,'已结束帖只有官方零消耗流量，不建立新记录');assert.equal(row.source.original.impressionCount,1320);assert.equal(row.source.original.clickCount,40);
 assert.deepEqual(await db.select().from(s.operationsPromotionDailyMetric),before,'GET不保存指标');assert.equal((await calls()).length,3);assert((await calls()).every(c=>c.date==='2026-11-15'&&c.endDate===c.date&&c.pageSize===500&&c.timeUnit==='DAY'&&c.dataCaliber===0));
 assert(!JSON.stringify(data).includes('fictional-access'));checks.push('双角色登录门禁、日期白名单、三个授权账户批量读取、按日期ID匹配、空账户正常、读取不写事实或新增任务');
 const mismatch=body(one.metric,row);await patch(staff.cookie,one.metric.id,mismatch,409);await patch(boss.cookie,two.metric.id,body(two.metric,row),409);
 const forged=body(one.metric,row);forged.set('juguangReceipt',row.receipt.slice(0,-7)+'forged!');await patch(boss.cookie,one.metric.id,forged,409);
 await patch(boss.cookie,one.metric.id,body(one.metric,row),403,'https://untrusted.example');
 const unsigned=body(one.metric,undefined,{impressionCount:1,clickCount:1,juguangSource:JSON.stringify(row.source)});await patch(boss.cookie,one.metric.id,unsigned,422);
 checks.push('来源验签、会话绑定、记录绑定、同源校验与伪造来源拒绝，失败不落库');
 const form=body(one.metric,row);await patch(boss.cookie,one.metric.id,form);await patch(boss.cookie,one.metric.id,form);
 let [saved]=await db.select().from(s.operationsPromotionDailyMetric).where(eq(s.operationsPromotionDailyMetric.id,one.metric.id));assert.equal(saved.clickRate,'3.0303');assert.equal(saved.actualOpenCount,0);assert.equal(saved.juguangSource?.overriddenFields.length,0);
 let own=await preview(staff.cookie);let ownRow=own.rows.find((r:any)=>r.metricId===two.metric.id);
 const snapshot=await promotionSnapshot(db,two.post.schedule.id);
 await patch(staff.cookie,two.metric.id,body(two.metric,ownRow,{changeDayStatus:'true',dailyWorkspace:'true',dayStatus:'testing',fingerprint:timelineFingerprint(snapshot)}));
 let [second]=await db.select().from(s.operationsPromotionDailyMetric).where(eq(s.operationsPromotionDailyMetric.id,two.metric.id));assert.equal(second.actualOpenCount,1);assert.equal(second.actualLeadCount,0);assert.equal(second.clickRate,'3.7217');
 checks.push('普通历史和每日继续编辑两条正式保存路径、幂等重试、3.03%／3.72%源值与实际1人保留');
 own=await preview(staff.cookie);ownRow=own.rows.find((r:any)=>r.metricId===two.metric.id);
 const over=body(second,ownRow,{spend:210});await patch(staff.cookie,two.metric.id,over,422);over.set('juguangOverrideReason','账单人工核对');await patch(staff.cookie,two.metric.id,over);
 [second]=await db.select().from(s.operationsPromotionDailyMetric).where(eq(s.operationsPromotionDailyMetric.id,two.metric.id));assert.deepEqual(second.juguangSource?.overriddenFields,['spend']);assert.equal(second.juguangSource?.original.spend,208.6);assert.equal(second.juguangSource?.overrideReason,'账单人工核对');
 await patch(staff.cookie,two.metric.id,body(second,undefined,{actualLeadCount:1}));
 own=await preview(staff.cookie);ownRow=own.rows.find((r:any)=>r.metricId===two.metric.id);await patch(staff.cookie,two.metric.id,body(second,ownRow,{actualLeadCount:1}));
 [second]=await db.select().from(s.operationsPromotionDailyMetric).where(eq(s.operationsPromotionDailyMetric.id,two.metric.id));assert.deepEqual(second.juguangSource?.overriddenFields,[]);assert.equal(second.juguangSource?.overrideReason,null);
 checks.push('人工覆盖必须有原因、原API值与覆盖字段持久化、单独实际人数更正、恢复聚光值清除覆盖标记');
 const apiZero={...pilotReports,11:pilotReports[11].map((r,i)=>i===0?{...r,impression:'0',click:'0'}:r)};await mode({reports:apiZero});data=await preview(boss.cookie);row=data.rows.find((r:any)=>r.metricId===one.metric.id);await patch(boss.cookie,one.metric.id,body(saved,row));
 [saved]=await db.select().from(s.operationsPromotionDailyMetric).where(eq(s.operationsPromotionDailyMetric.id,one.metric.id));assert.equal(saved.clickRate,null);assert.equal(promotionClickRate(0,0),null);assert.equal(promotionClickRate(1938,63)?.toFixed(2),'3.25');
 checks.push('原始曝光点击保存，零曝光点击率未知，分子分母汇总可得3.25%');
 const split={11:[{...pilotReports[11][0],fee:'100',impression:'1000',click:'30'}],22:[{...pilotReports[11][0],fee:'138.44',impression:'320',click:'10'},...pilotReports[11].slice(1)],33:[]};
 await mode({reports:split});data=await preview(boss.cookie);row=data.rows.find((r:any)=>r.metricId===one.metric.id);assert.deepEqual(row.source.original,{spend:238.44,platformOpenCount:0,platformLeadCount:0,impressionCount:1320,clickCount:40});assert.deepEqual(row.source.advertiserIds,[11,22]);
 const filler=Array.from({length:500},(_,i)=>({...pilotReports[11][0],note_id:i.toString(16).padStart(24,'0'),fee:'0',impression:'0',click:'0'}));
 await mode({reports:{11:[...filler,pilotReports[11][0]],22:[],33:[]}});data=await preview(boss.cookie);assert.equal(data.rows.find((r:any)=>r.metricId===one.metric.id).source.original.spend,238.44);assert.equal((await calls()).filter(c=>c.advertiserId===11).length,2);
 checks.push('同一笔记跨授权账户累加、超过500行完整分页，不遗漏后页数据');
 await mode({reports:pilotReports});data=await preview(boss.cookie);row=data.rows.find((r:any)=>r.metricId===one.metric.id);
 const concurrent=await Promise.all([body(saved,row),body(saved,row)].map(async payload=>{const response=await fetch(base+'/api/promotion-daily/'+one.metric.id,{method:'PATCH',headers:{Cookie:boss.cookie,Origin:base},body:payload});return response.status;}));assert.deepEqual(concurrent.sort(),[200,409]);
 [saved]=await db.select().from(s.operationsPromotionDailyMetric).where(eq(s.operationsPromotionDailyMetric.id,one.metric.id));checks.push('同一读取版本并发保存仅一方成功，另一方保留草稿重新核对');
 const stable=await db.select().from(s.operationsPromotionDailyMetric);await mode({network:true});await preview(boss.cookie,'2026-11-15',503);await mode({accountErrors:{22:410029},reports:pilotReports});await preview(boss.cookie,'2026-11-15',503);assert.deepEqual(await db.select().from(s.operationsPromotionDailyMetric),stable);
 await mode({reports:{11:[]}});data=await preview(boss.cookie);assert(data.rows.every((r:any)=>r.message));
 await mode({badResponse:{total_count:1,data_list:[{...pilotReports[11][0],impression:null}]}});await preview(boss.cookie,'2026-11-15',503);
 checks.push('断网、限流、缺项和无匹配保留原值，部分账户失败不保存不完整汇总');
 await db.update(s.xiaohongshuJuguangConnection).set({accessTokenExpiresAt:new Date(0)});await mode({accountErrors:{11:410029}});await preview(boss.cookie,'2026-11-15',503);assert.equal((await calls()).filter(c=>c.refresh).length,1);
 const [connection]=await db.select().from(s.xiaohongshuJuguangConnection);assert.equal(decryptJuguangTokens(connection.encryptedTokens,'42:fictional-upstream').accessToken,'fictional-refreshed-access');
 await mode({reports:pilotReports,delay:250});const first=preview(boss.cookie);await new Promise(r=>setTimeout(r,100));await preview(staff.cookie,'2026-11-15',409);await first;
 checks.push('过期按需刷新，报表失败仍提交轮换令牌；真实PostgreSQL应用锁隔离并发读取');
 await mode({reports:pilotReports});data=await preview(boss.cookie);row=data.rows.find((r:any)=>r.metricId===one.metric.id);await writeFile(clock,'2026-11-16T05:01:00Z');await patch(boss.cookie,one.metric.id,body(saved,row),409);await writeFile(clock,'2026-11-16T04:00:00Z');
 data=await preview(boss.cookie);row=data.rows.find((r:any)=>r.metricId===one.metric.id);await db.update(s.operationsContent).set({platformNoteId:'aaaaaaaaaaaaaaaaaaaaaaaa'}).where(eq(s.operationsContent.id,one.post.content.id));await patch(boss.cookie,one.metric.id,body(saved,row),409);
 await patch(boss.cookie,closed.metric.id,body(closed.metric,undefined,{impressionCount:3,clickCount:0}),422);
 checks.push('一小时读取凭证过期、日期ID变化和其他日期写入均拒绝，输入由浏览器保留供重读');
 const afterStrategies=await Promise.all([db.select().from(s.operationsPromotionCampaign),db.select().from(s.operationsPromotionStage),db.select().from(s.operationsPromotionDayDecision),db.select().from(s.operationsContentSchedule),db.select().from(s.operationsReviewMeetingVersion)]);
 assert.deepEqual(afterStrategies,strategies,'API不能决定策略、状态、日期、阶段或会议');assert.equal((await db.select().from(s.operationsPromotionDailyMetric)).length,3);checks.push('所有API读数与保存不改推广策略、次日安排、阶段、结束日期或冻结例会');
 await mkdir('.tools/test-artifacts/juguang-daily-pilot',{recursive:true});await writeFile('.tools/test-artifacts/juguang-daily-pilot/integration.json',JSON.stringify({passed:true,checks},null,2));console.log(checks.join('\n'));
}catch(error){console.error(f.logs().slice(-3000));throw error;}finally{await f.stop();}
