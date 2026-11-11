import {StaleWriteError} from '../../../db/schedule-workflow';
import {readVersionNotes} from '../../../db/note-identities';
import {noteIdOn} from '../../../db/note-identity-rules';
import type { APIRoute } from 'astro';
import { eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '../../../db/client';
import { promotionDailySchema } from '../../../db/promotion-validation';
import { writePromotionDaily, requireDailySaved } from '../../../db/promotion-daily-write';
import { lockPromotionWorkflow } from '../../../db/promotion-pauses';
import { promotionSnapshot, timelineFingerprint } from '../../../db/promotion-timeline';
import { WorkflowError } from '../../../db/schedule-workflow';
import { operationsContent as contents, operationsContentVersion as versions, operationsContentSchedule as schedules, operationsPromotionCampaign as campaigns, operationsPromotionTimelineAudit as audits } from '../../../db/schema';
export const prerender = false;
const schema = z.object({ rows: z.array(promotionDailySchema.extend({ requestKey: z.uuid(), fingerprint: z.string().min(1), recordKind: z.literal('regular') })).min(1).max(200) });
export const POST: APIRoute = async ({ request, url, locals }) => {
    if (request.headers.get('origin') !== url.origin)
        return Response.json({ message: '拒绝跨站写入。' }, { status: 403 });
    let input: unknown;
    try {
        input = await request.json();
    }
    catch {
        return Response.json({ message: '请求格式无效。' }, { status: 400 });
    }
    const parsed = schema.safeParse(input);
    if (!parsed.success)
        return Response.json({ message: '请检查待填写数据。', fields: parsed.error.issues }, { status: 422 });
    const rows = parsed.data.rows, keys = rows.map(r => `${r.campaignId}:${r.metricDate}`);
    if (new Set(rows.map(r => r.campaignId)).size !== rows.length || new Set(keys).size !== keys.length || new Set(rows.map(r => r.requestKey)).size !== rows.length)
        return Response.json({ message: '批量记录或请求编号重复。' }, { status: 422 });
    let currentKey = '';
    try {
        const saved = await getDb().transaction(async (tx) => {
            await lockPromotionWorkflow(tx);
            const info = await tx.select({ campaignId: campaigns.id, scheduleId: campaigns.scheduleId, contentId: contents.id, versionId:versions.id }).from(campaigns).innerJoin(schedules, eq(campaigns.scheduleId, schedules.id)).innerJoin(versions, eq(schedules.contentVersionId, versions.id)).innerJoin(contents, eq(versions.contentId, contents.id)).where(inArray(campaigns.id, rows.map(r => r.campaignId))).orderBy(campaigns.id);
            const noteStates=await readVersionNotes(tx,info.map(c=>c.versionId));
            if (rows.some(r => !info.some(c => c.campaignId === r.campaignId)))
                throw new WorkflowError('部分活动已不存在，请刷新后重试。', 404);
            const repeats = await tx.select().from(audits).where(inArray(audits.requestKey, rows.map(r => r.requestKey)));
            // 所有客户端指纹先与事务初始快照比较，避免本批写入使后续项误报冲突。
            for (const scheduleId of [...new Set(info.map(c => c.scheduleId))].sort()) {
                const baseline = timelineFingerprint(await promotionSnapshot(tx, scheduleId));
                for (const row of rows.filter(r => info.find(c => c.campaignId === r.campaignId)!.scheduleId === scheduleId)) {
                    currentKey = `${row.campaignId}:${row.metricDate}`;
                    if (!repeats.some(a => a.requestKey === row.requestKey) && row.fingerprint !== baseline)
                        throw new StaleWriteError('推广记录已变化，请刷新后核对。');
                }
            }
            const initialByVersion = new Map<string, string>(),chosenByRow=new Map<string,string>();
            for (const row of rows) {
                const c = info.find(c => c.campaignId === row.campaignId)!;
                currentKey = `${row.campaignId}:${row.metricDate}`;
                const repeated=repeats.find(a=>a.requestKey===row.requestKey);
                const id = row.platformNoteId??(typeof repeated?.after.requestPlatformNoteId==='string'?repeated.after.requestPlatformNoteId:undefined);
                const current=noteIdOn(noteStates.get(c.versionId)!.periods,row.metricDate);
                if (!repeated&&current && id && current !== id)
                    throw new WorkflowError('已有笔记 ID 不能在每日复盘中覆盖，请使用资料更正入口。', 422);
                const chosen = id || current;
                if (!chosen)
                    continue;
                if (!current&&initialByVersion.has(c.versionId) && initialByVersion.get(c.versionId) !== chosen)
                    throw new WorkflowError('同一版本的笔记 ID 不一致，请核对。', 422);
                if ([...chosenByRow].some(([campaignId, noteId]) => info.find(c=>c.campaignId===campaignId)?.contentId !== c.contentId && noteId === chosen))
                    throw new WorkflowError('不同帖子不能共用同一笔记 ID。', 422);
                if(!current)initialByVersion.set(c.versionId,chosen);chosenByRow.set(c.campaignId,chosen);
            }
            const result = [];
            for (const row of [...rows].sort((a, b) => a.campaignId.localeCompare(b.campaignId) || a.metricDate.localeCompare(b.metricDate))) {
                currentKey = `${row.campaignId}:${row.metricDate}`;
                const c = info.find(c => c.campaignId === row.campaignId)!;
                const entry = requireDailySaved(await writePromotionDaily(tx, { ...row, platformNoteId: chosenByRow.get(c.campaignId)??initialByVersion.get(c.versionId)??row.platformNoteId }, locals.user!, true));
                result.push({ ...entry, key: currentKey, scheduleId: c.scheduleId });
            }
            return result;
        });
        return Response.json({ ok: true, rows: saved }, { status: 201 });
    }
    catch (error) {
        const pg = error as {
            code?: string;
            cause?: {
                code?: string;
            };
        };
        if (error instanceof WorkflowError)
            return Response.json({ message: error.message, key: currentKey,...(error.code?{code:error.code}:{}) }, { status: error.status });
        if ((pg.code ?? pg.cause?.code) === '23505')
            return Response.json({ message: '日期已保存或笔记 ID 已被其他帖子使用，请核对。', key: currentKey }, { status: 409 });
        console.error('promotion batch save failed', error);
        return Response.json({ message: '整批保存失败，所有输入均已保留。', key: currentKey }, { status: 503 });
    }
};
