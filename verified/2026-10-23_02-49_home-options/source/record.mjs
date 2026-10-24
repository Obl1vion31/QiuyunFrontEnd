/** 同一 240px/s 输入比较三套完整页面；另录降低动态效果的实际滚动。 */
const {chromium}=await import(new URL('../../../.tools/tooling/node_modules/playwright/index.mjs',import.meta.url).href);
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const root=process.cwd(),batch=resolve(root,'verified/2026-10-23_02-49_home-options'),raw=resolve(root,'.tools/test-artifacts/home-options/video');
await mkdir(raw,{recursive:true});await mkdir(resolve(batch,'motion'),{recursive:true});
const browser=await chromium.launch({headless:true});
const reports=[];
const scroll=(page,y,speed)=>page.evaluate(async({y,speed})=>{const from=scrollY,distance=y-from,duration=Math.abs(distance)/speed*1000;await new Promise(resolve=>{let start;function tick(t){start??=t;const p=Math.min(1,(t-start)/Math.max(1,duration));scrollTo(0,from+distance*p);if(p<1)requestAnimationFrame(tick);else requestAnimationFrame(resolve);}requestAnimationFrame(tick);});},{y,speed});
try{
 for(const variant of['a','b','c']){
  const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1,recordVideo:{dir:raw,size:{width:1440,height:900}}});
  const page=await context.newPage();await page.goto(`http://127.0.0.1:4330/preview/${variant}.html`);await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(n=>n.decode().catch(()=>{})));});
  await page.evaluate(()=>{window.__motionFrames=[];window.__recordMotion=true;let previous;function sample(t){if(!window.__recordMotion)return;const covers=[...document.querySelectorAll('[data-cover]')],rail=document.querySelector('.rail');window.__motionFrames.push({t,delta:previous===undefined?0:t-previous,y:scrollY,progress:document.querySelector('.hero').dataset.progress,stage:document.querySelector('[data-active-stage]').textContent,transforms:covers.map(n=>n.style.transform),railTop:rail.getBoundingClientRect().top});previous=t;requestAnimationFrame(sample);}requestAnimationFrame(sample);});
  await page.waitForTimeout(1000);
  const max=await page.evaluate(()=>document.documentElement.scrollHeight-innerHeight);
  await scroll(page,max,240);await page.waitForTimeout(900);
  const heroDistance=await page.locator('.hero').evaluate(n=>n.offsetHeight-innerHeight);
  await scroll(page,heroDistance*.45,600);await page.waitForTimeout(450);await scroll(page,0,600);await page.waitForTimeout(900);
  const frames=await page.evaluate(()=>{window.__recordMotion=false;return window.__motionFrames;});
  await context.close();const original=await page.video().path();
  const ordered=frames.filter(f=>f.delta>0).map(f=>f.delta).sort((a,b)=>a-b),p95=ordered[Math.floor(ordered.length*.95)];
  reports.push({variant,video:original,speed:240,frames:frames.length,p95FrameMs:p95,longestFrameMs:ordered.at(-1),stages:[...new Set(frames.map(f=>f.stage))]});
  await writeFile(resolve(batch,'motion',`${variant}-frames.json`),JSON.stringify(frames));
 }
 const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce',recordVideo:{dir:raw,size:{width:1440,height:900}}}),page=await context.newPage();
 await page.goto('http://127.0.0.1:4330/preview/a.html');await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(600);await scroll(page,await page.evaluate(()=>document.documentElement.scrollHeight-innerHeight),240);await page.waitForTimeout(600);await context.close();
 reports.push({variant:'reduced',video:await page.video().path(),speed:240});
 await writeFile(resolve(batch,'motion/report.json'),JSON.stringify(reports,null,2));console.log(JSON.stringify(reports,null,2));
}finally{await browser.close();}
