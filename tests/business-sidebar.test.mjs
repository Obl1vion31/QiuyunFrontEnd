import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const pages = [
  'annual-plan',
  'operations-schedule',
  'daily-promotion-review',
  'non-promotion-review',
  'meeting-review',
  'settings',
];

test('所有业务页面使用同一个控制台壳层与工具栏', async () => {
  for (const page of pages) {
    const source = await readFile(new URL(`../src/pages/business/${page}.astro`, import.meta.url), 'utf8');
    assert.match(source, /<BusinessConsoleFrame\b/, `${page} 未使用共享控制台壳层`);
    assert.match(source, /<BusinessConsoleToolbar\b/, `${page} 未使用共享工具栏`);
    assert.doesNotMatch(source, /<BusinessConsoleSidebar\b/, `${page} 不应绕过共享壳层直接装配侧栏`);
    assert.doesNotMatch(source, /<aside\s+class=["']sidebar["']/, `${page} 仍包含独立侧栏结构`);
    assert.doesNotMatch(source, /business-sidebar__|\.business-sidebar\b/, `${page} 不得声明共享侧栏样式`);
  }
});

test('控制台壳层集中装配侧栏并提供统一视觉变量', async () => {
  const source = await readFile(new URL('../src/components/BusinessConsoleFrame.astro', import.meta.url), 'utf8');
  assert.match(source, /<BusinessConsoleSidebar active=/);
  assert.match(source, /class="app-shell business-console-frame"/);
  assert.match(source, /--console-canvas:/);
  assert.match(source, /--console-blue:/);
  assert.match(source, /\.business-console-frame\{width:100%;font-family:system-ui/);
  assert.match(source, /\.business-console-workspace\{width:100%;min-width:0/);
});

test('控制台壳层为所有异步业务交互提供统一加载反馈', async () => {
  const frame = await readFile(new URL('../src/components/BusinessConsoleFrame.astro', import.meta.url), 'utf8');
  assert.match(frame, /data-operation-feedback/);
  assert.match(frame, /role="status" aria-live="polite"/);
  assert.match(frame, /正在加载…/);
  assert.match(frame, /正在保存…/);
  assert.match(frame, /正在删除…/);
  assert.match(frame, /window\.fetch = async/);
  assert.match(frame, /setAttribute\('aria-busy', 'true'\)/);
  assert.match(frame, /trigger\.disabled = true/);
  assert.match(frame, /prefers-reduced-motion:reduce/);

  for (const page of pages) {
    const source = await readFile(new URL(`../src/pages/business/${page}.astro`, import.meta.url), 'utf8');
    if (source.includes('fetch(')) {
      assert.match(source, /<BusinessConsoleFrame\b/, `${page} 发起请求但没有使用全局加载反馈壳层`);
    }
  }
});

test('共享工具栏锁定跨页几何、字体与颜色', async () => {
  const source = await readFile(new URL('../src/components/BusinessConsoleToolbar.astro', import.meta.url), 'utf8');
  for (const declaration of [
    'width:100%;height:72px;min-height:72px;max-height:72px',
    'height:62px;min-height:62px;max-height:62px',
    'font-family:system-ui,"PingFang SC","Microsoft YaHei",sans-serif',
    'color:#17211c',
    'background:color-mix(in srgb,#f7f8f5 92%,transparent)',
    'font-size:15px;line-height:18px;font-weight:800',
    'font-size:11px;line-height:14px;font-weight:500',
  ]) assert.ok(source.includes(declaration), `缺少工具栏基准：${declaration}`);
});

test('六个页面只通过共享组件表达工具栏控件', async () => {
  const expected = new Map([
    ['annual-plan', ['BusinessToolbarPeriodNav', 'BusinessToolbarActions']],
    ['operations-schedule', ['BusinessToolbarPeriodNav', 'BusinessToolbarSegmented', 'BusinessToolbarActions']],
    ['daily-promotion-review', ['BusinessToolbarSegmented', 'BusinessToolbarSummary']],
    ['non-promotion-review', ['BusinessToolbarSegmented', 'BusinessToolbarSummary']],
    ['meeting-review', ['BusinessToolbarContext', 'BusinessToolbarActions']],
    ['settings', []],
  ]);
  for (const [page, components] of expected) {
    const source = await readFile(new URL(`../src/pages/business/${page}.astro`, import.meta.url), 'utf8');
    for (const component of components) assert.match(source, new RegExp(`<${component}\\b`), `${page} 未使用 ${component}`);
    const withoutSegmentedPlacement = source.replaceAll(':global(.business-toolbar-segmented)', '');
    assert.doesNotMatch(withoutSegmentedPlacement, /\.business-toolbar(?:__|\{|\b)/, `${page} 不得覆盖共享工具栏样式`);
  }
});

test('日度复盘将数据截止时间并入统一副标题', async () => {
  const source = await readFile(new URL('../src/pages/business/daily-promotion-review.astro', import.meta.url), 'utf8');
  assert.match(source, /只处理尚未完成项 · 数据截至/);
  assert.match(source, /mobilePriority="center"/);
  assert.doesNotMatch(source, /class="latest-cutoff"/);
});

test('生命周期图例与共享标题说明使用同一字体基线', async () => {
  const header = await readFile(new URL('../src/components/BusinessPageHeader.astro', import.meta.url), 'utf8');
  const daily = await readFile(new URL('../src/pages/business/daily-promotion-review.astro', import.meta.url), 'utf8');
  assert.match(header, /business-page-header__meta :global\(p\).*font:500 \.68rem\/1\.55 system-ui/);
  assert.match(daily, /class="lifecycle-meta"/);
  assert.match(daily, /class="lifecycle-cutoff"/);
  assert.match(daily, /\.lifecycle-meta\{display:flex;align-items:center/);
});

test('非推广复盘使用项目文档链接与精细的三列录入行', async () => {
  const page = await readFile(new URL('../src/pages/business/non-promotion-review.astro', import.meta.url), 'utf8');
  const card = await readFile(new URL('../src/components/NonPromotionReviewCard.astro', import.meta.url), 'utf8');
  assert.match(page, /projectDocUrl:\s*operationsContentVersion\.projectDocUrl/);
  assert.match(card, /href=\{row\.projectDocUrl\}/);
  assert.match(card, /target="_blank"/);
  assert.match(card, /grid-template-columns:minmax\(150px,\.8fr\) repeat\(2,minmax\(150px,1fr\)\)/);
  assert.match(card, /class="review-field review-field--date"/);
  assert.match(card, /<span>数据截至<\/span>/);
  assert.match(card, /<span>3 秒阅读率<\/span>/);
  assert.match(card, /grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.doesNotMatch(card, /day_30|30 天/);
});

test('非推广复盘仅接受 7 天和 15 天节点', async () => {
  const rules = await readFile(new URL('../src/db/stage-review-rules.mjs', import.meta.url), 'utf8');
  const validation = await readFile(new URL('../src/db/stage-review-validation.ts', import.meta.url), 'utf8');
  const migration = await readFile(new URL('../drizzle/0020_remove_day_30_reviews.sql', import.meta.url), 'utf8');
  assert.doesNotMatch(rules, /day_30/);
  assert.match(validation, /z\.enum\(\['day_7', 'day_15'\]\)/);
  assert.doesNotMatch(validation, /day_30/);
  assert.match(migration, /DELETE FROM "operations_non_promotion_review"[\s\S]*'day_30'/);
  assert.match(migration, /DELETE FROM "operations_content_performance_metric"[\s\S]*'day_30'/);
  assert.match(migration, /CHECK \("checkpoint_type" IN \('day_7', 'day_15'\)\)/);
});

test('共享侧栏提供稳定的 Quiet Operations 几何与视觉基准', async () => {
  const source = await readFile(new URL('../src/components/BusinessConsoleSidebar.astro', import.meta.url), 'utf8');
  for (const declaration of [
    'grid-template-columns:232px minmax(0,1fr)!important',
    '.business-sidebar,.business-sidebar *{box-sizing:border-box}',
    'font-family:system-ui,"PingFang SC","Microsoft YaHei",sans-serif',
    'font-size:16px;line-height:1.2',
    'width:232px',
    'height:100vh',
    'background:#e7ece8',
    'min-height:42px',
    'border-radius:10px',
    'height:66px',
    'padding:6px 8px',
  ]) assert.ok(source.includes(declaration), `缺少侧栏基准：${declaration}`);
});

test('共享侧栏使用持久化路由、受控预取和语义图标', async () => {
  const source = await readFile(new URL('../src/components/BusinessConsoleSidebar.astro', import.meta.url), 'utf8');
  assert.match(source, /transition:persist="business-console-sidebar"/);
  assert.match(source, /<ViewTransitions fallback="swap"/);
  assert.match(source, /data-astro-prefetch="hover"/);
  assert.match(source, /prefetch\(link\.href/);
  assert.match(source, /计划与执行/);
  assert.match(source, /复盘与沉淀/);
  assert.match(source, /<svg\b/);
  assert.doesNotMatch(source, /icon:\s*['"](?:总|排|日|非|会|设)['"]/);
  assert.doesNotMatch(source, /INTERNAL ACCESS/);
});

test('Astro 禁止控制台首屏全量预取', async () => {
  const source = await readFile(new URL('../astro.config.mjs', import.meta.url), 'utf8');
  assert.match(source, /prefetchAll:\s*false/);
  assert.match(source, /defaultStrategy:\s*'hover'/);
});

test('带 Inspector 的业务页在客户端切换后重新初始化交互', async () => {
  for (const page of ['annual-plan', 'operations-schedule']) {
    const source = await readFile(new URL(`../src/pages/business/${page}.astro`, import.meta.url), 'utf8');
    assert.match(source, /<script is:inline data-astro-rerun define:vars=/, `${page} 的交互脚本不会在 View Transition 后重跑`);
  }
  const schedule = await readFile(new URL('../src/pages/business/operations-schedule.astro', import.meta.url), 'utf8');
  assert.match(schedule, /window\.__operationsScheduleKeydown/);
  assert.match(schedule, /document\.querySelectorAll\('\[data-inspect-id\]'\)/);
  assert.match(schedule, /node\.addEventListener\('click', inspect\)/);
});
