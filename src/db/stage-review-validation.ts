import { z } from 'zod';

const checkpoint = z.enum(['day_7', 'day_15']);
const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '请选择有效日期');
const requiredText = (message: string) => z.string().trim().min(1, message).max(2000, '内容过长');
const rate = z.coerce.number().min(0, '不能小于 0').max(100, '不能大于 100');

export const stageReviewMeetingSchema = z.object({
  name: requiredText('请填写会议名称').max(120, '会议名称过长'),
  periodStart: dateKey,
  periodEnd: dateKey,
  meetingAt: z.coerce.date({ error: '请选择会议时间' }),
}).superRefine((value, context) => {
  if (value.periodEnd < value.periodStart) context.addIssue({ code: 'custom', path: ['periodEnd'], message: '结束日不能早于开始日' });
});

export const stageReviewItemSchema = z.object({
  scheduleId: z.uuid('排期编号无效'),
  checkpointType: checkpoint,
  recordedThrough: dateKey,
  clickRate: rate,
  threeSecondReadRate: rate,
  conclusion: requiredText('请填写复盘结论'),
});

export const formObject = (form: FormData) => Object.fromEntries(form.entries());

export const issuesByField = (issues: z.core.$ZodIssue[]) => {
  const fields: Record<string, string[]> = {};
  for (const issue of issues) (fields[String(issue.path[0] ?? 'form')] ??= []).push(issue.message);
  return fields;
};
