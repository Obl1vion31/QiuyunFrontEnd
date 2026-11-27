import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {eq} from 'drizzle-orm';
import {startPostgresFixture} from './postgres.fixture';
import {seedLinkPost} from './monthly-plan-links.fixture';
import {admin} from './auth.fixture';
import {withDatabase} from '../src/db/client';
import * as s from '../src/db/schema';
import {saveJuguangConnection} from '../src/integrations/xiaohongshu-juguang';
import {readVersionNotes} from '../src/db/note-identities';
import {promotionSnapshot,timelineFingerprint} from '../src/db/promotion-timeline';
import {isJuguangMetricDate,juguangTargetKey,promotionClickRate} from '../src/integrations/juguang-metric-types';
process.env.NODE_ENV='test';process.env.XHS_JUGUANG_APP_ID='42';process.env.XHS_JUGUANG_APP_SECRET='fictional-app-secret';process.env.BETTER_AUTH_SECRET='fictional-browser-secret-at-least-32-characters';
const dir=await mkdtemp(join(tmpdir(),'juguang-range-')),scenario=join(dir,'scenario.json'),clock=join(dir,'clock');
process.env.JUGUANG_SCENARIO_FILE=scenario;await writeFile(scenario,'{}');await writeFile(scenario+'.calls','');await writeFile(clock,'2026-11-17T04:00:00Z');
const f=await startPostgresFixture({entry:'tests/juguang-server.fixture.mjs',clockFile:clock}),{db,baseURL:base}=f,checks:string[]=[];
const reports:Record<number,any[]>={11:[],22:[],33:[]};
function report(note:string,date:string,fee='18.50'){return {time:date,note_id:note,fee,impression:'1000',click:'50',initiative_message:'3',msg_leads_num:'1'};}
async function mode(value:any={reports}){await writeFile(scenario,JSON.stringify(value));}
async function seed(n:number,note:string|null=String(n).repeat(24),date='2026-10-01'){
 const post=await seedLinkPost(db,'隔离十月推广'+n,date+'T10:00');
 await db.update(s.operationsContent).set({platformNoteId:note,operationType:'promotion_then_continuous'}).where(eq(s.operationsContent.id,post.content.id));
 await db.update(s.operationsContentSchedule).set({isPromoted:true,promotionStatus:'testing',actualPublishAt:new Date(date+'T02:00Z'),completionStatus:'on_time'}).where(eq(s.operationsContentSchedule.id,post.schedule.id));
 const [campaign]=await db.insert(s.operationsPromotionCampaign).values({scheduleId:post.schedule.id,startedOn:date,dailyReviewEnabledOn:date,initialStage:'testing',currentStage:'testing',currentStatus:'testing'}).returning();
 await db.insert(s.operationsPromotionStage).values({campaignId:campaign.id,stageType:'testing',startedOn:date});
 return {post,campaign,note};
}
async function call(path:string,data?:any,status=200,method=data?'POST':'GET'){
 const form=data instanceof FormData,r=await fetch(base+path,{method,headers:{Cookie:cookie,Origin:base,...(data&&!form?{'Content-Type':'application/json'}:{})},body:data?(form?data:JSON.stringify(data)):undefined}),value=await r.json();assert.equal(r.status,status,JSON.stringify(value));return value;
}
let cookie='';
async function preview(c:any,date='2026-10-01',draft?:string){const q=new URLSearchParams({date,campaignId:c.campaign.id});if(draft)q.set('noteId:'+c.campaign.id,draft);return (await call('/api/promotion-daily/juguang-preview?'+q)).rows[0];}
async function input(c:any,date:string,row:any,extra:any={}){return {campaignId:c.campaign.id,metricDate:date,dailyStatus:'active',stageTypeSnapshot:'testing',actualStatusSnapshot:'testing',recordKind:'regular',spend:0,platformOpenCount:0,platformLeadCount:0,actualOpenCount:7,actualLeadCount:2,reviewDecision:'test_continue',requestKey:randomUUID(),fingerprint:timelineFingerprint(await promotionSnapshot(db,c.post.schedule.id)),...row?.source.original,juguangReceipt:row?.receipt,...extra};}
function form(data:any){const f=new FormData();for(const [k,v] of Object.entries(data))if(v!=null)f.set(k,String(v));return f;}
try{
 const now=new Date('2026-11-17T04:00Z');
 for(const day of ['2026-10-01','2026-11-16'])assert(isJuguangMetricDate(day,now));
 for(const day of ['2026-09-30','2026-11-17','2026-11-18','2026-10-32','2026-02-30',''])assert(!isJuguangMetricDate(day,now));
 assert.equal(promotionClickRate(0,0),null);assert.equal(promotionClickRate(null,1),null);assert.equal(promotionClickRate(2000,50),2.5);
 const login=await fetch(base+'/api/auth/sign-in/username',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify(admin)});assert.equal(login.status,200);cookie=login.headers.getSetCookie().map(s=>s.split(';')[0]).join('; ');
 const session=await call('/api/auth/get-session');
 await withDatabase(db,()=>saveJuguangConnection({access_token:'fictional-access',refresh_token:'fictional-refresh',access_token_expires_in:86400,refresh_token_expires_in:2592000,user_id:'fictional-upstream',platform_type:1,scope:'["report_service"]',approval_advertisers:[11,22,33].map(advertiser_id=>({advertiser_id,advertiser_name:'隔离账户'+advertiser_id}))},'42',session.user.id));
 const a=await seed(1),b=await seed(2),draft=await seed(3,null),residual=await seed(4);
 reports[11]=[report(a.note!,'2026-10-01'),report(b.note!,'2026-10-01'),report('3'.repeat(24),'2026-10-01'),report(residual.note!,'2026-10-02')];await mode();
 const before=await promotionSnapshot(db,a.post.schedule.id),p=await preview(a);
 assert.equal(p.metricId,null);assert.equal(p.key,juguangTargetKey(a.campaign.id,'2026-10-01'));assert.equal(p.source.original.impressionCount,1000);assert.deepEqual(await promotionSnapshot(db,a.post.schedule.id),before);
 await call('/api/promotion-daily/juguang-preview?date=2026-09-30',undefined,422);
 await call('/api/promotion-daily/juguang-preview?date=2026-11-17',undefined,422);
 await call('/api/promotion-daily/juguang-preview?date=2026-10-01&noteId:'+draft.campaign.id+'=bad',undefined,422);
 const wrong=await input(b,'2026-10-01',p);await call('/api/promotion-daily',form(wrong),409);
 const payload=await input(a,'2026-10-01',p);
 await call('/api/promotion-daily',form(payload),201);await call('/api/promotion-daily',form(payload),201);
 await call('/api/promotion-daily',form({...payload,impressionCount:999}),409);
 const saved=(await db.select().from(s.operationsPromotionDailyMetric).where(eq(s.operationsPromotionDailyMetric.campaignId,a.campaign.id)))[0];
 assert.equal(saved.clickRate,'5.0000');assert.equal(saved.actualOpenCount,7);assert.equal(saved.actualLeadCount,2);assert.equal(saved.reviewDecision,'test_continue');assert.equal(saved.juguangSource?.noteId,a.note);assert.equal(saved.spend,'18.50');
 checks.push('10/1新建预览不写库，凭证绑定活动日期，会话保存含来源、真实人数与人工策略，重试幂等且篡改计数拒绝');
 const d=await preview(draft,'2026-10-01','3'.repeat(24));assert(d.receipt);assert.equal((await db.select().from(s.operationsContent).where(eq(s.operationsContent.id,draft.post.content.id)))[0].platformNoteId,null);
 const dp=await input(draft,'2026-10-01',d,{platformNoteId:'3'.repeat(24)});
 await call('/api/promotion-daily',form(dp),201);
 const ds=(await db.select().from(s.operationsPromotionDailyMetric).where(eq(s.operationsPromotionDailyMetric.campaignId,draft.campaign.id)))[0],mapping=(await readVersionNotes(db,[draft.post.version.id])).get(draft.post.version.id)!;
 assert.equal(ds.juguangSource?.mappingFingerprint,mapping.fingerprint);assert.equal(ds.impressionCount,1000);
 checks.push('首次笔记ID草稿可预览，保存时原子绑定ID与官方数据，来源指纹与最终身份一致');
 const c=await seed(5);reports[11].push(report(c.note!,'2026-10-01'));await mode();
 const br=await preview(b),cr=await preview(c),rows=[await input(b,'2026-10-01',br,{platformNoteId:b.note}),await input(c,'2026-10-01',cr,{platformNoteId:c.note})].sort((a,b)=>a.campaignId.localeCompare(b.campaignId));
 const broken=structuredClone(rows);broken[1].juguangReceipt+='x';
 await call('/api/promotion-daily/batch',{rows:broken},409);
 assert.equal((await db.select().from(s.operationsPromotionDailyMetric)).length,2);
 await call('/api/promotion-daily/batch',{rows},201);await call('/api/promotion-daily/batch',{rows},201);
 assert.equal((await db.select().from(s.operationsPromotionDailyMetric)).length,4);
 checks.push('一键保存沿用同一事务，第二条凭证无效整体回滚，成功后两条均有API来源且重复请求幂等');
 await db.update(s.operationsPromotionCampaign).set({currentStatus:'test_discarded',currentStage:null,endedOn:'2026-10-01'}).where(eq(s.operationsPromotionCampaign.id,residual.campaign.id));
 await db.update(s.operationsPromotionStage).set({endedOn:'2026-10-01'}).where(eq(s.operationsPromotionStage.campaignId,residual.campaign.id));
 const rr=await preview(residual,'2026-10-02');assert(rr.receipt);
 await call('/api/promotion-daily',form(await input(residual,'2026-10-02',rr,{recordKind:'test_residual',dailyStatus:'waiting_action',actualStatusSnapshot:'test_discarded',reviewDecision:'test_discarded'})),201);
 assert.equal((await db.select().from(s.operationsPromotionCampaign).where(eq(s.operationsPromotionCampaign.id,residual.campaign.id)))[0].endedOn,'2026-10-01');
 checks.push('淘汰后残留消耗按所选日期读取，保存不延长结束日期、不恢复投放');
 const twin=await seed(6);
 await db.update(s.operationsContentSchedule).set({contentVersionId:a.post.version.id}).where(eq(s.operationsContentSchedule.id,twin.post.schedule.id));
 assert.match((await preview(a)).message,/共用/);assert.match((await preview(twin)).message,/共用/);
 await mode({reports:{11:[]}});assert.match((await preview(b)).message,/尚无/);
 await mode({badResponse:{total_count:1,data_list:[report(b.note!,'2026-10-02')]}});await call('/api/promotion-daily/juguang-preview?date=2026-10-01',undefined,503);
 await mode({badResponse:{total_count:2,data_list:[report(b.note!,'2026-10-01'),report(b.note!,'2026-10-01')]}});await call('/api/promotion-daily/juguang-preview?date=2026-10-01',undefined,503);
 checks.push('同日笔记归属冲突不分配，缺报表返回待填写说明且不写事实，串日与重复上游行整体拒绝');
 await mkdir('.tools/test-artifacts/juguang-rollout',{recursive:true});await writeFile('.tools/test-artifacts/juguang-rollout/integration-range.json',JSON.stringify({passed:true,checks},null,2));console.log(checks.join('\n'));
}catch(e){console.error(f.logs().slice(-2200));throw e;}finally{await f.stop();}
