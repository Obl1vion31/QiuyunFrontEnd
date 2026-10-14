import { permissionErrorResponse } from '../auth/permissions';
import { WorkflowError } from './schedule-workflow';
import { issuesByField } from './validation';
import type { z } from 'zod';
export async function workflowForm<T extends z.ZodType>(request: Request, url: URL, schema: T) {
  if (request.headers.get('origin') !== url.origin) throw new WorkflowError('拒绝跨站写入。', 403);
  let form: FormData;
  try { form = await request.formData(); } catch { throw new WorkflowError('请求必须使用有效表单。', 400); }
  const parsed = schema.safeParse(Object.fromEntries(form.entries()));
  if (!parsed.success) return { error: Response.json({ message: '请检查标记的字段。', fields: issuesByField(parsed.error.issues) }, { status: 422 }) };
  return { data: parsed.data as z.infer<T> };
}
export function workflowErrorResponse(error: unknown) {
  const denied = permissionErrorResponse(error);
  if (denied) return denied;
  if (error instanceof WorkflowError) return Response.json({ message: error.message }, { status: error.status });
  const code = (error as { code?: string; cause?: { code?: string } }).code ?? (error as { cause?: { code?: string } }).cause?.code;
  if (code === '23505') return Response.json({ message: '这条记录已被更新，请刷新后重试。' }, { status: 409 });
  if (code === '23503' || code === '23001') return Response.json({ message: '这条记录已有业务历史，不能删除或覆盖。' }, { status: 409 });
  console.error('business workflow failed', error);
  return Response.json({ message: '保存失败，请稍后重试。当前输入已保留。' }, { status: 503 });
}
