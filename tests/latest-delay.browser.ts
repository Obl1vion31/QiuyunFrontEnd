/** 用户所报 20日→22日排期、23日实发场景，全部使用隔离业务事实。 */
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {eq} from 'drizzle-orm';
import {startFixture,admin} from './auth.fixture';
import * as s from '../src/db/schema';
const folder='.tools/test-artifacts/meeting-delay-fix';await mkdir(folder,{recursive:true});
const fixture=await startFixture(),{db,baseURL}=fixture;let browser:any;
try{
 const login=await fetch(baseURL+'/api/auth/sign-in/username',{method:'POST',headers:{Origin:baseURL,'Content-Type':'application/json'},body:JSON.stringify(admin)});assert.equal(login.status,200);
 const cookie=login.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');
 const [content]=await db.insert(s.operationsContent).values({}).returning();
 const [version]=await db.insert(s.operationsContentVersion).values({contentId:content.id,contentName:'面试课成功案例1（隔离验收）',versionNumber:0,workType:'new',subjectId:'tmua',categoryId:'temporary'}).returning();
 const [schedule]=await db.insert(s.operationsContentSchedule).values({contentVersionId:version.id,plannedPublishAt:new Date('2026-10-20T18:00:00+08:00'),actualPublishAt:new Date('2026-10-23T18:00:00+08:00'),completionStatus:'delayed',publicationUrl:'https://xhslink.cn/o/fixture'}).returning();
 await db.insert(s.operationsScheduleDelayReason).values([1,2].map(day=>({scheduleId:schedule.id,planRevision:0,dayNumber:day,dueAt:new Date(`2026-10-${19+day}T20:00:00+08:00`),responsibility:'self' as const,reason:'改期前原因应删除',changedByLabel:'虚构员工'})));
 const form=new FormData();form.set('expectedPlanRevision','0');form.set('plannedPublishAt','2026-10-22T18:00');form.set('reason','需求未到');
 const changed=await fetch(`${baseURL}/api/operations-content/${schedule.id}/change-requests`,{method:'POST',headers:{Cookie:cookie,Origin:baseURL},body:form});assert.equal(changed.status,201,await changed.text());
 assert.equal((await db.select().from(s.operationsScheduleDelayReason).where(eq(s.operationsScheduleDelayReason.scheduleId,schedule.id))).length,0);
 const input=new FormData();for(const [key,value] of Object.entries({planRevision:'1',dayNumber:'1',responsibility:'self',reason:'当日仅完成项目brief',expectedUpdatedAt:''}))input.set(key,value);
 const saved=await fetch(`${baseURL}/api/operations-content/${schedule.id}/delay-reasons`,{method:'POST',headers:{Cookie:cookie,Origin:baseURL},body:input});assert.equal(saved.status,200,await saved.text());
 const workflow=await fetch(`${baseURL}/api/operations-content/${schedule.id}/workflow`,{headers:{Cookie:cookie}}).then(r=>r.json());
 assert.equal(workflow.days.length,1);assert.equal(workflow.days[0].planRevision,1);assert.equal(workflow.delayLabel,'较最新排期晚发布 1 天');assert.equal(workflow.history[0].reason,'需求未到');
 const pw=await import(new URL('../.tools/tooling/node_modules/playwright/index.mjs',import.meta.url).href);browser=await pw.chromium.launch({headless:true});
 const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'zh-CN',recordVideo:{dir:folder+'/delay-video',size:{width:1440,height:1000}}});
 await context.addCookies(cookie.split('; ').map(c=>({name:c.slice(0,c.indexOf('=')),value:c.slice(c.indexOf('=')+1),url:baseURL})));
 const page=await context.newPage(),errors:string[]=[];page.on('pageerror',(e:Error)=>errors.push(e.message));
 await page.goto(`${baseURL}/business/operations-schedule?month=2026-10&row=${schedule.id}`);await page.getByText('较最新排期晚发布 1 天',{exact:true}).waitFor();
 const history=page.locator('[data-schedule-workflow-history]');await history.getByText('已填延期原因 1 条',{exact:true}).click();
 await page.getByText('自身原因：当日仅完成项目brief',{exact:true}).waitFor();await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(300);
 assert.equal(await history.locator('.workflow-reason').count(),1);assert.match(await history.locator('.workflow-reason h4').innerText(),/2026-10-22 20:00/);assert.equal((await history.locator('.workflow-reason').innerText()).includes('R0'),false);
 assert.equal(await page.locator('.workflow-pending-reasons').count(),0);assert.deepEqual(errors,[]);
 await page.locator('.inspector-reference>summary').click();await page.waitForTimeout(300);await page.screenshot({path:folder+'/latest-delay-1440.png'});await page.waitForTimeout(1000);await context.close();
 await writeFile(folder+'/latest-delay-checks.json',JSON.stringify({scope:'隔离 PGlite，虚构业务事实',oldReasonsDeleted:2,currentReasons:1,delayLabel:workflow.delayLabel,planChangeReasonPreserved:true,errors},null,2));
 console.log('通过：改期实际删除旧原因，最新排期只保留22日一条，23日18时发布显示晚1天；改期理由保留。');
}catch(error){console.error(fixture.logs());throw error;}finally{await browser?.close();await fixture.stop();}
