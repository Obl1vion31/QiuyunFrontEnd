/** 样片实测与浏览器录像；不连接业务数据。 */
import {mkdir,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const {chromium}=await import(new URL('../../../.tools/tooling/node_modules/playwright/index.mjs',import.meta.url).href);
const source=dirname(fileURLToPath(import.meta.url)),batch=resolve(source,'..'),root=resolve(batch,'../..'),raw=resolve(root,'.tools/test-artifacts/home-cinematic');
await mkdir(raw,{recursive:true});await mkdir(resolve(batch,'screenshots'),{recursive:true});await mkdir(resolve(batch,'motion'),{recursive:true});
const url='http://127.0.0.1:4331/preview/index.html',browser=await chromium.launch({headless:true});
const results={viewports:[],errors:[],motion:[],desktopOnly:true,source:'A preview c2ae43b; src/data/home.ts original public covers'};
const ready=async page=>{page.on('pageerror',e=>results.errors.push(e.message));await page.goto(url);await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode().catch(()=>{})));});await page.waitForFunction(()=>document.querySelector('.hero').dataset.motionReady==='true');};
const snap=page=>page.evaluate(()=>{const hero=document.querySelector('.hero'),frame=document.querySelector('.hero__frame'),copy=document.querySelector('.hero__copy').getBoundingClientRect(),rail=document.querySelector('.rail').getBoundingClientRect();return{width:innerWidth,height:innerHeight,phase:+hero.dataset.phase,playback:hero.dataset.playback,progress:+hero.dataset.progress,stage:document.querySelector('[data-active-stage]').textContent,totalHeight:document.documentElement.scrollHeight,heroHeight:hero.offsetHeight,distance:hero.offsetHeight-frame.offsetHeight,lowerHeight:document.querySelector('.lower-content').offsetHeight,overflow:document.documentElement.scrollWidth-innerWidth,fontLoaded:document.fonts.check('500 15px "MiSans VF"','前端内容工作台'),copyBottom:copy.bottom,railTop:rail.top,cards:[...document.querySelectorAll('[data-cover]')].map(n=>{const r=n.getBoundingClientRect();return{id:n.dataset.cover,opacity:+n.style.opacity,transform:n.style.transform,x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom};})};});
const scroll=(page,y,speed)=>page.evaluate(async({y,speed})=>{const from=scrollY,d=y-from,duration=Math.abs(d)/speed*1000;await new Promise(resolve=>{let start;function tick(t){start??=t;const p=Math.min(1,(t-start)/Math.max(1,duration));scrollTo(0,from+d*p);if(p<1)requestAnimationFrame(tick);else requestAnimationFrame(resolve);}requestAnimationFrame(tick);});},{y,speed});
const settle=page=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
async function capture(){
 for(const [width,height]of[[1440,900],[1280,800],[1024,768]]){
  const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1}),page=await context.newPage();await ready(page);
  const initial=await snap(page);assert.equal(initial.overflow,0);assert.equal(initial.cards.length,8);assert(initial.fontLoaded);assert.equal(initial.stage,'策划');assert(initial.cards.filter(n=>n.opacity>.98).length===3);
  const clear=initial.cards.filter(n=>n.opacity>.98);assert(Math.min(...clear.map(n=>n.y))>initial.copyBottom+8,'中央封面应避开文案');assert(Math.max(...clear.map(n=>n.bottom))<initial.railTop-12,'中央封面应避开流程轨道');
  await page.screenshot({path:resolve(batch,`screenshots/initial-${width}.png`)});
  const hold=await snap(page);await page.waitForTimeout(750);assert.equal((await snap(page)).phase,hold.phase,'完全停留时不应漂移');
  await page.waitForFunction(()=>{const p=+document.querySelector('.hero').dataset.phase;return p>.43&&p<.64;});await page.screenshot({path:resolve(batch,`screenshots/advance-${width}.png`)});
  await page.waitForFunction(()=>+document.querySelector('.hero').dataset.phase>=1&&document.querySelector('.hero').dataset.playback==='hold');const next=await snap(page);assert.equal(next.stage,'策划','自动播放不推动六阶段');await page.screenshot({path:resolve(batch,`screenshots/next-group-${width}.png`)});
  // 暂停后跨过完整周期仍不改变封面；原生按钮可以用键盘恢复。
  await page.getByRole('button',{name:'暂停封面轮播',exact:true}).click();const paused=await snap(page);await page.waitForTimeout(150);assert.equal((await snap(page)).phase,paused.phase);await page.getByRole('button',{name:'播放封面轮播',exact:true}).press('Enter');
  await page.evaluate(y=>scrollTo(0,y),initial.distance*.12);await settle(page);const frozen=await snap(page);await page.waitForTimeout(160);assert.equal((await snap(page)).phase,frozen.phase,'滚动期间自动相位冻结');
  const stageSequence=[];
  for(let i=0;i<6;i++){await page.evaluate(y=>scrollTo(0,y),initial.distance*(i+.4)/6);await settle(page);stageSequence.push((await snap(page)).stage);}assert.deepEqual(stageSequence,['策划','内容','视觉','发布','触点','复盘']);
  await page.evaluate(y=>scrollTo(0,y),initial.distance*.5);await settle(page);await page.screenshot({path:resolve(batch,`screenshots/mid-scroll-${width}.png`)});
  await page.evaluate(y=>scrollTo(0,y),initial.distance*.83);await settle(page);const settled=await snap(page);assert(settled.cards.every(n=>n.opacity===1));await page.screenshot({path:resolve(batch,`screenshots/settled-${width}.png`)});
  await page.evaluate(y=>scrollTo(0,y),initial.heroHeight-height*.52);await settle(page);await page.screenshot({path:resolve(batch,`screenshots/handoff-${width}.png`)});
  await page.evaluate(()=>scrollTo(0,0));await settle(page);assert.equal((await snap(page)).stage,'策划');
  await page.setViewportSize({width,height:initial.lowerHeight+1});await settle(page);await page.locator('.lower-content').screenshot({path:resolve(batch,`screenshots/lower-${width}.png`)});await page.setViewportSize({width,height});
  await page.emulateMedia({reducedMotion:'reduce'});await page.evaluate(()=>scrollTo(0,0));await settle(page);const reduced=await snap(page);assert.equal(reduced.heroHeight,height);await page.waitForTimeout(300);assert.equal((await snap(page)).phase,reduced.phase);assert(await page.locator('.cover-controls').isHidden());await page.screenshot({path:resolve(batch,`screenshots/reduced-${width}.png`)});
  results.viewports.push({initial,next,stageSequence,settled,reduced});await context.close();
 }
 const context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage();await page.route('**/assets/covers/cover-4.*',route=>route.abort());await ready(page);assert((await page.locator('[data-cover="3"]').getAttribute('class')).includes('image-failed'));await page.screenshot({path:resolve(batch,'screenshots/image-failed-1440.png')});await context.close();
}
async function record(){
 const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1,recordVideo:{dir:raw,size:{width:1440,height:900}}}),page=await context.newPage();await ready(page);
 await page.evaluate(()=>{window.__frames=[];window.__sampling=true;let previous;function sample(t){if(!window.__sampling)return;const h=document.querySelector('.hero');window.__frames.push({t,dt:previous?t-previous:0,y:scrollY,phase:+h.dataset.phase,progress:+h.dataset.progress,playback:h.dataset.playback,stage:document.querySelector('[data-active-stage]').textContent,cards:[...document.querySelectorAll('[data-cover]')].map(n=>({transform:n.style.transform,opacity:+n.style.opacity}))});previous=t;requestAnimationFrame(sample);}requestAnimationFrame(sample);});
 await page.waitForFunction(()=>+document.querySelector('.hero').dataset.phase>=3);await page.waitForTimeout(700);
 const initial=await snap(page),max=initial.totalHeight-900;
 await scroll(page,max,290);await page.waitForTimeout(700);await scroll(page,0,800);await page.waitForTimeout(4200);
 const frames=await page.evaluate(()=>{window.__sampling=false;return window.__frames;});await writeFile(resolve(raw,'recorded-frames.json'),JSON.stringify(frames));
 const deltas=frames.map(n=>n.dt).filter(n=>n>0).sort((a,b)=>a-b);const stages=[...new Set(frames.map(n=>n.stage))];assert.equal(stages.length,6);
 await context.close();const video=await page.video().path();results.motion.push({video,frames:frames.length,p95FrameMs:deltas[Math.floor(deltas.length*.95)],stages});
 await writeFile(resolve(batch,'motion/keyframes.json'),JSON.stringify(frames.filter((_,i)=>i%30===0),null,2));
 console.log('VIDEO='+video);
}
async function loop(){const context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage();await ready(page);const start=await snap(page);await page.waitForFunction(()=>+document.querySelector('.hero').dataset.phase>=8,null,{timeout:40000});const end=await snap(page);assert.equal(end.phase,8);assert.equal(end.stage,'策划');assert.deepEqual(end.cards.map(n=>n.transform),start.cards.map(n=>n.transform));results.fullLoop={cycles:8,phase:end.phase,sameComposition:true};await context.close();}
try{await Promise.all([capture(),record(),loop()]);assert.deepEqual(results.errors,[]);await writeFile(resolve(batch,'checks.json'),JSON.stringify(results,null,2));console.log('已完成三档桌面、完整8步循环、六阶段、暂停/键盘、往返、减少动态和缺图回退。');}finally{await browser.close();}
