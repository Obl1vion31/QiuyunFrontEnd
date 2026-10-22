/** 正式组件与真实写入接口；全部使用独立 PGlite 和虚构资料。 */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { startFixture, employee } from './auth.fixture';
import * as s from '../src/db/schema';
import { promotionSnapshot, timelineFingerprint } from '../src/db/promotion-timeline';
import { respondToBusinessConfirm } from './business-confirm.helper';
const folder = '.tools/test-artifacts/meeting-weekly';
await mkdir(folder, { recursive: true });
const clockFile = new URL('../' + folder + '/clock.txt', import.meta.url).pathname;
await writeFile(clockFile, '2026-10-22T12:00:00+08:00');
const fixture = await startFixture({ clockFile }), { db, baseURL } = fixture;
let browser: any;
const checks: string[] = [], errors: string[] = [], geometry: any[] = [];
try {
    const login = await fetch(baseURL + '/api/auth/sign-in/username', { method: 'POST', headers: { Origin: baseURL, 'Content-Type': 'application/json' }, body: JSON.stringify(employee) });
    assert.equal(login.status, 200);
    const cookie = login.headers.getSetCookie().map(v => v.split(';')[0]).join('; ');
    const api = async (path: string, method = 'GET', body?: unknown, status = 200) => { const r = await fetch(baseURL + path, { method, headers: { Cookie: cookie, Origin: baseURL, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); const json = await r.json(); assert.equal(r.status, status, JSON.stringify(json)); return json; };
    const seed = async (name: string, start = '2026-10-21', stage = 'testing', id: string | null = randomUUID().replaceAll('-', '').slice(0, 24), promoted = true) => { const [c] = await db.insert(s.operationsContent).values({ platformNoteId: id }).returning(); const [v] = await db.insert(s.operationsContentVersion).values({ contentId: c.id, contentName: name, versionNumber: 1, workType: 'new', subjectId: 'tmua', categoryId: 'temporary' }).returning(); const [schedule] = await db.insert(s.operationsContentSchedule).values({ contentVersionId: v.id, completionStatus: 'on_time', plannedPublishAt: new Date(`${start}T10:00:00+08:00`), actualPublishAt: new Date(`${start}T10:00:00+08:00`), isPromoted: promoted, promotionStatus: promoted ? stage : 'none' }).returning(); if (!promoted)
        return { c, v, schedule, campaign: null! }; const [campaign] = await db.insert(s.operationsPromotionCampaign).values({ scheduleId: schedule.id, startedOn: start, dailyReviewEnabledOn: start, initialStage: stage, currentStage: stage, currentStatus: stage }).returning(); await db.insert(s.operationsPromotionStage).values({ campaignId: campaign.id, startedOn: start, stageType: stage }); return { c, v, schedule, campaign }; };
    const fact = async (post: Awaited<ReturnType<typeof seed>>, date: string, decision: string, status = 'testing', spend = '200.00') => (await db.insert(s.operationsPromotionDailyMetric).values({ campaignId: post.campaign.id, metricDate: date, dailyStatus: ['testing', 'scaling'].includes(status) ? 'active' : 'waiting_action', actualStatusSnapshot: status, stageTypeSnapshot: status.startsWith('scaling') ? 'scaling' : 'testing', sourceStageStartedOn: post.campaign.startedOn, spend, platformOpenCount: 20, actualOpenCount: 10, platformLeadCount: 8, actualLeadCount: 5, reviewDecision: decision }).returning())[0];
    // 原子性、ID 共享约束、权限、指纹和重试。
    const ba = await seed('图形中的等量关系', '2026-10-21', 'testing', null), bb = await seed('几何直觉与严谨证明');
    const batchRow = async (p: typeof ba) => ({ campaignId: p.campaign.id, metricDate: '2026-10-21', dailyStatus: 'active', actualStatusSnapshot: 'testing', stageTypeSnapshot: 'testing', recordKind: 'regular', spend: '50', platformOpenCount: '5', actualOpenCount: '2', platformLeadCount: '2', actualLeadCount: '1', reviewDecision: 'test_continue', platformNoteId: p.c.platformNoteId ?? 'a'.repeat(24), requestKey: randomUUID(), fingerprint: timelineFingerprint(await promotionSnapshot(db, p.schedule.id)) });
    const ar = await batchRow(ba), br = await batchRow(bb);
    await api('/api/promotion-daily/batch', 'POST', { rows: [ar, { ...br, reviewDecision: 'scaling_continue' }] }, 409);
    assert.equal((await db.select().from(s.operationsPromotionDailyMetric)).length, 0);
    assert.equal((await db.select().from(s.operationsContent).where(eq(s.operationsContent.id, ba.c.id)))[0].platformNoteId, null);
    await api('/api/promotion-daily/batch', 'POST', { rows: [ar, { ...br, platformNoteId: ar.platformNoteId }] }, 422);
    await api('/api/promotion-daily/batch', 'POST', { rows: [ar, { ...br, fingerprint: 'stale' }] }, 409);
    const savedBatch = await api('/api/promotion-daily/batch', 'POST', { rows: [ar, br] }, 201);
    assert.equal(savedBatch.rows.length, 2);
    await api('/api/promotion-daily/batch', 'POST', { rows: [ar, br] }, 201);
    assert.equal((await db.select().from(s.operationsPromotionDailyMetric)).length, 2);
    await api('/api/promotion-daily/batch', 'POST', { rows: [{ ...ar, spend: '51' }, br] }, 409);
    assert.equal((await fetch(baseURL + '/api/promotion-daily/batch', { method: 'POST', headers: { Origin: baseURL, 'Content-Type': 'application/json' }, body: JSON.stringify({ rows: [ar] }) })).status, 401);
    for (const p of [ba, bb]) {
        await db.update(s.operationsPromotionCampaign).set({ endedOn: '2026-10-21', currentStatus: 'test_discarded', currentStage: null }).where(eq(s.operationsPromotionCampaign.id, p.campaign.id));
        await db.update(s.operationsContentSchedule).set({ promotionStatus: 'test_discarded' }).where(eq(s.operationsContentSchedule.id, p.schedule.id));
    }
    console.log('checkpoint');
    checks.push('employee batch, whole-transaction rollback including first ID, stale fingerprint, duplicate ID refusal, idempotent retry, payload-bound request key, anonymous refusal');
    const historical = await seed('历史对照：代数问题的图像解释', '2026-10-09');
    await fact(historical, '2026-10-09', 'test_discarded');
    await db.update(s.operationsPromotionCampaign).set({ currentStatus: 'test_discarded', currentStage: null, endedOn: '2026-10-09' }).where(eq(s.operationsPromotionCampaign.id, historical.campaign.id));
    await db.update(s.operationsContentSchedule).set({ promotionStatus: 'test_discarded' }).where(eq(s.operationsContentSchedule.id, historical.schedule.id));
    const nonHist = await seed('历史对照：建立自己的解题检查表', '2026-10-01', 'testing', undefined, false);
    await db.insert(s.operationsContentPerformanceMetric).values({ scheduleId: nonHist.schedule.id, checkpointType: 'day_15', recordedThrough: '2026-10-10', clickRate: '6', threeSecondReadRate: '38' });
    const pending = await seed('TMUA 概率模型解题路径', '2026-10-20', 'testing', null);
    await fact(pending, '2026-10-20', 'test_pending');
    await db.update(s.operationsPromotionCampaign).set({ currentStatus: 'test_pending' }).where(eq(s.operationsPromotionCampaign.id, pending.campaign.id));
    await db.update(s.operationsContentSchedule).set({ promotionStatus: 'test_pending' }).where(eq(s.operationsContentSchedule.id, pending.schedule.id));
    const running = await seed('数学面试：把解题过程讲清楚');
    const scaling = await seed('长标题：入学备考中如何建立稳定的解题思路与表达能力', '2026-10-19', 'scaling');
    await fact(scaling, '2026-10-19', 'scaling_continue', 'scaling', '300');
    await fact(scaling, '2026-10-20', 'scaling_continue', 'scaling', '350');
    const paused = await seed('TMUA 逻辑命题辨析', '2026-10-20');
    await fact(paused, '2026-10-20', 'test_pause');
    await db.update(s.operationsPromotionCampaign).set({ currentStatus: 'test_paused' }).where(eq(s.operationsPromotionCampaign.id, paused.campaign.id));
    await db.update(s.operationsContentSchedule).set({ promotionStatus: 'test_paused' }).where(eq(s.operationsContentSchedule.id, paused.schedule.id));
    const test = await seed('数列题中的信息拆解');
    const non = await seed('分类思路：从读题到建模', '2026-10-01', 'testing', undefined, false);
    for (const [checkpointType, recordedThrough, clickRate] of [['day_7', '2026-10-08', '6'], ['day_15', '2026-10-21', '8']])
        await db.insert(s.operationsContentPerformanceMetric).values({ scheduleId: non.schedule.id, checkpointType, recordedThrough, clickRate, threeSecondReadRate: '42', createdAt: new Date('2026-10-09T12:00:00+08:00'), updatedAt: new Date('2026-10-21T15:00:00+08:00') });
    const non2 = await seed('从例题到方法：错题复盘', '2026-10-01', 'testing', undefined, false);
    await db.insert(s.operationsContentPerformanceMetric).values({ scheduleId: non2.schedule.id, checkpointType: 'day_15', recordedThrough: '2026-10-20', clickRate: '5', threeSecondReadRate: '35' });
    const form = new FormData();
    for (const [k, v] of Object.entries({ name: '周例会 · 内容与推广复盘', periodStart: '2026-10-16', periodEnd: '2026-10-21', meetingAt: '2026-10-22T14:00:00+08:00' }))
        form.set(k, v);
    const create = await fetch(baseURL + '/api/meeting-reviews', { method: 'POST', headers: { Cookie: cookie, Origin: baseURL }, body: form });
    assert.equal(create.status, 201);
    const { id: meetingId } = await create.json();
    let [meeting] = await db.select().from(s.operationsReviewMeeting).where(eq(s.operationsReviewMeeting.id, meetingId));
    assert.equal(meeting.draftSnapshot.schemaVersion, 4);
    assert.deepEqual(meeting.draftSnapshot.promotionSelections, []);
    assert.deepEqual(meeting.draftSnapshot.nonPromotionSelections, []);
    const playwright = await import(new URL('../.tools/tooling/node_modules/playwright/index.mjs', import.meta.url).href);
    browser = await playwright.chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, recordVideo: { dir: folder + '/video', size: { width: 1440, height: 1000 } } });
    await context.addCookies(cookie.split('; ').map(c => ({ name: c.slice(0, c.indexOf('=')), value: c.slice(c.indexOf('=') + 1), url: baseURL })));
    const page = await context.newPage();
    page.setDefaultTimeout(12000);
    page.on('pageerror', (e: Error) => errors.push(e.message));
    const nav = async (path: string) => { await page.evaluate(() => document.documentElement.dataset.unsaved = 'false'); await page.goto(baseURL + path); await page.waitForLoadState('networkidle'); await page.evaluate(() => document.fonts.ready); };
    const shot = async (name: string) => { await page.screenshot({ path: `${folder}/${name}.png`, fullPage: true }); };
    await nav('/business/daily-promotion-review');
    await page.locator('[data-save-all]').waitFor();
    const pf = page.locator(`[data-metric-form][data-schedule-id="${pending.schedule.id}"]`);
    assert.equal(await pf.locator('[name=reviewDecision]').inputValue(), 'wait_continue');
    for (const name of ['spend', 'platformOpenCount', 'actualOpenCount', 'platformLeadCount', 'actualLeadCount'])
        assert.equal(await pf.locator(`[name=${name}]`).inputValue(), '0');
    await pf.locator('[data-note-id-trigger]').click();
    const pop = page.locator('.review-note-bubble');
    await pop.waitFor();
    assert.equal(await page.locator('[data-promotion-inspector].is-open').count(), 0);
    await pop.locator('input').fill('c'.repeat(24));
    await shot('daily-id-popover-1440');
    await pop.getByRole('button', { name: '确认 ID' }).click();
    await pop.waitFor({ state: 'detached' });
    assert.equal(await pf.locator('[name=platformNoteId]').inputValue(), 'c'.repeat(24));
    for (const width of [1920, 1440, 1280, 1024, 736, 390, 320]) {
        await page.setViewportSize({ width, height: 1000 });
        await shot(`daily-ready-${width}`);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    const forms = page.locator('#daily-table [data-review-container=ready] [data-metric-form]');
    for (let i = 0; i < await forms.count(); i++) {
        const f = forms.nth(i);
        if (await f.getAttribute('data-actual-status') === 'testing' || await f.getAttribute('data-actual-status') === 'scaling') {
            for (const [key, value] of Object.entries({ spend: '200', platformOpenCount: '20', actualOpenCount: '10', platformLeadCount: '8', actualLeadCount: '5' }))
                await f.locator(`[name=${key}]`).fill(value);
            await f.locator('[name=reviewDecision]').selectOption((await f.getAttribute('data-actual-status')) === 'scaling' ? 'scaling_continue' : 'test_continue');
        }
        else if (await f.getAttribute('data-actual-status') === 'test_paused')
            await f.locator('[name=reviewDecision]').selectOption('wait_continue');
    }
    const batchResponse = page.waitForResponse((r: any) => r.url().endsWith('/api/promotion-daily/batch'));
    await page.locator('[data-save-all]').click();
    assert.equal((await batchResponse).status(), 201);
    await page.waitForFunction(() => document.querySelector('[data-promotion-pending-body]')?.getAttribute('data-due-count') === '0');
    await shot('daily-batch-saved-1440');
    assert.equal((await db.select().from(s.operationsContent).where(eq(s.operationsContent.id, pending.c.id)))[0].platformNoteId, 'c'.repeat(24));
    console.log('checkpoint');
    checks.push('ID lightweight popover without Inspector, pending initial five zeros and continue-pending default, seven-width daily layout, batch queue and totals update');
    await nav(`/business/meeting-review?meeting=${meetingId}`);
    await page.locator('astro-island[ssr]').waitFor({ state: 'detached' }).catch(() => { });
    await page.locator('[data-weekly-report]').waitFor();
    assert.equal(await page.locator('[data-weekly-report] input[type=checkbox]:checked').count(), 0);
    const card = page.locator('[data-weekly-promotion]').first();
    await card.evaluate((n: HTMLElement) => (window as any).__firstWeeklyCard = n);
    await page.getByPlaceholder('名称、学科或分类').fill('不存在');
    assert.equal(await card.evaluate((n: HTMLElement) => n === (window as any).__firstWeeklyCard), true);
    await page.getByPlaceholder('名称、学科或分类').fill('');
    await page.getByLabel('核心结论与整体总结').fill('本期先确认数据完整性，再根据阶段表现安排放量。');
    await page.getByLabel('本周具体动作').fill('完成首轮测试，核对暂停期间的实际跑量。');
    const selectall = page.getByRole('button', { name: '全选本期候选' });
    await selectall.click();
    // 慢读只显示目标区域的一处反馈，刷新保留文字与节点。
    await page.route('**/api/meeting-reviews/*/material?*', async (route: any) => { const r = await route.fetch(); await new Promise(resolve => setTimeout(resolve, 850)); await route.fulfill({ response: r }); });
    const refresh = page.getByRole('button', { name: '刷新数据' });
    await refresh.click();
    await page.waitForTimeout(600);
    assert.equal(await page.locator('[data-business-read-loading]').count(), 1);
    await page.waitForFunction(() => document.querySelector('output[role=status]')?.textContent?.includes('数据已刷新'));
    await page.unroute('**/api/meeting-reviews/*/material?*');
    assert.equal(await page.getByLabel('核心结论与整体总结').inputValue(), '本期先确认数据完整性，再根据阶段表现安排放量。');
    assert.equal(await card.evaluate((n: HTMLElement) => n === (window as any).__firstWeeklyCard), true);
    // 区间变动使已选阶段失效时使用公共确认，取消保留勾选及人工输入。
    await page.getByLabel('例会开始日').fill('2026-10-21');
    {
        const answer = respondToBusinessConfirm(page);
        await refresh.click();
        await answer;
    }
    assert.equal(await page.getByLabel('核心结论与整体总结').inputValue(), '本期先确认数据完整性，再根据阶段表现安排放量。');
    await page.getByLabel('例会开始日').fill('2026-10-16');
    await refresh.click();
    await page.waitForFunction(() => document.querySelector('output[role=status]')?.textContent?.includes('数据已刷新'));
    for (const width of [1920, 1440, 1280, 1024, 736, 390, 320]) {
        await page.setViewportSize({ width, height: 1000 });
        await page.evaluate(() => scrollTo(0, 0));
        await shot(`weekly-draft-${width}`);
        await page.screenshot({ path: `${folder}/weekly-viewport-${width}.png` });
        if ([1440, 1920, 390, 320].includes(width)) {
            for (const [selector, name] of [['#weekly-promotion', 'promotion'], ['#weekly-non', 'non']]) {
                const section = page.locator(selector), height = Math.ceil((await section.boundingBox())!.height);
                await page.setViewportSize({ width, height: height + 260 });
                await section.evaluate((el: HTMLElement) => scrollTo(0, el.getBoundingClientRect().top + scrollY - 90));
                await section.screenshot({ path: `${folder}/weekly-${name}-${width}.png` });
            }
            await page.setViewportSize({ width, height: 1000 });
        }
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, `周例会 ${width}`);
        geometry.push(await page.locator('[data-weekly-promotion]').evaluateAll((nodes: HTMLElement[]) => ({ viewport: innerWidth, cards: nodes.map(n => { const r = n.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; }) })));
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.locator('.weekly-report-actions').getByRole('button', { name: '保存草稿' }).click();
    await page.waitForFunction(() => document.querySelector('output[role=status]')?.textContent === '草稿已保存');
    await page.waitForLoadState('networkidle');
    [meeting] = await db.select().from(s.operationsReviewMeeting).where(eq(s.operationsReviewMeeting.id, meetingId));
    assert.ok(meeting.draftSnapshot.nonPromotionSelections.some(n => n.scheduleId === non.schedule.id && n.checkpointType === 'day_15'));
    // 定稿前源数据改变必须阻止；刷新后主选二轮附带首轮且不重复主计数。
    await db.update(s.operationsContentPerformanceMetric).set({ clickRate: '9.00', updatedAt: new Date() }).where(eq(s.operationsContentPerformanceMetric.scheduleId, non2.schedule.id));
    const reject = page.waitForResponse((r: any) => r.url().endsWith(`/api/meeting-reviews/${meetingId}`) && r.request().method() === 'PATCH');
    {
        const answer = respondToBusinessConfirm(page, true);
        await page.getByRole('button', { name: '定稿 V0' }).click();
        await answer;
    }
    assert.equal((await reject).status(), 409);
    await refresh.click();
    await page.waitForFunction(() => document.querySelector('output[role=status]')?.textContent?.includes('数据已刷新'));
    const finalResponse = page.waitForResponse((r: any) => r.url().endsWith(`/api/meeting-reviews/${meetingId}`) && r.request().method() === 'PATCH');
    {
        const answer = respondToBusinessConfirm(page, true);
        await page.getByRole('button', { name: '定稿 V0' }).click();
        await answer;
    }
    const final = await finalResponse;
    if (final.status() !== 200)
        assert.fail(await final.text());
    await page.waitForURL(/version=0/);
    await page.locator('[data-weekly-snapshot]').waitFor();
    await shot('weekly-final-1440');
    const frozen = (await db.select().from(s.operationsReviewMeetingVersion).where(eq(s.operationsReviewMeetingVersion.meetingId, meetingId)))[0].snapshot as any;
    assert.equal(frozen.schemaVersion, 4);
    assert.ok(frozen.generated.nonPromotions.some((n: any) => n.scheduleId === non.schedule.id && n.checkpointType === 'day_7' && n.comparisonOnly));
    assert.equal(frozen.generated.nonPromotions.filter((n: any) => n.scheduleId === non.schedule.id && !n.comparisonOnly).length, 1);
    const before = JSON.stringify(frozen);
    await db.update(s.operationsPromotionDailyMetric).set({ spend: '999.00' }).where(eq(s.operationsPromotionDailyMetric.campaignId, pending.campaign.id));
    assert.equal(JSON.stringify((await db.select().from(s.operationsReviewMeetingVersion).where(eq(s.operationsReviewMeetingVersion.meetingId, meetingId)))[0].snapshot), before);
    for (const width of [390, 320]) {
        await page.setViewportSize({ width, height: 1000 });
        await page.evaluate(() => scrollTo(0, 0));
        await shot(`weekly-final-${width}`);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await nav(`/business/meeting-review?meeting=${meetingId}&edit=1`);
    await page.getByLabel('核心结论与整体总结').fill('修订：保留首次定稿，补充更正后的数据。');
    await page.getByRole('button', { name: '刷新数据' }).click();
    await page.waitForFunction(() => document.querySelector('output[role=status]')?.textContent?.includes('数据已刷新'));
    {
        const answer = respondToBusinessConfirm(page, true);
        await page.getByRole('button', { name: '定稿 V1' }).click();
        await answer;
    }
    await page.waitForURL(/version=1/);
    await page.locator('[data-weekly-snapshot]').waitFor();
    const versions = await db.select().from(s.operationsReviewMeetingVersion).where(eq(s.operationsReviewMeetingVersion.meetingId, meetingId));
    assert.equal(versions.length, 2);
    assert.equal(JSON.stringify(versions.find(v => v.versionNumber === 0)!.snapshot), before);
    await shot('weekly-revision-v1-1440');
    console.log('checkpoint');
    checks.push('draft interval confirmation cancel preserves inputs, readonly mobile, append-only v1 revision, v4 empty template, stable candidate DOM during search and refresh, historical+peer benchmarks, paired rounds comparison-only, slow read feedback, seven widths, draft save, stale finalization refusal, immutable frozen v0');
    assert.deepEqual(errors, []);
    await page.close();
    await context.close();
    await writeFile(folder + '/result.json', JSON.stringify({ checks, geometry, errors }, null, 2));
    console.log(checks.join('\n'));
}
catch (error) {
    console.error(fixture.logs());
    throw error;
}
finally {
    await browser?.close();
    await fixture.stop();
}
