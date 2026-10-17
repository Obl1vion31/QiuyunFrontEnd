/** 使用隔离数据库验收员工暂停权限与桌面、手机布局。 */
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { startFixture, employee } from './auth.fixture';
import * as schema from '../src/db/schema';
import { nextDateKey, previousDateKey, shanghaiDateKey } from '../src/db/promotion-rules.mjs';
const fixture=await startFixture();const {db,baseURL}=fixture;
let browser:any;
try {
  const today=shanghaiDateKey(new Date()),yesterday=previousDateKey(previousDateKey(today));
  const campaigns=[];
  for(let i=0;i<5;i++) {
    const stage=i===2?'testing':'scaling';const status=i>2?'waiting_action':stage;
    const [content]=await db.insert(schema.operationsContent).values({platformNoteId:(i+1).toString().repeat(24)}).returning();
    const [version]=await db.insert(schema.operationsContentVersion).values({contentId:content.id,versionNumber:0,workType:'new',contentName:`虚构暂停验收 ${i+1}`,subjectId:'tmua',categoryId:'temporary',projectDocUrl:'https://fictional.example.test/post'}).returning();
    const [schedule]=await db.insert(schema.operationsContentSchedule).values({contentVersionId:version.id,plannedPublishAt:new Date(`${yesterday}T09:00:00+08:00`),actualPublishAt:new Date(`${yesterday}T09:00:00+08:00`),isPromoted:true,promotionStatus:status,completionStatus:'on_time'}).returning();
    const [campaign]=await db.insert(schema.operationsPromotionCampaign).values({scheduleId:schedule.id,startedOn:yesterday,initialStage:stage,currentStage:stage,currentStatus:status}).returning();campaigns.push(campaign);
    await db.insert(schema.operationsPromotionStage).values({campaignId:campaign.id,stageType:stage,startedOn:yesterday,...(i>2?{endedOn:yesterday,outcome:'paused'}:{})});
    await db.insert(schema.operationsPromotionDailyMetric).values({campaignId:campaign.id,metricDate:yesterday,dailyStatus:'active',stageTypeSnapshot:stage,spend:'10',platformOpenCount:1,actualOpenCount:1,platformLeadCount:1,actualLeadCount:1,reviewDecision:i>2?'wait_continue':stage==='testing'?'test_continue':'scaling_continue'});
  }
  const login=await fetch(`${baseURL}/api/auth/sign-in/username`,{method:'POST',headers:{Origin:baseURL,'Content-Type':'application/json'},body:JSON.stringify(employee)});assert.equal(login.status,200);
  const cookie=login.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
  const form=(data:Record<string,string>)=>{const f=new FormData();for(const [k,v]of Object.entries(data))f.set(k,v);return f;};
  async function request(path:string,method='GET',data?:Record<string,string>,expected=200){const response=await fetch(baseURL+path,{method,headers:{Origin:baseURL,Cookie:cookie},body:data?form(data):undefined});const body=await response.json();assert.equal(response.status,expected,JSON.stringify(body));return body;}
  assert.equal((await fetch(baseURL+'/api/promotion-pauses')).status,401);
  assert.equal((await fetch(baseURL+'/api/promotion-pauses',{method:'POST',headers:{Cookie:cookie,Origin:'https://foreign.example.test'},body:form({endsOn:today,requestKey:randomUUID()})})).status,403);
  const key=randomUUID();const created=await request('/api/promotion-pauses','POST',{endsOn:nextDateKey(today),requestKey:key},201);assert.equal(created.affected,3);
  const repeated=await request('/api/promotion-pauses','POST',{endsOn:nextDateKey(today),requestKey:key},201);assert.equal(repeated.id,created.id);
  await request('/api/promotion-pauses','POST',{endsOn:today,requestKey:randomUUID()},409);
  const day=await request('/api/promotion-daily');assert.equal(day.rows.filter((r:any)=>r.effectiveStatus==='promotion_paused').length,5);
  await request(`/api/promotion-pauses/${created.id}`,'PATCH',{action:'extend',endsOn:nextDateKey(nextDateKey(today)),expectedRevision:'0'});
  await request(`/api/promotion-pauses/${created.id}`,'PATCH',{action:'resume',expectedRevision:'0'},409);
  const playwright=await import(process.env.PLAYWRIGHT_MODULE||new URL('../.tools/tooling/node_modules/playwright/index.mjs',import.meta.url).href);
  browser=await playwright.chromium.launch({headless:true});await mkdir('.tools/test-artifacts',{recursive:true});
  const errors:string[]=[];
  for(const width of [1440,390,320]) {
    const context=await browser.newContext({viewport:{width,height:1000},...(width<900?{isMobile:true,hasTouch:true}:{})});
    await context.addCookies(cookie.split('; ').map(pair=>({name:pair.slice(0,pair.indexOf('=')),value:pair.slice(pair.indexOf('=')+1),url:baseURL})));
    const page=await context.newPage();page.on('pageerror',(error:Error)=>errors.push(error.message));
    await page.goto(baseURL+'/business/daily-promotion-review');await page.locator('[data-promotion-pause]').waitFor();
    if(width===320){await page.getByRole('button',{name:'一键暂停 3 篇'}).click();await page.locator('[data-pause-form] button[value=resume]').waitFor();}
    assert.ok((await page.locator('[data-promotion-pause]').textContent()).includes('3'));
    assert.ok(await page.locator('[data-pause-form] button[value=resume]').isVisible());
    assert.ok(await page.locator('[data-metric-form]').count()>0,'包含真实待填表单验收密度');
    const panel=await page.locator('[data-promotion-pause]').boundingBox();const table=await page.locator('.pending-heading').boundingBox();
    assert.ok(panel.x>=table.x && panel.y>=table.y && panel.y+panel.height<=table.y+table.height+1,'暂停控件完整放在待完成栏内');
    if(width===1440){const title=await page.locator('#daily-title').boundingBox();assert.ok(panel.x>title.x+title.width && Math.abs(panel.y-title.y)<10,'桌面同一行最右侧');}
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
    await page.evaluate(()=>window.scrollTo(0,0));
    await page.screenshot({path:`.tools/test-artifacts/promotion-pause-${width}.png`,fullPage:true});
    if(width===390){await page.locator('[data-pause-form] button[value=resume]').click();await page.getByRole('button',{name:'一键暂停 3 篇'}).waitFor();}
    await context.close();
  }
  assert.deepEqual(errors,[]);
  console.log('通过：员工创建／调整／恢复、幂等、CSRF、并发版本保护、三篇实际投放目标与桌面/390/320px布局。');
} finally {await browser?.close();await fixture.stop();}
