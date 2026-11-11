import {readScheduleStructures} from '../../../../db/schedule-edit-policy';
/**
 * 推广帖按版本与生效日期更正笔记 ID；普通非推广保留帖子共享字段。
 */
import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '../../../../db/client';
import { operationsContent,operationsContentVersion,operationsContentSchedule } from '../../../../db/schema';
import {WorkflowError,StaleWriteError} from '../../../../db/schedule-workflow';
import {workflowErrorResponse} from '../../../../db/workflow-api';
import { platformNoteIdSchema } from '../../../../db/platform-note-id';
import {correctVersionNote,requireVersionNote,readVersionNotes} from '../../../../db/note-identities';
import {noteIdOn} from '../../../../db/note-identity-rules';
import {businessDate} from '../../../../db/promotion-wait-ranges';

export const prerender = false;

const correctionSchema=z.object({versionId:z.uuid(),effectiveOn:businessDate,scope:z.enum(['version','from_date']),platformNoteId:platformNoteIdSchema,expectedFingerprint:z.string().min(1),requestKey:z.uuid(),confirmed:z.literal('true')});
export const GET:APIRoute=async({url,params})=>{
 try{
  const parsed=z.object({versionId:z.uuid(),effectiveOn:businessDate}).safeParse(Object.fromEntries(url.searchParams));
  if(!parsed.success)return Response.json({message:'请选择帖子版本和有效的历史日期。'},{status:422});
  const state=await requireVersionNote(getDb(),parsed.data.versionId);
  if(state.contentId!==params.contentId||!state.promoted)return Response.json({message:'请选择这篇推广帖的正确版本。'},{status:422});
  return Response.json({versionId:state.id,versionNumber:state.versionNumber,effectiveOn:parsed.data.effectiveOn,platformNoteId:noteIdOn(state.periods,parsed.data.effectiveOn),periods:state.periods,fingerprint:state.fingerprint});
 }catch(error){return workflowErrorResponse(error);}
};

const schema = z.object({
  platformNoteId: platformNoteIdSchema,
  expectedPlatformNoteId:platformNoteIdSchema,
  confirmSharedUpdate: z.literal('true', { error: '请先确认更正影响' }),
});

export const POST: APIRoute = async ({ request, url, params, locals }) => {
  if (request.headers.get('origin') !== url.origin) return new Response('拒绝跨站写入。', { status: 403 });
  let form: FormData;
  try { form = await request.formData(); } catch { return Response.json({ message: '请求必须使用有效表单。' }, { status: 400 }); }
  if(form.has('versionId')) {
    const input=correctionSchema.safeParse(Object.fromEntries(form));
    if(!input.success)return Response.json({message:input.error.issues[0]?.message??'请核对更正范围。'},{status:422});
    try{return Response.json(await getDb().transaction(tx=>correctVersionNote(tx,params.contentId!,input.data,locals.user!)));}
    catch(error){return workflowErrorResponse(error);}
  }
  const parsed = schema.safeParse({
    platformNoteId: form.get('platformNoteId'),
    expectedPlatformNoteId:form.get('expectedPlatformNoteId'),
    confirmSharedUpdate: form.get('confirmSharedUpdate'),
  });
  if (!parsed.success) return Response.json({ message: parsed.error.issues[0]?.message ?? '请检查笔记 ID。' }, { status: 422 });

  try {
    const result=await getDb().transaction(async tx=>{
    const [current] = await tx.select({ id: operationsContent.id, platformNoteId: operationsContent.platformNoteId })
      .from(operationsContent).where(eq(operationsContent.id, params.contentId!)).for('update');
    if (!current)throw new WorkflowError('没有找到这篇帖子。',404);
    const versionRows=await tx.select({id:operationsContentVersion.id}).from(operationsContentVersion).where(eq(operationsContentVersion.contentId,current.id));
    if([...(await readVersionNotes(tx,versionRows.map(v=>v.id))).values()].some(v=>v.promoted))throw new WorkflowError('推广帖请打开某一天的历史详情，选择本版本的笔记 ID 更正范围；旧页面请刷新。',422);
    if (current.platformNoteId === parsed.data.platformNoteId)return {ok:true,platformNoteId:current.platformNoteId};
    if(current.platformNoteId!==parsed.data.expectedPlatformNoteId)throw new StaleWriteError('笔记ID已被更正，请重新核对；当前输入已保留。');
    const structures=await readScheduleStructures(tx,[current.id]);
    await tx.update(operationsContent).set({
      platformNoteId: parsed.data.platformNoteId,
      updatedAt: new Date(),
    }).where(eq(operationsContent.id, current.id));
    const schedules=await tx.select({id:operationsContentSchedule.id,history:operationsContentSchedule.executionHistory}).from(operationsContentSchedule).innerJoin(operationsContentVersion,eq(operationsContentVersion.id,operationsContentSchedule.contentVersionId)).where(eq(operationsContentVersion.contentId,current.id));
    for(const row of schedules)await tx.update(operationsContentSchedule).set({executionHistory:[...row.history,{at:new Date().toISOString(),actor:locals.operationsUser||'unknown',kind:'note_id_correction',reason:'已确认同步全部版本',before:structures.find(s=>s.id===row.id)??null,after:{...structures.find(s=>s.id===row.id),platformNoteId:parsed.data.platformNoteId}}]}).where(eq(operationsContentSchedule.id,row.id));
    return {ok:true,oldValue:current.platformNoteId,platformNoteId:parsed.data.platformNoteId};
    });
    return Response.json(result);
  } catch (error) {
    if ((error as { code?: string }).code === '23505') return Response.json({ message: '这个笔记 ID 已属于另一篇帖子，请核对后重试。' }, { status: 409 });
    console.error('platform note id correction failed', error);
    return workflowErrorResponse(error);
  }
};
