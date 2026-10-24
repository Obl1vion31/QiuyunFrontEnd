/** 用户提供的9张原图，独立预览沿用 A 的文案和后两区。 */
import {readFile,writeFile,mkdir,cp} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const source=dirname(fileURLToPath(import.meta.url)),batch=resolve(source,'..'),baseline=resolve(batch,'../2026-10-23_02-49_home-options');
await mkdir(resolve(batch,'preview/assets'),{recursive:true});
await cp(resolve(baseline,'preview/assets/fonts'),resolve(batch,'preview/assets/fonts'),{recursive:true});
const covers=JSON.parse(await readFile(resolve(source,'covers.json'),'utf8'));
const css=await readFile(resolve(source,'home.css'),'utf8'),js=await readFile(resolve(source,'motion.js'),'utf8'),original=await readFile(resolve(baseline,'preview/a.html'),'utf8');
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cards=covers.map((c,i)=>`<figure class="cover" data-cover="${i}"><img src="assets/covers/${c.file}" alt="${esc(c.label+'：'+c.caption)}" width="1080" height="1443" fetchpriority="${i>=2&&i<=4?'high':'auto'}"><figcaption>${esc(c.label)}</figcaption><div class="cover__fallback" aria-hidden="true">${esc(c.label)}<strong>${esc(c.caption)}</strong></div></figure>`).join('');
const html=original.replace(/<title>.*?<\/title>/,'<title>九张新封面 · 持续流动样片</title>').replace(/<style>[\s\S]*?<\/style>/,()=>`<style>${css}</style>`).replace(/<script>[\s\S]*?<\/script>/,()=>`<script>${js}</script>`)
 .replace(/<div class="cover-scene shell" aria-label="内容封面">[\s\S]*?<\/div><div class="hero__copy/,()=>`<div class="cover-scene shell" aria-label="内容封面">${cards}</div><div class="hero__copy`)
 .replace('<div class="scroll-hint"','<div class="cover-controls shell"><button type="button" class="cover-toggle" aria-label="暂停封面轮播" aria-pressed="false"><span aria-hidden="true">Ⅱ</span><span data-toggle-label>暂停轮播</span></button></div><div class="scroll-hint"');
await writeFile(resolve(batch,'preview/index.html'),html);
const manifest=await Promise.all(covers.map(async c=>{const bytes=await readFile(resolve(batch,'preview/assets/covers',c.file));return{...c,sha256:createHash('sha256').update(bytes).digest('hex'),width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20),bytes:bytes.length};}));
await writeFile(resolve(batch,'assets-manifest.json'),JSON.stringify(manifest,null,2));
console.log(`已生成9张用户原图样片 ${resolve(batch,'preview/index.html')}`);
