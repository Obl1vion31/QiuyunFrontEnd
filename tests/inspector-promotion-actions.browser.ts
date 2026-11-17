import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {eq} from 'drizzle-orm';
import {startPostgresFixture} from './postgres.fixture';
import {seedLinkPost} from './monthly-plan-links.fixture';
import {admin,employee} from './auth.fixture';
import {settleBusinessUI} from './business-confirm.helper';
import * as s from '../src/db/schema';
const dir='.tools/test-artifacts/inspector-promotion-actions';await mkdir(dir,{recursive:true});
const clock=process.cwd()+'/'+dir+'/clock.txt';await writeFile(clock,'2026-11-11T12:00:00+08:00');
const f=await startPostgresFixture({clockFile:clock,entry:'.tools/serve-vercel.mjs'});
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE!);const browser=await chromium.launch({headless:true});
try{
 for(const [role,actor]of [['admin',admin],['employee',employee]] as const){
  const post=await seedLinkPost(f.db,'面试课讲义 · 待确认首次推广 '+role,'2026-10-29T10:00');
  await f.db.update(s.operationsContent).set({operationType:'promotion_only'}).where(eq(s.operationsContent.id,post.content.id));
  await f.db.update(s.operationsContentSchedule).set({isPromoted:true,promotionStatus:'awaiting_promotion',actualPublishAt:new Date('2026-10-29T02:00Z'),completionStatus:'on_time'}).where(eq(s.operationsContentSchedule.id,post.schedule.id));
  const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'zh-CN'});await context.addInitScript({content:'window.__name = value => value;'});
  assert.equal((await context.request.post(f.baseURL+'/api/auth/sign-in/username',{headers:{Origin:f.baseURL},data:actor})).status(),200);
  const page=await context.newPage();await page.goto(f.baseURL+'/business/operations-schedule?month=2026-10&row='+post.schedule.id);
  const host=page.locator('[data-promotion-state-history]');await host.waitFor({state:'visible'});const form=host.locator('[data-timeline-form][data-fingerprint]').first();
  const disclosure=form.locator('xpath=ancestor::details[1]');if(await disclosure.getAttribute('open')===null)await disclosure.locator(':scope>summary').click();
  await form.locator('[name=action]').selectOption('wait');await form.locator('[name=reviewDate]').fill('2026-10-29');await form.locator('[name=waitingThrough]').fill('2026-11-15');await form.locator('[name=reason]').fill('等待例会核对测试素材');
  const sent=page.waitForResponse((res:any)=>res.url().endsWith('/api/promotion-timeline')&&res.request().method()==='POST');
  await form.locator('[type=submit]').click();const response=await sent;assert(response.ok(),await response.text());
  await page.waitForFunction(()=>!!document.querySelector('[data-promotion-state-history] form')&&!document.querySelector('[data-promotion-state-history] button[type=submit]:disabled'));
  await settleBusinessUI(page);await host.screenshot({path:dir+'/'+role+'-first-arrangement.png'});
  assert.equal((await f.db.select().from(s.operationsPromotionStartPlan).where(eq(s.operationsPromotionStartPlan.scheduleId,post.schedule.id)))[0].waitingThrough,'2026-11-15');
  await context.close();
 }
 console.log('双方原首次推广安排表单可见、真实保存成功；与只读合并历史分离。');
}finally{await browser.close();await f.stop();}
