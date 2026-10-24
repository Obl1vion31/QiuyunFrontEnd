import {readFile,writeFile,readdir} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const {chromium}=await import(new URL('../../../.tools/tooling/node_modules/playwright/index.mjs',import.meta.url).href);
const source=dirname(fileURLToPath(import.meta.url)),batch=resolve(source,'..'),baseline=resolve(batch,'../2026-10-23_02-49_home-options');
const body=s=>s.match(/<body[\s\S]*<\/body>/)[0].replace(/<script>[\s\S]*?<\/script>/,'').replace(/<div class="cover-controls shell">[\s\S]*?<\/div>/,'').replace(/<div class="cover-scene shell" aria-label="内容封面">[\s\S]*?<\/div><div class="hero__copy/,'<div class="cover-scene shell"></div><div class="hero__copy');
assert.equal(body(await readFile(resolve(batch,'preview/index.html'),'utf8')),body(await readFile(resolve(baseline,'preview/a.html'),'utf8')));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
async function hashes(base,rel=''){const out={};for(const n of await readdir(resolve(base,rel),{withFileTypes:true})){const file=rel?rel+'/'+n.name:n.name;if(n.isDirectory())Object.assign(out,await hashes(base,file));else out[file]=hash(await readFile(resolve(base,file)));}return out;}
assert.deepEqual(await hashes(resolve(batch,'preview/assets/fonts')),await hashes(resolve(baseline,'preview/assets/fonts')));
const manifest=JSON.parse(await readFile(resolve(batch,'assets-manifest.json'),'utf8'));assert.equal(manifest.length,9);
const imageChecks=[];for(const item of manifest){const bytes=await readFile(resolve(batch,'preview/assets/covers',item.file));assert.equal(hash(bytes),item.sha256);let originalAvailable=true,originalMatch;try{originalMatch=hash(await readFile('/mnt/c/Users/14878/AppData/Local/Temp/'+item.original))===item.sha256;assert(originalMatch);}catch(e){if(e.code==='ENOENT')originalAvailable=false;else throw e;}imageChecks.push({file:item.file,hash:item.sha256,originalAvailable,originalMatch,width:item.width,height:item.height});}
const browser=await chromium.launch({headless:true,ignoreDefaultArgs:['--disable-back-forward-cache']});
const report={sameBusinessContentAndLowerMarkup:true,sameFonts:true,userImages:imageChecks,history:null,pause:null,offline:null,unexpectedWrites:[]};
try{
 const context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage();page.on('request',req=>{if(!['GET','HEAD'].includes(req.method()))report.unexpectedWrites.push({method:req.method(),url:req.url()});});
 await page.goto('http://127.0.0.1:4332/preview/index.html');await page.waitForFunction(()=>document.querySelector('.hero').dataset.motionReady==='true');
 await page.evaluate(()=>{window.__restored=false;addEventListener('pageshow',e=>{window.__restored=e.persisted;});});await page.goto('about:blank');await page.goBack();await page.waitForFunction(()=>document.querySelector('.hero')?.dataset.motionReady==='true');report.history={bfcacheRestored:await page.evaluate(()=>window.__restored===true)};
 await page.evaluate(()=>scrollTo(0,600));await page.waitForFunction(()=>document.querySelector('.hero').dataset.playback==='flat-loop');const before=+(await page.locator('.hero').getAttribute('data-phase'));await page.waitForTimeout(800);assert(+(await page.locator('.hero').getAttribute('data-phase'))>before+.14);report.history.flatPlaybackAfterBack=true;
 await page.getByRole('button',{name:'暂停封面轮播',exact:true}).click();const phase=await page.locator('.hero').getAttribute('data-phase');await page.waitForTimeout(4000);assert.equal(await page.locator('.hero').getAttribute('data-phase'),phase);report.pause={flatFrozenBeyondFullIdleCycle:true};await page.getByRole('button',{name:'播放封面轮播',exact:true}).press('Enter');await page.waitForTimeout(250);assert.notEqual(await page.locator('.hero').getAttribute('data-phase'),phase);report.pause.keyboardResume=true;
 // 720高桌面单独核对暂停入口与平带的净距。
 await page.setViewportSize({width:1280,height:720});await page.evaluate(()=>scrollTo(0,500));await page.waitForTimeout(80);const compact=await page.evaluate(()=>{const button=document.querySelector('.cover-controls').getBoundingClientRect(),cards=[...document.querySelectorAll('[data-cover]')].map(n=>n.getBoundingClientRect());return{buttonTop:button.top,maxCardBottom:Math.max(...cards.map(r=>r.bottom))};});assert(compact.buttonTop>compact.maxCardBottom+1);report.compactDesktopControl=compact;
 await context.close();assert.deepEqual(report.unexpectedWrites,[]);
 const offline=await browser.newPage({viewport:{width:1440,height:900}});await offline.goto('file://'+resolve(batch,'preview/index.html'));await offline.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(n=>n.decode().catch(()=>{})));});await offline.waitForFunction(()=>document.querySelector('.hero').dataset.motionReady==='true');report.offline=await offline.evaluate(()=>({fonts:document.fonts.check('500 15px "MiSans VF"','前端工作台'),covers:[...document.images].every(n=>n.complete&&n.naturalWidth>0),count:document.images.length}));assert(report.offline.fonts&&report.offline.covers&&report.offline.count===9);
 await writeFile(resolve(batch,'audit.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({...report,userImages:report.userImages.length},null,2));
}finally{await browser.close();}
