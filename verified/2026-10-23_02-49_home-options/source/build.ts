/** 三套独立首页方案。只读取正式 homeContent，不创建业务路由或连接数据库。 */
import {readFile, writeFile, mkdir, cp} from 'node:fs/promises';
import {resolve, dirname, extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {homeContent} from '../../../src/data/home';

const source = dirname(fileURLToPath(import.meta.url));
const root = resolve(source, '../../..');
const batch = resolve(root, process.env.HOME_OPTIONS_BATCH || 'verified/2026-10-23_02-49_home-options');
const output = resolve(batch, 'preview');
await mkdir(resolve(output, 'assets/covers'), {recursive:true});
await cp(resolve(root, 'public/fonts/misans-5.0.0'), resolve(output, 'assets/fonts'), {recursive:true});
const content = structuredClone(homeContent);
for (const [i, cover] of content.covers.entries()) {
  const relative = `assets/covers/cover-${i+1}${extname(cover.image!)}`;
  await cp(resolve(root, 'public'+cover.image), resolve(output, relative));
  cover.image = relative;
}
const esc = (s:unknown) => String(s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const css = await readFile(resolve(source,'home.css'),'utf8');
const js = await readFile(resolve(source,'motion.js'),'utf8');
const names = {a:'封面归位',b:'流程主导',c:'清爽直达'};
const stages = content.workflow.stages;
const header = `<header class="masthead shell"><a class="wordmark" href="index.html">QIUYUN <span>/</span> FRONTEND</a><span class="masthead__context">CONTENT WORKSPACE</span><a class="login" href="https://qiuyun-frontend.vercel.app/login" target="_blank" rel="noopener">登录工作台 <span aria-hidden="true">↗</span></a></header>`;
const goals = `<div class="goals" aria-label="内容触达目标">${content.hero.statement.map((s,i)=>`<strong>${i?'<span class="goals__arrow" aria-hidden="true">→</span>':''}${esc(s)}</strong>`).join('')}</div>`;
const intro = `<div class="intro"><p class="eyebrow">${esc(content.hero.eyebrow)}</p><h1 id="page-title">${content.hero.title.map(s=>`<span>${esc(s)}</span>`).join('')}</h1><p class="intro__note">${esc(content.hero.note)}</p></div>`;
const purpose = `<div class="purpose" role="region" aria-labelledby="purpose-title"><p class="eyebrow">${esc(content.mission.eyebrow)}</p><h2 id="purpose-title">${esc(content.mission.body)}</h2><p class="purpose__boundary">${esc(content.mission.boundary)}</p></div>`;
const rail = `<div class="rail shell" aria-label="当前工作流环节"><div class="rail__meta"><span>当前流程环节</span><strong data-active-stage>${esc(stages[0].label)}</strong></div><ol><span class="rail__line" aria-hidden="true"><i></i></span>${stages.map((s,i)=>`<li data-stage="${i}"${i===0?' aria-current="step"':''}><i aria-hidden="true"></i><span>${String(i+1).padStart(2,'0')}</span><strong>${esc(s.label)}</strong></li>`).join('')}</ol></div>`;
const cards = content.covers.map((c,i)=>`<figure class="cover" data-cover="${i}"><img src="${esc(c.image)}" alt="${esc(c.label+'：'+c.caption)}" width="300" height="400" fetchpriority="${i<4?'high':'auto'}"/><figcaption>${esc(c.label)}</figcaption><div class="cover__fallback" aria-hidden="true">${esc(c.label)}<strong>${esc(c.caption)}</strong></div></figure>`).join('');
const heading = (data:typeof content.workflow|typeof content.systems,id:string)=>{const title=id==='workflow-title'?esc(data.title).replace('，','，</span><span>').replace('持续','</span><span>持续'):esc(data.title);return `<header class="section-heading"><p class="eyebrow">${esc(data.eyebrow)}</p><h2 id="${id}">${id==='workflow-title'?'<span>'+title+'</span>':title}</h2><p class="section-intro">${esc(data.intro)}</p></header>`;};
const workflow = `<section class="workflow" aria-labelledby="workflow-title"><div class="shell workflow__inner">${heading(content.workflow,'workflow-title')}<div class="workflow__body"><ol class="workflow__track">${stages.map((s,i)=>`<li><div class="workflow__marker"><span>${String(i+1).padStart(2,'0')}</span><i aria-hidden="true"></i><b>${esc(s.label)}</b></div><h3>${esc(s.verb)}</h3><p>${esc(s.description)}</p></li>`).join('')}</ol><p class="workflow__return"><span aria-hidden="true">↩</span> 结果不是终点，它会沿着轨道回到下一次策划。</p></div></div></section>`;
const systems = `<section class="systems" aria-labelledby="systems-title"><div class="shell systems__inner">${heading(content.systems,'systems-title')}<div class="systems__list">${content.systems.entries.map(e=>`<article><span class="entry-tag">${esc(e.eyebrow)}</span><div><h3>${esc(e.title)}</h3><p>${esc(e.summary)}</p></div>${e.href?`<a class="entry-action" href="https://qiuyun-frontend.vercel.app${esc(e.href)}" data-original-href="${esc(e.href)}" target="_blank" rel="noopener">${esc(e.cta)} <span aria-hidden="true">↗</span></a>`:`<span class="entry-status">${esc(e.cta)}</span>`}</article>`).join('')}</div></div></section>`;

for (const variant of ['a','b','c'] as const) {
 const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${variant.toUpperCase()} · ${names[variant]} — 首页方案</title><link rel="stylesheet" href="assets/fonts/MiSansVF.css"><style>${css}</style></head><body class="variant-${variant}" data-variant="${variant}"><a class="skip-link" href="#workflow-title">跳到工作流</a><main><section class="hero" aria-labelledby="page-title"><div class="hero__frame">${header}<div class="hero__ambient" aria-hidden="true"></div><div class="cover-scene shell" aria-label="内容封面">${cards}</div><div class="hero__copy shell">${intro}${purpose}${goals}</div>${rail}<div class="scroll-hint" aria-hidden="true"><i></i>${esc(content.hero.scrollHint)}</div></div></section><div class="lower-content">${workflow}${systems}</div><footer><div class="shell"><span>QIUYUN FRONTEND</span><span>最后更新 ${esc(content.meta.updatedAt)}</span></div></footer></main><script>${js}</script></body></html>`;
 await writeFile(resolve(output,`${variant}.html`),html);
}
await writeFile(resolve(batch,'content-snapshot.json'),JSON.stringify(homeContent,null,2)+'\n');
const galleryCss=await readFile(resolve(source,'gallery.css'),'utf8');
const descriptors = {
 a:{tag:'推荐 · 表达与秩序的平衡',title:'封面归位',note:'从内容的丰富，走向工作的秩序。',motion:'错位封面 → 单向归位 → 平稳交接',layout:'两段分栏 · 六阶段 3×2 · 三条入口',why:'保留真实封面的个性，首屏有记忆点，后文顺着同一条阅读轴展开。'},
 b:{tag:'工作流最清楚',title:'流程主导',note:'让一条线，串起内容的完整过程。',motion:'静态封面背景 · 单一流程线推进',layout:'横向六阶段 · 紧凑纵向入口',why:'继承现有结构最多，动静主次最明确，适合偏理性的工作台气质。'},
 c:{tag:'滑动最少',title:'清爽直达',note:'看清内容，更快进入工作。',motion:'一次轻入场 · 自然文档流',layout:'工作流与入口并列 · 共用浅色底',why:'以排版和真实内容形成视觉，页面最短，也最接近成熟工具产品。'}
};
let metrics:any={};
try{metrics=JSON.parse(await readFile(resolve(batch,'metrics.json'),'utf8'));}catch{}
const data=metrics.viewports?.find((v:any)=>v.width===1440);
const metricRow=(key:string)=>{const m=data?.variants?.[key];return m?`<div class="metric"><span>页面高度</span><strong>${Math.round(m.totalHeight)}<small> px</small></strong></div><div class="metric"><span>后两区缩短</span><strong>${Math.round((1-m.lowerHeight/data.baseline.lowerHeight)*100)}<small>%</small></strong></div>`:'<p class="metric-pending">完整页面与滚动动效</p>';};
const gallery=`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>首页 · 三个方向</title><link rel="stylesheet" href="assets/fonts/MiSansVF.css"><style>${galleryCss}</style></head><body><header class="gallery-mast"><span>QIUYUN / FRONTEND</span><span>DESIGN STUDY · 2026.10.23</span></header><main><section class="gallery-intro"><p class="kicker">首页视觉与动效提案</p><h1>内容保持丰富。<br><em>让画面更有秩序。</em></h1><div><p>三个完整方向，同一份真实内容。<br>比较首屏的新鲜感、跨屏连续性，以及抵达工作台的距离。</p><span class="review-status">桌面方案 · 已完成视觉自检 · 待选择</span></div></section><section class="options" aria-label="三套首页方案">${(['a','b','c'] as const).map(v=>{const d=descriptors[v];return`<article class="option"><div class="option-top"><span class="option-id">${v.toUpperCase()}</span><span class="option-tag">${d.tag}</span></div><a class="option-poster" href="${v}.html"><img src="../screenshots/${v}/hero-1440.png" width="1440" height="900" alt="${d.title}桌面首页实拍"><span>打开完整动效 <b>↗</b></span></a><h2>${d.title}</h2><p class="option-note">${d.note}</p><dl><div><dt>动效</dt><dd>${d.motion}</dd></div><div><dt>布局</dt><dd>${d.layout}</dd></div></dl><p class="option-why">${d.why}</p><div class="metrics">${metricRow(v)}</div><div class="option-actions"><a class="primary" href="${v}.html">体验 ${v.toUpperCase()} <span>↗</span></a><a href="../motion/${v}-scroll.mp4">滚动录像 <span>▷</span></a><a href="../screenshots/${v}/full-1440.png">整页图 <span>↗</span></a></div></article>`;}).join('')}</section><section class="decision"><div><p class="kicker">我的建议</p><h2>先看 A，再用 C 校准取舍。</h2></div><div><p>A 把现有首页的真实内容特色保留下来，再用一次有终点的归位建立秩序，是最平衡的方向。C 让你判断：首屏的展示感，是否值得多一些滚动距离。</p><p>B 则适合希望保持原有流程结构，并让整个首页更安静、更偏工具属性的选择。</p></div></section><section class="evidence"><h2>比较基准</h2><div><p><a href="https://scroll-driven-animations.style/demos/cover-to-fixed-header/css/" target="_blank" rel="noopener">形态连续的滚动交接 ↗</a><span>参考同一对象收拢后接入正文的关系。</span></p><p><a href="https://linear.app/" target="_blank" rel="noopener">明确主角与稳定网格 ↗</a><span>参考画面秩序，沿用本项目的颜色与真实素材。</span></p><p><a href="../README.md">查看验收索引 ↗</a><span>1440 / 1280 / 1024px、往返滚动、减少动态效果与异常素材。</span></p></div></section></main><footer>方案预览 · 内容来源 src/data/home.ts · 正式首页保留 · 八张封面均为已有公开素材</footer></body></html>`;
await writeFile(resolve(output,'index.html'),gallery.replaceAll('full-1440.png','reading-1440.png').replaceAll('整页图','阅读图').replace('方案预览 · 内容来源','阅读图由真实首屏与后两区截图拼接，实际滚动距离见录像与实测。方案预览 · 内容来源'));
console.log(`已生成三套完整预览：${output}`);
