/** Actual Astro navigation and isolated data; delays are injected only at the document response. */
import assert from 'node:assert/strict';
import {copyFile,mkdir,readFile,writeFile} from 'node:fs/promises';
import {startFixture,admin,employee} from './auth.fixture';
import * as schema from '../src/db/schema';
const pw=await import(process.env.PLAYWRIGHT_MODULE||new URL('../.tools/tooling/node_modules/playwright/index.mjs',import.meta.url).href);
const dir=process.env.NAVIGATION_EVIDENCE_DIR||'.tools/test-artifacts/navigation-loading';
await mkdir(dir+'/screenshots',{recursive:true});await mkdir(dir+'/video',{recursive:true});
const clockFile=process.cwd()+'/'+dir+'/clock.txt';await writeFile(clockFile,'2026-11-07T12:00:00+08:00');
const fixture=await startFixture({clockFile,entry:process.env.NAVIGATION_ENTRY});
const browser=await pw.chromium.launch({headless:true});
const source='/business/operations-schedule?month=2026-10',target='/business/non-promotion-review';
const rapidOnly=process.env.NAVIGATION_ONLY_RAPID==='1';
const previous=rapidOnly?JSON.parse(await readFile(dir+'/result.json','utf8')):null;
const results:unknown[]=previous?previous.results.filter((item:any)=>!item.rapidNavigation):[],screenshots:string[]=previous?previous.screenshots.filter((name:string)=>!name.startsWith('cancel-return')&&!name.startsWith('rapid-latest')):[],videos:string[]=previous?previous.videos.filter((name:string)=>name!=='rapid-1440.webm'):[],errors:string[]=[];
const routeNames=[['annual-plan','总周期规划','annual-plan'],['operations-schedule','排期管理','schedule'],['daily-promotion-review','推广帖复盘','daily-promotion'],['non-promotion-review','非推广复盘','non-promotion-review'],['meeting-review','例会总览','meeting-review'],['monthly-operations','月度运营','monthly-operations'],['settings','系统设置','settings']];
async function shot(page:any,name:string){await page.screenshot({path:dir+'/screenshots/'+name+'.png'});screenshots.push(name+'.png');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,name+' 无页面级横向溢出');}
async function settled(page:any,path:string){await page.waitForFunction((pathname:string)=>location.pathname===pathname&&!document.documentElement.dataset.businessNavigation,path,{timeout:15000});await page.waitForFunction(()=>!document.querySelector<HTMLElement>('[data-navigation-loading]')||document.querySelector<HTMLElement>('[data-navigation-loading]')!.hidden);}
async function contextFor(role:'admin'|'employee',width=1440,record=false,reduced=false){
 const context=await browser.newContext({viewport:{width,height:width===1920?1080:1000},locale:'zh-CN',reducedMotion:reduced?'reduce':'no-preference',...(record?{recordVideo:{dir:dir+'/raw-video',size:{width,height:width===1920?1080:1000}}}:{})});
 await context.addInitScript('window.__name=value=>value;');
 const response=await context.request.post(fixture.baseURL+'/api/auth/sign-in/username',{headers:{Origin:fixture.baseURL},data:role==='admin'?admin:employee});assert.equal(response.status(),200);
 const page=await context.newPage();page.on('pageerror',(error:Error)=>errors.push(error.message));
 await page.goto(fixture.baseURL+source);await page.waitForFunction(()=>document.querySelector('[data-business-console-sidebar]')?.getAttribute('data-ready')==='true');await page.evaluate(()=>document.fonts.ready);
 await page.evaluate(()=>{const w=window as any;w.navigationShows=0;w.navigationSidebar=document.querySelector('[data-business-console-sidebar]');document.addEventListener('astro:before-preparation',()=>w.navigationStart=performance.now());document.addEventListener('astro:after-preparation',()=>w.navigationPrepared=performance.now()-w.navigationStart);new MutationObserver(()=>{if(document.querySelector<HTMLElement>('[data-navigation-loading]')?.hidden===false)w.navigationShows++;}).observe(document.body,{subtree:true,attributes:true,attributeFilter:['hidden']});});
 return {context,page};
}
async function close(context:any,page:any,name:string,record:boolean){const video=page.video();await context.close();if(record&&video){const filename=name+'.webm';await copyFile(await video.path(),dir+'/video/'+filename);videos.push(filename);}}
const pause=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
try{
 for(let index=0;index<8;index++){
  const [content]=await fixture.db.insert(schema.operationsContent).values({operationType:'non_promotion_standard',platformNoteId:String(index+1).padStart(24,'0')}).returning();
  const [version]=await fixture.db.insert(schema.operationsContentVersion).values({contentId:content.id,versionNumber:0,workType:'new',contentName:['TMUA 备考：从真题看解题思路','逻辑命题里的常见误区','数列与递推的三种处理方法','用反例检查自己的解答','函数图像：把条件转化为信息','考前练习与时间安排','数学表达中的条件与结论','从一道题到一类问题'][index],subjectId:'tmua',categoryId:'innovation',projectDocUrl:'https://example.test/document'}).returning();
  const date=new Date(`2026-10-${index<4?'27':'28'}T10:00:00+08:00`);
  await fixture.db.insert(schema.operationsContentSchedule).values({contentVersionId:version.id,plannedPublishAt:date,actualPublishAt:date,isPromoted:false,promotionStatus:'none',completionStatus:'on_time',publicationUrl:'https://www.xiaohongshu.com/explore/'+content.platformNoteId});
 }
 if(!rapidOnly)for(const role of ['admin','employee'] as const)for(const width of [1440,1920,1024])for(const delay of [80,800,2500]){
  const name=`${role}-${width}-${delay}`,record=role==='admin'&&(width===1440||delay===2500);
  const {context,page}=await contextFor(role,width,record);
  const response=await context.request.get(fixture.baseURL+target);const html=await response.text();assert.equal(response.status(),200);
  let reads=0;await page.route('**/business/non-promotion-review',async(route:any)=>{reads++;await pause(delay);await route.fulfill({status:200,contentType:'text/html; charset=utf-8',body:html});});
  const before=await page.locator('.business-console-workspace').boundingBox();
  await page.locator('[data-business-console-sidebar] a[data-module-id="non-promotion-review"]').hover();await page.waitForTimeout(160);assert.equal(reads,0,'悬停不预读业务 HTML');
  await page.locator('[data-business-console-sidebar] a[data-module-id="non-promotion-review"]').click();
  let geometry,loadingTab;
  if(delay>120){
   await page.waitForFunction(()=>document.querySelector<HTMLElement>('[data-navigation-loading]')?.hidden===false);
   assert.equal(await page.locator('.business-console-workspace').getAttribute('inert'),'','原页不接收误操作');
   geometry=await page.locator('[data-navigation-loading]').boundingBox();assert.ok(Math.abs(geometry.x-before.x)<=1);assert.ok(Math.abs(geometry.width-before.width)<=1,'骨架宽度等于工作区');
   assert.equal(await page.locator('[data-navigation-loading] .business-toolbar__title strong').innerText(),'非推广复盘');
   loadingTab=await page.locator('[data-navigation-loading] .toolbar-segmented a.active').evaluate((el:Element)=>{const style=getComputedStyle(el);return {background:style.backgroundColor,color:style.color,font:style.font};});
   assert.equal(await page.locator('[data-navigation-loading] input').count(),0,'骨架不伪造录入字段');
   if(delay===2500){await page.locator('[data-navigation-wait]:visible').waitFor();}
   await shot(page,name+'-loading');
  }
  await settled(page,target);assert.equal(reads,1,'实际导航只读取一次业务 HTML');
  assert.equal(await page.locator('[data-review-body] [data-row-href]').count(),8);
  assert.equal(await page.locator('.business-toolbar').count(),1,'完成后只有一个真实工具栏');
  if(loadingTab)assert.deepEqual(loadingTab,await page.locator('.business-console-workspace .toolbar-segmented a.active').evaluate((el:Element)=>{const style=getComputedStyle(el);return {background:style.backgroundColor,color:style.color,font:style.font};}),'骨架与结果的选中按钮共用视觉');
  assert.equal(await page.locator('.business-console-workspace').getAttribute('inert'),null);
  assert.equal(await page.evaluate(()=>(window as any).navigationSidebar===document.querySelector('[data-business-console-sidebar]')),true);
  const preparedMs=await page.evaluate(()=>(window as any).navigationPrepared);
  if(preparedMs<120)assert.equal(await page.evaluate(()=>(window as any).navigationShows),0,'HTML 与样式均在 120ms 内就绪时不闪现骨架');
  await page.waitForTimeout(250);await shot(page,name+'-complete');
  const fonts=await page.locator('.business-console-workspace .business-toolbar__title strong').evaluate((el:Element)=>getComputedStyle(el).fontFamily);assert.match(fonts,/MiSans/);
  let actualFonts;
  if(role==='admin'&&width===1440&&delay===2500){const cdp=await context.newCDPSession(page);await cdp.send('DOM.enable');await cdp.send('CSS.enable');const {root}=await cdp.send('DOM.getDocument');const {nodeId}=await cdp.send('DOM.querySelector',{nodeId:root.nodeId,selector:'.business-console-workspace .business-toolbar__title strong'});actualFonts=(await cdp.send('CSS.getPlatformFontsForNode',{nodeId})).fonts;assert.ok(actualFonts.some((font:any)=>/MiSans/.test(font.familyName)),'真实渲染使用 MiSans');await cdp.detach();}
  results.push({name,role,width,delay,preparedMs,reads,geometry,fonts,actualFonts,passed:true});console.log(name+' passed; document and styles ready in '+Math.round(preparedMs)+'ms');await close(context,page,name,record);
 }
 if(!rapidOnly)for(const reduced of [false,true]){
  const {context,page}=await contextFor('admin',390,false,reduced),html=await (await context.request.get(fixture.baseURL+target)).text();
  await page.route('**/business/non-promotion-review',async(route:any)=>{await pause(1500);await route.fulfill({contentType:'text/html; charset=utf-8',body:html});});
  await page.locator('[data-business-console-sidebar] a[data-module-id="non-promotion-review"]').click();await page.waitForFunction(()=>document.querySelector<HTMLElement>('[data-navigation-loading]')?.hidden===false);
  await shot(page,'mobile-390'+(reduced?'-reduced':'')+'-loading');await settled(page,target);await shot(page,'mobile-390'+(reduced?'-reduced':'')+'-complete');await context.close();
 }
 if(!rapidOnly){
  const {context,page}=await contextFor('admin',1440,true,true),html=await (await context.request.get(fixture.baseURL+target)).text();
  await page.route('**/business/non-promotion-review',async(route:any)=>{await pause(2500);await route.fulfill({contentType:'text/html; charset=utf-8',body:html});});
  await page.locator('[data-business-console-sidebar] a[data-module-id="non-promotion-review"]').click();await page.waitForFunction(()=>document.querySelector<HTMLElement>('[data-navigation-loading]')?.hidden===false);
  assert.equal(await page.locator('[data-navigation-loading] .navigation-bone').first().evaluate((el:Element)=>getComputedStyle(el,'::after').animationName),'none');
  await shot(page,'reduced-1440-loading');await settled(page,target);await shot(page,'reduced-1440-complete');await close(context,page,'reduced-1440',true);results.push({reducedMotion:true,passed:true});
 }
 {
  const {context,page}=await contextFor('admin',1440,true),html=await (await context.request.get(fixture.baseURL+target)).text();
  await page.route('**/business/non-promotion-review',async(route:any)=>{await pause(2500);await route.fulfill({contentType:'text/html; charset=utf-8',body:html});});
  await page.locator('[data-business-console-sidebar] a[data-module-id="non-promotion-review"]').click();await page.waitForFunction(()=>document.querySelector<HTMLElement>('[data-navigation-loading]')?.hidden===false);
  await page.locator('[data-business-console-sidebar] a[data-module-id="schedule"]').click();await settled(page,'/business/operations-schedule');await page.waitForTimeout(2800);
  assert.equal(new URL(page.url()).pathname,'/business/operations-schedule','取消后旧响应不落地');assert.equal(await page.locator('.business-console-workspace').getAttribute('inert'),null);await shot(page,'cancel-return-1440');
  await page.locator('[data-business-console-sidebar] a[data-module-id="non-promotion-review"]').click();await page.waitForFunction(()=>document.querySelector<HTMLElement>('[data-navigation-loading]')?.hidden===false);
  await page.evaluate(()=>{const w=window as any;w.navigationContinuity=[];w.navigationWatching=true;function sample(){if(!w.navigationWatching)return;w.navigationContinuity.push({loading:document.querySelector<HTMLElement>('[data-navigation-loading]')?.hidden===false,path:location.pathname});requestAnimationFrame(sample);}sample();});
  await page.locator('[data-business-console-sidebar] a[data-module-id="monthly-operations"]').click();await settled(page,'/business/monthly-operations');
  const continuity=await page.evaluate(()=>{const w=window as any;w.navigationWatching=false;return w.navigationContinuity;});assert.ok(continuity.filter((frame:any)=>frame.path==='/business/operations-schedule').every((frame:any)=>frame.loading),'改选目标时不闪回原页');
  await page.waitForTimeout(2700);assert.equal(new URL(page.url()).pathname,'/business/monthly-operations');
  await page.goBack();await settled(page,'/business/operations-schedule');await page.goForward();await settled(page,'/business/monthly-operations');await shot(page,'rapid-latest-1440');await close(context,page,'rapid-1440',true);results.push({rapidNavigation:true,history:true,continuity,passed:true});
 }
 if(!rapidOnly){
  const {context,page}=await contextFor('admin',1440,true);await page.goto(fixture.baseURL+target);await settled(page,target);
  await page.locator('[data-row-href] [data-inspector-trigger]').first().click();const input=page.locator('[data-inspector] [data-review-form] input[name="readCount"]');await input.fill('123');
  await page.locator('[data-business-console-sidebar] a[data-module-id="monthly-operations"]').click();await page.locator('[data-business-confirm][open]').waitFor();
  await page.waitForTimeout(250);assert.equal(await page.locator('[data-navigation-loading]:visible').count(),0,'草稿确认前不显示骨架');await page.getByRole('button',{name:'继续编辑',exact:true}).click();await page.locator('[data-business-confirm][open]').waitFor({state:'hidden'});assert.equal(await input.inputValue(),'123');await shot(page,'draft-retained-1440');await close(context,page,'draft-1440',true);results.push({draftProtection:true,passed:true});
 }
 if(!rapidOnly){
  const {context,page}=await contextFor('admin');let attempts=0;
  await page.route('**/business/non-promotion-review',async(route:any)=>{attempts++;if(attempts===1){await pause(400);await route.abort('failed');}else await route.continue();});
  await page.locator('[data-business-console-sidebar] a[data-module-id="non-promotion-review"]').click();await settled(page,target);assert.equal(await page.locator('.business-console-workspace').getAttribute('inert'),null);assert.ok(attempts>=2,'Astro 原生失败回退可完成');results.push({networkFailureFallback:true,passed:true});await context.close();
 }
 // Every module uses the same loader, including keyboard navigation and its proper destination shape.
 if(!rapidOnly)for(const [module,title,id] of routeNames){
  const {context,page}=await contextFor('admin'),path='/business/'+module;
  if(module==='operations-schedule')await page.goto(fixture.baseURL+target);
  const href=await page.locator(`[data-business-console-sidebar] a[data-module-id="${id}"]`).getAttribute('href');
  const html=await (await context.request.get(new URL(href,fixture.baseURL).href)).text();await page.route((url:URL)=>url.pathname===path,async(route:any)=>{await pause(800);await route.fulfill({contentType:'text/html; charset=utf-8',body:html});});
  await page.locator(`[data-business-console-sidebar] a[data-module-id="${id}"]`).focus();await page.keyboard.press('Enter');await page.waitForFunction(()=>document.querySelector<HTMLElement>('[data-navigation-loading]')?.hidden===false);assert.equal(await page.locator('[data-navigation-loading] .business-toolbar__title strong').innerText(),title);await shot(page,'module-'+module+'-1440-loading');await settled(page,'/business/'+module);await shot(page,'module-'+module+'-1440-complete');await context.close();results.push({module,keyboard:true,passed:true});
 }
 await writeFile(dir+'/result.json',JSON.stringify({passed:errors.length===0,isolatedData:true,results,screenshots,videos,errors},null,2));assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,cases:results.length,screenshots:screenshots.length,videos:videos.length,errors}));
}finally{await browser.close();await fixture.stop();}
