import {readFile,writeFile,readdir} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const {chromium}=await import(new URL('../../../.tools/tooling/node_modules/playwright/index.mjs',import.meta.url).href);
const source=dirname(fileURLToPath(import.meta.url)),batch=resolve(source,'..'),baseline=resolve(batch,'../2026-10-23_02-49_home-options');
const body=s=>s.match(/<body[\s\S]*<\/body>/)[0].replace(/<script>[\s\S]*?<\/script>/,'').replace(/<div class="cover-controls shell">[\s\S]*?<\/div>/,'');
assert.equal(body(await readFile(resolve(batch,'preview/index.html'),'utf8')),body(await readFile(resolve(baseline,'preview/a.html'),'utf8')));
async function hashes(base,rel=''){const out={};for(const n of await readdir(resolve(base,rel),{withFileTypes:true})){const file=rel?rel+'/'+n.name:n.name;if(n.isDirectory())Object.assign(out,await hashes(base,file));else out[file]=createHash('sha256').update(await readFile(resolve(base,file))).digest('hex');}return out;}
assert.deepEqual(await hashes(resolve(batch,'preview/assets')),await hashes(resolve(baseline,'preview/assets')));
const browser=await chromium.launch({headless:true,ignoreDefaultArgs:['--disable-back-forward-cache']});
const report={sameBusinessContentAndLowerMarkup:true,samePublicAssets:true,history:null,pause:null,offline:null};
try{
 const context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage();
 await page.goto('http://127.0.0.1:4331/preview/index.html');await page.waitForFunction(()=>document.querySelector('.hero').dataset.motionReady==='true');
 await page.evaluate(()=>{window.__restored=false;addEventListener('pageshow',e=>{window.__restored=e.persisted;});});
 await page.goto('about:blank');await page.goBack();await page.waitForFunction(()=>document.querySelector('.hero')?.dataset.motionReady==='true');
 report.history={bfcacheRestored:await page.evaluate(()=>window.__restored===true)};
 await page.waitForFunction(()=>+document.querySelector('.hero').dataset.phase>=1,null,{timeout:8000});
 await page.evaluate(()=>scrollTo(0,360));await page.waitForFunction(()=>document.querySelector('[data-active-stage]').textContent==='发布');report.history.scrollAndPlaybackAfterBack=true;
 await page.evaluate(()=>scrollTo(0,0));await page.getByRole('button',{name:'暂停封面轮播',exact:true}).click();
 const phase=await page.locator('.hero').getAttribute('data-phase');await page.waitForTimeout(4000);assert.equal(await page.locator('.hero').getAttribute('data-phase'),phase);report.pause={frozenBeyondFullCycle:true};
 await page.keyboard.press('Tab');
 await context.close();
 const offline=await browser.newPage({viewport:{width:1440,height:900}});await offline.goto('file://'+resolve(batch,'preview/index.html'));await offline.evaluate(()=>document.fonts.ready);await offline.waitForFunction(()=>document.querySelector('.hero').dataset.motionReady==='true');
 report.offline=await offline.evaluate(()=>({fonts:document.fonts.check('500 15px "MiSans VF"','前端工作台'),covers:[...document.images].every(n=>n.complete&&n.naturalWidth>0)}));assert(report.offline.fonts&&report.offline.covers);
 await writeFile(resolve(batch,'audit.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await browser.close();}
