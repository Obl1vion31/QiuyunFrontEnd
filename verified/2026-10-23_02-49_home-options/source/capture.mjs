/** 桌面预览回归：真实浏览器几何、相同输入速度的滚动记录与最终截图。 */
const {chromium}=await import(new URL('../../../.tools/tooling/node_modules/playwright/index.mjs',import.meta.url).href);
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const root=process.cwd(),batch=resolve(root,'verified/2026-10-23_02-49_home-options'),raw=resolve(root,'.tools/test-artifacts/home-options');
const browser=await chromium.launch({headless:true});
const results={viewports:[],errors:[],source:'src/data/home.ts; baseline current unchanged static build',desktopOnly:true};
const round=n=>Math.round(n*10)/10;
const settle=page=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
async function ready(page,url){await page.goto(url);await page.locator('.workflow').waitFor();await page.evaluate(async()=>{if(document.activeElement instanceof HTMLElement)document.activeElement.blur();await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode().catch(()=>{})));});await page.mouse.click(1,1);await settle(page);}
async function geometry(page,baseline=false){return page.evaluate(baseline=>{
 const select=selector=>document.querySelector(selector),rect=node=>{const r=node.getBoundingClientRect();return{x:r.x,y:r.y+scrollY,width:r.width,height:r.height,bottom:r.bottom+scrollY};};
 const workflow=rect(select('.workflow')),systems=rect(select('.systems')),hero=rect(select(baseline?'main>astro-island>section':'.hero'));
 const action=select(baseline?'.systems__list a':'.entry-action');
 const rail=select(baseline?'[aria-label="当前工作流环节"]':'.rail'),copy=select(baseline?'[role="region"]':'.hero__copy');
 const result={totalHeight:document.documentElement.scrollHeight,lowerHeight:Math.max(workflow.bottom,systems.bottom)-Math.min(workflow.y,systems.y),heroHeight:hero.height,workflow,systems,firstAction:rect(action).y,overflow:document.documentElement.scrollWidth-innerWidth,font:getComputedStyle(document.body).fontFamily,coverCount:document.querySelectorAll(baseline?'[class*="cover_"] img':'[data-cover] img').length};
 if(!baseline){result.layoutSafe=copy.getBoundingClientRect().bottom<rail.getBoundingClientRect().top;result.copyBottom=copy.getBoundingClientRect().bottom;result.railTop=rail.getBoundingClientRect().top;result.covers=[...document.querySelectorAll('[data-cover]')].map(n=>({transform:n.style.transform,rect:rect(n)}));result.currentStage=document.querySelector('[data-active-stage]').textContent;result.fontLoaded=document.fonts.check('500 15px "MiSans VF"','前端内容工作台');}
 return result;
 },baseline);}
