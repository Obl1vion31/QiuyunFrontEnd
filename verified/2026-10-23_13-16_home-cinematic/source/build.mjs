/** 独立视觉样片：继承已交付 A 的文案、下半页和滚动距离。 */
import {readFile,writeFile,mkdir,cp} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const source=dirname(fileURLToPath(import.meta.url)),batch=resolve(source,'..');
const baseline=resolve(batch,'../2026-10-23_02-49_home-options');
await mkdir(resolve(batch,'preview'),{recursive:true});
await cp(resolve(baseline,'preview/assets'),resolve(batch,'preview/assets'),{recursive:true});
const css=await readFile(resolve(source,'home.css'),'utf8'),js=await readFile(resolve(source,'motion.js'),'utf8');
const original=await readFile(resolve(baseline,'preview/a.html'),'utf8');
const html=original.replace(/<title>.*?<\/title>/,'<title>浅弧电影带 · 首页视觉样片</title>')
 .replace(/<style>[\s\S]*?<\/style>/,()=>`<style>${css}</style>`)
 .replace(/<script>[\s\S]*?<\/script>/,()=>`<script>${js}</script>`)
 .replace('<div class="scroll-hint"','<div class="cover-controls shell"><button type="button" class="cover-toggle" aria-label="暂停封面轮播" aria-pressed="false"><span aria-hidden="true">Ⅱ</span><span data-toggle-label>暂停轮播</span></button></div><div class="scroll-hint"');
await writeFile(resolve(batch,'preview/index.html'),html);
console.log(`已生成独立样片 ${resolve(batch,'preview/index.html')}`);
