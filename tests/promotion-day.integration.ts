import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {eq} from 'drizzle-orm';
import {startPostgresFixture} from './postgres.fixture';
import {seedHistoricalDay} from './promotion-day.fixture';
import {admin,employee} from './auth.fixture';
import {promotionSnapshot,timelineFingerprint} from '../src/db/promotion-timeline';
import * as s from '../src/db/schema';
const dir='.tools/test-artifacts/promotion-day';await mkdir(dir,{recursive:true});const f=await startPostgresFixture({entry:process.env.PROMOTION_DAY_ENTRY}),{db,baseURL}=f,checks:string[]=[];
async function login(actor:any){const r=await fetch(baseURL+'/api/auth/sign-in/username',{method:'POST',headers:{Origin:baseURL,'Content-Type':'application/json'},body:JSON.stringify(actor)});assert.equal(r.status,200);return r.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');}
async function api(cookie:string,path:string,data:any,status=200,method='PATCH'){const r=await fetch(baseURL+path,{method,headers:{Cookie:cookie,Origin:baseURL,...(data instanceof FormData?{}:{'Content-Type':'application/json'})},body:data instanceof FormData?data:JSON.stringify(data)});const value=await r.json();assert.equal(r.status,status,JSON.stringify({path,value}));return value;}
function form(metric:any,target:string,fingerprint:string,key=randomUUID()){const out=new FormData();for(const[k,v]of Object.entries({...metric,dayStatus:target,changeDayStatus:'true',requestKey:key,fingerprint}))if(v!=null)out.set(k,String(v));return out;}
const factual=(m:any)=>[m.id,m.metricDate,m.actualStatusSnapshot,m.dailyStatus,m.stageTypeSnapshot,m.spend,m.platformOpenCount,m.actualOpenCount,m.platformLeadCount,m.actualLeadCount,m.note];
try{
 const boss=await login(admin),staff=await login(employee);
 const c=await seedHistoricalDay(db,'10月29日至11月3日连续测试',Array(6).fill('testing'));
 const before=await promotionSnapshot(db,c.post.schedule.id),body=form(c.metrics[2],'test_paused',timelineFingerprint(before));
 const preview=await api(boss,'/api/promotion-daily/'+c.metrics[2].id,body,409);assert(preview.contextRequired);assert.deepEqual([preview.dayContext.previous.status,preview.dayContext.current.after,preview.dayContext.next.status],['testing','test_paused','testing']);
 assert.deepEqual(await promotionSnapshot(db,c.post.schedule.id),before,'只预览不写入');
 body.set('confirmDayContext','true');body.set('contextFingerprint',preview.contextFingerprint);
 await api(boss,'/api/promotion-daily/'+c.metrics[2].id,body);await api(boss,'/api/promotion-daily/'+c.metrics[2].id,body);
 const after=await promotionSnapshot(db,c.post.schedule.id);assert.equal(after.metrics.length,6);assert.equal(after.metrics[2].actualStatusSnapshot,'test_paused');assert.deepEqual(after.metrics.filter((_,i)=>i!==2).map(factual),before.metrics.filter((_,i)=>i!==2).map(factual));assert.equal(after.metrics[2].spend,before.metrics[2].spend);
 checks.push('10/31单独改暂停：前后测试合法，三天确认；只改当天，另外5天事实原样、6条数据全保留、重试幂等');
 const reverse=form(after.metrics[2],'testing',timelineFingerprint(after));const r=await api(boss,'/api/promotion-daily/'+after.metrics[2].id,reverse,409);reverse.set('confirmDayContext','true');reverse.set('contextFingerprint',r.contextFingerprint);await api(boss,'/api/promotion-daily/'+after.metrics[2].id,reverse);assert((await promotionSnapshot(db,c.post.schedule.id)).metrics.every(m=>m.actualStatusSnapshot==='testing'));
 checks.push('同一天再次更正回测试中，不依赖旧后继选项、不影响相邻日期');
 for(const target of ['test_pending','test_discarded','scaling']){
  const snapshot=await promotionSnapshot(db,c.post.schedule.id);const rejected=await api(boss,'/api/promotion-daily/'+c.metrics[2].id,form(snapshot.metrics[2],target,timelineFingerprint(snapshot)),422);assert(rejected.message.includes('不能衔接'));assert.deepEqual(await promotionSnapshot(db,c.post.schedule.id),snapshot);
 }
 checks.push('结束待定／淘汰／放量不能接次日旧轮测试：明确指出相邻日期，不删除后续、不写半条');
 const stopped=await seedHistoricalDay(db,'连续暂停只改一天',['testing','testing','test_paused','test_paused','test_paused','test_paused'],{decisions:['test_continue','test_pause','wait_continue','wait_continue','wait_continue','wait_continue'],explicit:[{day:0,status:'testing'}]});
 const sb=await promotionSnapshot(db,stopped.post.schedule.id),one=form(sb.metrics[3],'testing',timelineFingerprint(sb));const sp=await api(boss,'/api/promotion-daily/'+sb.metrics[3].id,one,409);one.set('confirmDayContext','true');one.set('contextFingerprint',sp.contextFingerprint);await api(boss,'/api/promotion-daily/'+sb.metrics[3].id,one);
 const sa=await promotionSnapshot(db,stopped.post.schedule.id);assert.deepEqual(sa.metrics.map(m=>m.actualStatusSnapshot),['testing','testing','test_paused','testing','test_paused','test_paused']);assert.deepEqual(sa.metrics.filter((_,i)=>i!==3).map(factual),sb.metrics.filter((_,i)=>i!==3).map(factual));
 checks.push('连续暂停中只改11/1为测试中，10/31与11/2仍暂停；不自动扩散');
 const scaling=await seedHistoricalDay(db,'放量单日暂停',Array(6).fill('scaling'));
 const cb=await promotionSnapshot(db,scaling.post.schedule.id),cs=form(cb.metrics[2],'scaling_paused',timelineFingerprint(cb));const cp=await api(boss,'/api/promotion-daily/'+cb.metrics[2].id,cs,409);cs.set('confirmDayContext','true');cs.set('contextFingerprint',cp.contextFingerprint);await api(boss,'/api/promotion-daily/'+cb.metrics[2].id,cs);assert.deepEqual((await promotionSnapshot(db,scaling.post.schedule.id)).metrics.map(m=>m.actualStatusSnapshot),['scaling','scaling','scaling_paused','scaling','scaling','scaling']);
 checks.push('放量中→单日放量暂停→放量中，同样只改一天');
 const latest=await promotionSnapshot(db,c.post.schedule.id),staleBody=form(latest.metrics[1],'test_paused',timelineFingerprint(latest));const stalePreview=await api(boss,'/api/promotion-daily/'+latest.metrics[1].id,staleBody,409);
 const ordinary=new FormData();for(const[k,v]of Object.entries({...latest.metrics[2],dayStatus:'testing',changeDayStatus:'false',spend:88,requestKey:randomUUID()}))if(v!=null)ordinary.set(k,String(v));await api(staff,'/api/promotion-daily/'+latest.metrics[2].id,ordinary);
 staleBody.set('confirmDayContext','true');staleBody.set('contextFingerprint',stalePreview.contextFingerprint);const stale=await api(boss,'/api/promotion-daily/'+latest.metrics[1].id,staleBody,409);assert.equal(stale.code,'STALE_WRITE');assert.equal((await promotionSnapshot(db,c.post.schedule.id)).metrics[1].actualStatusSnapshot,'testing');
 checks.push('确认期间数据变化拒绝旧上下文，不覆盖协作者新指标；普通指标员工照常最后保存');
 const legacy=await promotionSnapshot(db,c.post.schedule.id),oldPlan=new FormData();for(const[k,v]of Object.entries({...legacy.metrics[1],reviewDecision:'test_discarded',fingerprint:timelineFingerprint(legacy)}))if(v!=null)oldPlan.set(k,String(v));await api(boss,'/api/promotion-daily/'+legacy.metrics[1].id,oldPlan,422);
 const oldStatus={scheduleId:c.post.schedule.id,reviewDate:'2026-10-31',action:'status',targetStatus:'test_paused',reason:'旧标签页',requestKey:randomUUID(),fingerprint:timelineFingerprint(legacy),confirmImpact:true};const oldResult=await api(boss,'/api/promotion-timeline',oldStatus,409,'POST');assert(oldResult.contextRequired);assert.deepEqual(await promotionSnapshot(db,c.post.schedule.id),legacy);
 checks.push('旧历史“次日安排”写入拒绝；旧confirmImpact不能绕过新的三天确认');
 const current=await promotionSnapshot(db,c.post.schedule.id);await api(staff,'/api/promotion-daily/'+current.metrics[2].id,form(current.metrics[2],current.metrics[2].actualStatusSnapshot==='testing'?'test_paused':'testing',timelineFingerprint(current)),409);
 const concurrent=await seedHistoricalDay(db,'同时改单日',Array(6).fill('testing')),conBefore=await promotionSnapshot(db,concurrent.post.schedule.id),a=form(conBefore.metrics[2],'test_paused',timelineFingerprint(conBefore)),b=form(conBefore.metrics[2],'test_paused',timelineFingerprint(conBefore));const ap=await api(boss,'/api/promotion-daily/'+conBefore.metrics[2].id,a,409),bp=await api(boss,'/api/promotion-daily/'+conBefore.metrics[2].id,b,409);for(const [data,p]of [[a,ap],[b,bp]] as any){data.set('confirmDayContext','true');data.set('contextFingerprint',p.contextFingerprint);}
 const responses=await Promise.all([a,b].map(data=>fetch(baseURL+'/api/promotion-daily/'+conBefore.metrics[2].id,{method:'PATCH',headers:{Cookie:boss,Origin:baseURL},body:data})));assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);assert.equal((await promotionSnapshot(db,concurrent.post.schedule.id)).metrics.length,6);
 checks.push('真实并发确认只有一方成功；员工与管理员同权，仍不能绕过历史确认');
 const rounds=await seedHistoricalDay(db,'已有次日新轮边界',['testing','testing','test_pending','testing','testing','testing'],{decisions:['test_continue','test_pending','restart_testing','test_continue','test_continue','test_continue']});
 const roundBefore=await promotionSnapshot(db,rounds.post.schedule.id),roundBody=form(roundBefore.metrics[2],'testing',timelineFingerprint(roundBefore));
 const rp=await api(boss,'/api/promotion-daily/'+roundBefore.metrics[2].id,roundBody,409);roundBody.set('confirmDayContext','true');roundBody.set('contextFingerprint',rp.contextFingerprint);await api(boss,'/api/promotion-daily/'+roundBefore.metrics[2].id,roundBody);
 const roundAfter=await promotionSnapshot(db,rounds.post.schedule.id);assert.equal(roundAfter.metrics[2].reviewDecision,'restart_testing');assert.deepEqual(roundAfter.metrics.slice(3).map(factual),roundBefore.metrics.slice(3).map(factual));
 checks.push('已有明确的新轮重测仍保留；单日待定恢复测试不删除、平移或合并后续轮次');
 const [meeting]=await db.insert(s.operationsReviewMeeting).values({name:'隔离冻结会议',meetingType:'weekly',periodStart:'2026-10-20',periodEnd:'2026-10-26',meetingAt:new Date('2026-10-26T08:00Z'),status:'completed',createdByLabel:'fixture'}).returning();
 const frozen={schemaVersion:4,finalizationStage:'post',decisionEffectiveOn:'2026-10-30',generated:{meetingDecisions:[{id:randomUUID(),campaignId:c.campaign.id,scheduleId:c.post.schedule.id,effectiveOn:'2026-10-30',targetStatus:'testing',stageType:'testing',meetingId:meeting.id,versionNumber:0,label:'隔离冻结决定'}]}};
 const [version]=await db.insert(s.operationsReviewMeetingVersion).values({meetingId:meeting.id,versionNumber:0,snapshot:frozen,changeSummary:'冻结样本'}).returning();
 const fb=await promotionSnapshot(db,c.post.schedule.id),fbody=form(fb.metrics[2],'test_paused',timelineFingerprint(fb));const fp=await api(boss,'/api/promotion-daily/'+fb.metrics[2].id,fbody,409);fbody.set('confirmDayContext','true');fbody.set('contextFingerprint',fp.contextFingerprint);await api(boss,'/api/promotion-daily/'+fb.metrics[2].id,fbody);
 assert.deepEqual((await db.select().from(s.operationsReviewMeetingVersion).where(eq(s.operationsReviewMeetingVersion.id,version.id)))[0].snapshot,frozen);
 checks.push('存在冻结会后决定仍可合法单日暂停，原会议快照逐值不变');
 await writeFile(dir+'/integration.json',JSON.stringify({passed:true,checks},null,2));console.log(checks.join('\n'));
}catch(e){console.error(f.logs().slice(-3000));throw e;}finally{await f.stop();}
