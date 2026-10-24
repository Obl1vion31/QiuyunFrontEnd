import type { APIRoute } from 'astro';
import {readWeeklyPostDetails} from '../../../../db/meeting-note-ids';
import { eq } from 'drizzle-orm';
import { getDb } from '../../../../db/client';
import { operationsReviewMeeting } from '../../../../db/schema';
import { readWeeklyMaterial } from '../../../../db/meeting-weekly-material';
import { businessDate } from '../../../../db/promotion-wait-ranges';
import { shanghaiDateKey } from '../../../../db/promotion-rules.mjs';
export const prerender = false;
export const GET: APIRoute = async ({ params, url }) => {
    try {
        const [meeting] = await getDb().select().from(operationsReviewMeeting).where(eq(operationsReviewMeeting.id, params.id!));
        if (!meeting)
            return Response.json({ message: '没有找到此会议。' }, { status: 404 });
        const periodStart = url.searchParams.get('from') ?? meeting.periodStart, periodEnd = url.searchParams.get('to') ?? meeting.periodEnd;
        if (!businessDate.safeParse(periodStart).success || !businessDate.safeParse(periodEnd).success || periodStart > periodEnd || periodEnd >= shanghaiDateKey(new Date()))
            return Response.json({ message: '请选择今天以前的有效区间。' }, { status: 422 });
        const result = await getDb().transaction(async tx => {const material=await readWeeklyMaterial(tx,{...meeting,periodStart,periodEnd});return {material,...await readWeeklyPostDetails(tx,material)}}, { isolationLevel: 'repeatable read' });
        return Response.json(result, { headers: { 'Cache-Control': 'private, no-store' } });
    }
    catch (error) {
        console.error('weekly material read failed', error);
        return Response.json({ message: '例会数据加载失败，输入已保留。' }, { status: 503 });
    }
};
