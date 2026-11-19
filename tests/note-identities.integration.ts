import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {eq} from 'drizzle-orm';
import {startPostgresFixture} from './postgres.fixture';
import {notePost,ids} from './note-identities.fixture';
import {seedLinkPlan} from './monthly-plan-links.fixture';
import {readVersionNotes} from '../src/db/note-identities';
import {noteIdOn} from '../src/db/note-identity-rules';
import {admin,employee} from './auth.fixture';
import * as s from '../src/db/schema';
const dir=process.env.NOTE_ID_DIR??'.tools/test-artifacts/note-identities';await mkdir(dir,{recursive:true});
const clockFile=process.cwd()+'/'+dir+'/clock.txt';await writeFile(clockFile,'2026-11-11T12:00:00+08:00');
const f=await startPostgresFixture({clockFile,entry:process.env.NOTE_ID_ENTRY}),{db,baseURL}=f,checks:string[]=[];
async function login(actor:any){const r=await fetch(baseURL+'/api/auth/sign-in/username',{method:'POST',headers:{Origin:baseURL,'Content-Type':'application/json'},body:JSON.stringify(actor)});assert.equal(r.status,200);return r.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');}
try{
 const boss=await login(admin),staff=await login(employee);
 const [actor]=await db.select().from(s.authUser).where(eq(s.authUser.username,admin.username));
 const post=await notePost(db),contentId=post.post.content.id,versionId=post.post.version.id;
 await db.update(s.operationsContentSchedule).set({publicationUrl:null}).where(eq(s.operationsContentSchedule.id,post.post.schedule.id));
 const original=(await readVersionNotes(db,[versionId])).get(versionId)!;
 const frozen=await seedLinkPlan(db),beforeFrozen=(await db.select().from(s.operationsReviewMeetingVersion).where(eq(s.operationsReviewMeetingVersion.id,frozen.version.id)))[0];
 const factsBefore=await db.select().from(s.operationsPromotionDailyMetric),stagesBefore=await db.select().from(s.operationsPromotionStage),scheduleBefore=(await db.select().from(s.operationsContentSchedule).where(eq(s.operationsContentSchedule.id,post.post.schedule.id)))[0];
 const endpoint='/api/operations-content/'+contentId+'/platform-note-id';
 const api=async(path:string,cookie=boss,body?:Record<string,unknown>,method=body?'POST':'GET')=>{
  const form=new FormData();for(const[k,v]of Object.entries(body??{}))form.set(k,String(v));return fetch(baseURL+path,{method,headers:{Cookie:cookie,...(body?{Origin:baseURL}:{}),Accept:'application/json'},...(body?{body:form}:{})});
 };
 const preview=async(date='2026-10-31')=>{const r=await api(endpoint+'?versionId='+versionId+'&effectiveOn='+date);assert.equal(r.status,200);return r.json();};
 const correction=async(date:string,value:string,scope='from_date',cookie=staff,key=randomUUID(),fingerprint?:string)=>{
  const p=await preview(date),body={versionId,effectiveOn:date,scope,platformNoteId:value,expectedFingerprint:fingerprint??p.fingerprint,requestKey:key,confirmed:'true'};
  return {response:await api(endpoint,cookie,body),body};
 };
 let r=await correction('2026-11-03',ids.b);assert.equal(r.response.status,200,await r.response.clone().text());
 assert.equal((await preview('2026-10-31')).platformNoteId,original.legacyId);assert.equal((await preview('2026-11-03')).platformNoteId,ids.b);
 r=await correction('2026-10-31',ids.c);assert.equal(r.response.status,200);assert.equal((await preview('2026-11-03')).platformNoteId,ids.c);assert.equal((await preview('2026-10-30')).platformNoteId,original.legacyId);
 const noteState=(await readVersionNotes(db,[versionId])).get(versionId)!;assert.equal(noteState.periods.length,2);
 checks.push('员工按选中日更正；后一次C覆盖后续B，之前保留，不重写指标或推广状态');
 r=await correction('2026-10-31',ids.d,'version',boss);assert.equal(r.response.status,200);
 assert.equal((await preview('2026-10-29')).platformNoteId,ids.d);assert.equal((await preview()).periods.length,1);
 const repeated=await api(endpoint,boss,r.body);assert.equal(repeated.status,200);assert.equal((await repeated.json()).repeated,true);
 const stale=await correction('2026-10-31',ids.a,'from_date',staff,randomUUID(),original.fingerprint);assert.equal(stale.response.status,409);
 const binding=await preview(),payload=(value:string)=>({versionId,effectiveOn:'2026-10-31',scope:'from_date',platformNoteId:value,expectedFingerprint:binding.fingerprint,requestKey:randomUUID(),confirmed:'true'});
 const parallel=await Promise.all([api(endpoint,boss,payload('e'.repeat(24))),api(endpoint,staff,payload('f'.repeat(24)))]);assert.deepEqual(parallel.map(r=>r.status).sort(),[200,409]);
 assert.deepEqual(await db.select().from(s.operationsPromotionDailyMetric),factsBefore);
 assert.deepEqual(await db.select().from(s.operationsPromotionStage),stagesBefore);
 assert.deepEqual((await db.select().from(s.operationsContentSchedule).where(eq(s.operationsContentSchedule.id,post.post.schedule.id)))[0],scheduleBefore);
 assert.deepEqual((await db.select().from(s.operationsReviewMeetingVersion).where(eq(s.operationsReviewMeetingVersion.id,frozen.version.id)))[0],beforeFrozen);
 checks.push('历史缺链接继续支持全版本／按日期手填，重试幂等、过期及真实并发拒绝覆盖；原事实、阶段、排期和冻结材料保持');
 await writeFile(dir+'/integration.json',JSON.stringify({passed:true,checks},null,2));console.log(checks.join('\n'));
}catch(error){console.error(f.logs().slice(-2500));throw error;}finally{await f.stop();}
