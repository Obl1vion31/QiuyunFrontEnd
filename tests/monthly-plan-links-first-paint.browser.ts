import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {startPostgresFixture} from './postgres.fixture';
import {seedLinkPlan,seedLinkPost} from './monthly-plan-links.fixture';
import {employee} from './auth.fixture';
import {settleBusinessUI} from './business-confirm.helper';
import * as s from '../src/db/schema';
const dir='.tools/test-artifacts/monthly-plan-linking/first-paint';await mkdir(dir,{recursive:true});
const f=await startPostgresFixture(),{db,baseURL}=f;let browser:any,context:any;
const sample="{window.__startMonthlyFrames=function(){window.__monthlyFrames=[];const token=window.__monthlySampleToken=(window.__monthlySampleToken||0)+1;function sample(t){if(token!==window.__monthlySampleToken)return;const pool=document.querySelector('[data-monthly-plan-pool]'),grid=document.querySelector('.calendar-grid'),card=document.querySelector('.calendar-item');if(pool&&grid&&card){const a=grid.getBoundingClientRect(),p=pool.getBoundingClientRect();window.__monthlyFrames.push({t,y:a.y,width:a.width,poolY:p.y,poolHeight:p.height,membership:!!card.querySelector('.monthly-card-membership'),font:getComputedStyle(card).fontFamily});}if(window.__monthlyFrames.length<180)requestAnimationFrame(sample);}requestAnimationFrame(sample);};window.__startMonthlyFrames();}";
try{
 const plan=await seedLinkPlan(db),post=await seedLinkPost(db,'首屏已有计划标记的讲义');
 await db.insert(s.operationsMonthlyPlanAssignment).values({planId:plan.plan.id,itemId:plan.items[0].id,scheduleId:post.schedule.id,firstSubmittedAt:new Date('2026-11-01T02:00Z'),history:[{phase:'applied',at:'2026-11-01T02:00Z',actor:'fixture',scheduleId:post.schedule.id,reason:''}]});
 const playwright=await import(process.env.PLAYWRIGHT_MODULE!);browser=await playwright.chromium.launch({headless:true,args:['--no-sandbox']});
 context=await browser.newContext({viewport:{width:1440,height:1000},recordVideo:{dir,size:{width:1440,height:1000}}});
 const login=await fetch(baseURL+'/api/auth/sign-in/username',{method:'POST',headers:{Origin:baseURL,'Content-Type':'application/json'},body:JSON.stringify(employee)});assert.equal(login.status,200);
 await context.addCookies(login.headers.getSetCookie().map(cookie=>{const pair=cookie.split(';')[0],pos=pair.indexOf('=');return {name:pair.slice(0,pos),value:pair.slice(pos+1),url:baseURL};}));
 await context.addInitScript(sample);const page=await context.newPage(),errors:string[]=[];page.on('pageerror',(e:any)=>errors.push(e.message));
 const result:any[]=[];
 async function capture(name:string){await settleBusinessUI(page);await page.waitForTimeout(1600);const frames=await page.evaluate(()=>(window as any).__monthlyFrames);assert(frames.length>5,name);const heights=frames.map((r:any)=>r.y);assert(Math.max(...heights)-Math.min(...heights)<=1,name+' calendar shifted');assert(frames.every((r:any)=>r.membership),name+' membership arrived after paint');assert(frames.every((r:any)=>r.font.includes('MiSans')));result.push({name,frames});await page.screenshot({path:dir+'/'+name+'.png'});console.log('PASS '+name);}
 await page.route('**/fonts/**',async(route:any)=>{await new Promise(resolve=>setTimeout(resolve,700));await route.continue();});await page.goto(baseURL+'/business/operations-schedule?month=2026-11');await capture('cold-slow-font');await page.unroute('**/fonts/**');
 await page.reload();await capture('warm-hard-reload');
 await page.getByRole('link',{name:'总周期规划',exact:true}).click();await page.waitForURL('**/business/annual-plan');
 await page.evaluate(()=>(window as any).__startMonthlyFrames());await page.getByRole('link',{name:'排期管理',exact:true}).click();await page.waitForURL(/\/business\/operations-schedule(?:\?|$)/);await capture('in-app-navigation');
 assert.deepEqual(errors,[]);await context.close();context=null;await page.video()!.saveAs(dir+'/first-paint.webm');
 await writeFile(dir+'/results.json',JSON.stringify({passed:true,result,errors},null,2));
}finally{await context?.close();await browser?.close();await f.stop();}
