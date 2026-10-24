/** 真实 DOM 内容、键盘、主运动职责与预览链接回归。只读取静态预览。 */
const{chromium}=await import(new URL('../../../.tools/tooling/node_modules/playwright/index.mjs',import.meta.url).href);
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const batch='verified/2026-10-23_02-49_home-options',content=JSON.parse(await readFile(`${batch}/content-snapshot.json`,'utf8'));
const browser=await chromium.launch({headless:true}),results=[];
try{
 for(const variant of['a','b','c']){
  const page=await browser.newPage({viewport:{width:1440,height:900}}),writes=[];
  page.on('request',r=>{if(!['GET','HEAD'].includes(r.method()))writes.push(r.method()+' '+r.url());});
  await page.goto(`http://localhost:4330/preview/${variant}.html`);await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(750);
  const data=await page.evaluate(()=>({text:document.querySelector('main').textContent,title:document.querySelector('h1').textContent,stages:[...document.querySelectorAll('.workflow__track li')].map(n=>n.textContent),goals:[...document.querySelectorAll('.goals strong')].map(n=>n.textContent.replace(/→/g,'').trim()),entries:[...document.querySelectorAll('.systems__list article')].map(n=>({text:n.textContent,href:n.querySelector('a')?.getAttribute('data-original-href')||null})),images:[...document.querySelectorAll('[data-cover] img')].map(n=>({src:n.getAttribute('src'),loaded:n.complete&&n.naturalWidth>0})),running:document.querySelector('.cover-scene').getAnimations().filter(a=>a.playState==='running').length,transforms:[...document.querySelectorAll('[data-cover]')].map(n=>n.style.transform)}));
  assert.equal(data.title,content.hero.title.join(''));for(const s of[content.hero.note,content.mission.body,content.mission.boundary,content.workflow.title,content.workflow.intro,content.systems.title,content.systems.intro])assert.ok(data.text.includes(s),`${variant}缺少内容${s}`);
  assert.deepEqual(data.goals,content.hero.statement);assert.equal(data.stages.length,6);
  content.workflow.stages.forEach((s,i)=>{for(const v of[s.label,s.verb,s.description])assert.ok(data.stages[i].includes(v));});
  content.systems.entries.forEach((e,i)=>{for(const s of[e.title,e.summary,e.cta])assert.ok(data.entries[i].text.includes(s));assert.equal(data.entries[i].href,e.href||null);});
  assert.equal(new Set(data.images.map(i=>i.src)).size,8);assert.ok(data.images.every(i=>i.loaded));assert.equal(data.running,0);
  await page.keyboard.press('Tab');assert.equal(await page.locator('.skip-link').evaluate(n=>n===document.activeElement&&n.getBoundingClientRect().top>=0),true);await page.keyboard.press('Enter');assert.ok(await page.evaluate(()=>scrollY>0));
  await page.evaluate(()=>scrollTo(0,document.querySelector('.hero').offsetHeight-innerHeight));await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  const settled=await page.locator('[data-cover]').evaluateAll(nodes=>nodes.map(n=>n.style.transform));
  if(variant==='a')assert.notDeepEqual(settled,data.transforms);if(variant==='b')assert.deepEqual(settled,data.transforms);
  await page.evaluate(()=>scrollTo(0,0));await page.waitForTimeout(50);if(variant==='c')assert.equal(await page.locator('.cover-scene').evaluate(n=>n.getAnimations().filter(a=>a.playState==='running').length),0);
  assert.deepEqual(writes,[]);results.push({variant,content:'全部文案、六阶段顺序、8张封面和3入口一致',keyboard:'跳到工作流可用',motion:'主运动职责与回退通过',writes:0});await page.close();
 }
 const page=await browser.newPage({viewport:{width:1440,height:900}});await page.goto('http://localhost:4330/');assert.ok(page.url().endsWith('/preview/index.html'));await page.evaluate(()=>document.fonts.ready);
 const urls=await page.locator('a[href],img[src]').evaluateAll(nodes=>nodes.map(n=>n.href||n.src).filter(u=>u.startsWith(location.origin)));
 for(const url of new Set(urls)){const response=await fetch(url);assert.equal(response.status,200,`预览资源不能访问${url}`);}
 await page.screenshot({path:`${batch}/comparison-1440.png`,fullPage:true});
 await page.setViewportSize({width:1024,height:768});await page.screenshot({path:`${batch}/comparison-1024.png`,fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),1024);
 await writeFile(`${batch}/checks.json`,JSON.stringify({status:'passed',desktopOnly:true,cases:results,galleryLinks:new Set(urls).size},null,2)+'\n');console.log('通过：全部内容与状态、八张独立封面、键盘跳转、A归位/B静态、C入场不重播、无写入请求、对比入口和全部本地链接。');
}finally{await browser.close();}