try{
 for(const [width,height]of[[1440,900],[1280,800],[1024,768]]){
  const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1,reducedMotion:'no-preference'}),page=await context.newPage();
  page.on('pageerror',e=>results.errors.push({width,message:e.message}));
  const row={width,height,baseline:null,variants:{}};
  await ready(page,'http://127.0.0.1:4330/baseline/');row.baseline=await geometry(page,true);
  await mkdir(resolve(batch,'screenshots/baseline'),{recursive:true});
  if(width===1440){await page.screenshot({path:resolve(batch,'screenshots/baseline/hero-1440.png')});await page.screenshot({path:resolve(raw,'baseline-full-1440.png'),fullPage:true});}
  for(const v of['a','b','c']){
   const page=await context.newPage();page.on('pageerror',e=>results.errors.push({v,width,message:e.message}));
   const dir=resolve(batch,'screenshots',v);await mkdir(dir,{recursive:true});
   await ready(page,`http://127.0.0.1:4330/preview/${v}.html`);await page.waitForTimeout(v==='c'?750:30);
   const g=await geometry(page);row.variants[v]=g;
   if(g.overflow>1)results.errors.push({v,width,message:`页面横向溢出${g.overflow}px`});
   if(!g.layoutSafe)results.errors.push({v,width,message:`文字与轨道重叠: ${g.copyBottom}/${g.railTop}`});
   if(g.coverCount!==8)results.errors.push({v,width,message:'封面数量不等于8'});
   if(!g.fontLoaded)results.errors.push({v,width,message:'MiSans未加载'});
   if(width===1440&&g.lowerHeight>row.baseline.lowerHeight*.7)results.errors.push({v,width,message:'后两区没有缩短至少30%'});
   await page.screenshot({path:resolve(dir,`hero-${width}.png`)});
   await page.screenshot({path:resolve(raw,`${v}-full-raw-${width}.png`),fullPage:true});
   // 面板高于视口时扩大捕获高度，避免浏览器把屏外 fixed skip-link 绘入元素截图。
   await page.setViewportSize({width,height:Math.max(height,Math.ceil(g.lowerHeight)+1)});await settle(page);
   await page.locator('.lower-content').screenshot({path:resolve(dir,`lower-${width}.png`)});
   await page.setViewportSize({width,height});await settle(page);
   await page.evaluate(()=>scrollTo(0,0));await settle(page);
   const scrollDistance=await page.locator('.hero').evaluate(n=>Math.max(0,n.offsetHeight-innerHeight));
   for(const [state,fraction]of[['mid',.5],['settled',.83],['handoff',1]]){
    const y=state==='handoff'?Math.max(0,g.heroHeight-height*.52):scrollDistance*fraction;
    await page.evaluate(y=>scrollTo(0,y),y);await settle(page);
    if(width===1440)await page.screenshot({path:resolve(dir,`${state}-${width}.png`)});
   }
   await page.evaluate(()=>scrollTo(0,0));await settle(page);
   const back=await geometry(page);if(v!=='c'&&back.currentStage!=='策划')results.errors.push({v,width,message:'滚回顶部未恢复策划'});
   const transforms=back.covers.map(c=>c.transform);await page.waitForTimeout(120);const staticTransforms=(await geometry(page)).covers.map(c=>c.transform);
   if(JSON.stringify(transforms)!==JSON.stringify(staticTransforms))results.errors.push({v,width,message:'页面静止时仍在持续运动'});
   await page.emulateMedia({reducedMotion:'reduce'});await page.evaluate(()=>scrollTo(0,0));await settle(page);const reduced=await geometry(page);g.reduced={heroHeight:reduced.heroHeight,totalHeight:reduced.totalHeight};
   if(reduced.heroHeight>height+1)results.errors.push({v,width,message:'减少动态效果仍保留额外Hero占位'});
   if(width===1440)await page.screenshot({path:resolve(dir,'reduced-1440.png')});
   await page.emulateMedia({reducedMotion:'no-preference'});
   await page.keyboard.press('Tab');const focus=await page.evaluate(()=>document.activeElement?.className);g.keyboardFirst=focus;
   await page.close();
  }
  results.viewports.push(row);await context.close();
 }
 // 图片缺失仍可辨认，不坍塌布局；只拦截本地公开素材读取。
 const context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage();
 await page.route('**/assets/covers/cover-1.png',route=>route.abort());await ready(page,'http://127.0.0.1:4330/preview/a.html');
 const fallback=await page.locator('[data-cover="0"]').getAttribute('class');if(!fallback.includes('image-failed'))results.errors.push({message:'缺图回退未生效'});
 await page.screenshot({path:resolve(batch,'screenshots/a/image-failed-1440.png')});await context.close();
 await writeFile(resolve(batch,'metrics.json'),JSON.stringify(results,null,2));await writeFile(resolve(raw,'metrics.json'),JSON.stringify(results,null,2));
 console.log(JSON.stringify(results.viewports.map(r=>({width:r.width,baseline:round(r.baseline.totalHeight),variants:Object.fromEntries(Object.entries(r.variants).map(([k,g])=>[k,{total:round(g.totalHeight),lower:round(g.lowerHeight),saved:Math.round((1-g.lowerHeight/r.baseline.lowerHeight)*100)+'%',firstAction:round(g.firstAction)}]))})),null,2));
 if(results.errors.length)throw new Error(JSON.stringify(results.errors,null,2));
 console.log('通过：3套×3档桌面，完整内容、无横向溢出、轨道避让、滚回、静止、减少动态效果、真实字体和缺图回退。');
}finally{await browser.close();}
