/** Shared target reads: delay, replacement, failure and Inspector cancellation. No business database. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const pw = await import(process.env.PLAYWRIGHT_MODULE || new URL('../.tools/tooling/node_modules/playwright/index.mjs', import.meta.url).href);
const browser = await pw.chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.setContent('<main><button id="source">原始入口</button><section id="target">原有摘要</section><aside data-inspector data-selected-id="one"><div id="history"></div></aside></main>');
  await page.addScriptTag({ content: 'window.__name = value => value;' });
  const source = await readFile(new URL('../src/scripts/business-read.ts', import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText.replace(/^export /gm, '');
  await page.addScriptTag({ content: code + '\nwindow.beginBusinessRead=beginBusinessRead;window.readBusiness=readBusiness;' });
  const begin = () => page.evaluate(() => { const scope=window as any; scope.read=scope.beginBusinessRead(document.querySelector('#target')); });
  await begin();
  await page.waitForTimeout(450);
  assert.equal(await page.locator('[data-business-read-loading]').count(), 0, '450ms read never flashes loading');
  await page.evaluate(() => (window as any).read.finish());
  await page.waitForTimeout(100);
  assert.equal(await page.locator('[data-business-read-loading]').count(), 0, 'completed delay never appears later');
  await begin(); await page.waitForTimeout(550);
  assert.equal(await page.locator('[data-business-read-loading]').count(), 1, 'slow read owns exactly one status');
  assert.equal(await page.locator('#target').getAttribute('aria-busy'), 'true');
  assert.equal(await page.locator('#source').innerText(), '原始入口');
  assert.equal(await page.locator('#source').isEnabled(), true, 'read leaves source enabled');
  await page.evaluate(() => {
    const scope=window as any; scope.oldRead=scope.read;
    scope.read=scope.beginBusinessRead(document.querySelector('#target'));
  });
  assert.deepEqual(await page.evaluate(() => [(window as any).oldRead.signal.aborted,(window as any).oldRead.isCurrent()]), [true,false]);
  assert.equal(await page.locator('[data-business-read-loading]').count(), 0, 'replacement clears the old indicator');
  await page.evaluate(() => (window as any).read.cancel());
  assert.equal(await page.locator('#target').getAttribute('aria-busy'), null);
  assert.equal(await page.evaluate(async () => {
    try { await (window as any).readBusiness(document.querySelector('#target'), async () => { throw new Error('expected failure'); }); }
    catch (error) { return (error as Error).message; }
  }), 'expected failure');
  assert.equal(await page.locator('[data-business-read-loading]').count(), 0, 'failure cleans all read feedback');
  await page.evaluate(() => {
    const scope=window as any;
    scope.inspectorRead=scope.beginBusinessRead(document.querySelector('#history'),{isCurrent:()=>document.querySelector('[data-inspector]')?.getAttribute('data-selected-id')==='one'});
    document.querySelector<HTMLElement>('[data-inspector]')!.dataset.selectedId='two';
  });
  await page.waitForTimeout(10);
  assert.equal(await page.evaluate(() => (window as any).inspectorRead.signal.aborted), true, 'switch cancels old Inspector history');
  await page.evaluate(() => {
    const dialog=document.createElement('dialog'),target=document.createElement('section');
    dialog.append(target);document.body.append(dialog);dialog.showModal();
    (window as any).dialogRead=(window as any).beginBusinessRead(target);dialog.close();
  });
  await page.waitForTimeout(10);
  assert.equal(await page.evaluate(() => (window as any).dialogRead.signal.aborted), true, 'closing a task dialog cancels its read');
  await begin(); await page.waitForTimeout(550);
  await page.evaluate(() => document.dispatchEvent(new Event('astro:before-swap')));
  assert.equal(await page.locator('[data-business-read-loading]').count(), 0, 'navigation cleans pending target reads');
  assert.equal(await page.evaluate(() => (window as any).read.signal.aborted), true);
  console.log('Shared reads: 450ms quiet, slow target status, replacement, failure, Inspector switch, dialog close and navigation cancellation passed.');
} finally { await browser.close(); }
