import { z } from 'zod';
import { optionalPlatformNoteIdSchema } from './platform-note-id';

const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式无效');
const nonNegativeInteger = z.coerce.number().int('人数必须是整数').min(0, '人数不能小于 0');

const promotionDailyMetricFields = {
  dailyStatus: z.enum(['active', 'waiting_action']),
  stageTypeSnapshot: z.enum(['testing', 'scaling']),
  spend: z.coerce.number().min(0, '消耗不能小于 0').max(9999999999.99, '消耗金额过大'),
  platformOpenCount: nonNegativeInteger,
  actualOpenCount: nonNegativeInteger,
  platformLeadCount: nonNegativeInteger,
  actualLeadCount: nonNegativeInteger,
  reviewDecision: z.enum([
    'test_continue',
    'test_discarded',
    'start_scaling',
    'scaling_continue',
    'formal_discarded',
    'ended',
    'wait_continue',
  ]),
  note: z.string().trim().max(500, '备注不能超过 500 字').nullable().optional(),
};

type PromotionDailyMetric = z.infer<z.ZodObject<typeof promotionDailyMetricFields>>;

const validateWaitingAction = (data: PromotionDailyMetric, context: z.RefinementCtx) => {
  if (data.dailyStatus === 'waiting_action' && [
    data.spend,
    data.platformOpenCount,
    data.actualOpenCount,
    data.platformLeadCount,
    data.actualLeadCount,
  ].some((value) => value !== 0)) {
    context.addIssue({ code: 'custom', path: ['dailyStatus'], message: '等待行动日的全部数据必须为 0' });
  }
};

export const promotionDailySchema = z.object({
  campaignId: z.uuid('推广活动无效'),
  metricDate: dateKey,
  platformNoteId: optionalPlatformNoteIdSchema,
  ...promotionDailyMetricFields,
}).superRefine(validateWaitingAction);

export const promotionDailyInputFromForm = (form: FormData) => ({
  campaignId: form.get('campaignId'),
  metricDate: form.get('metricDate'),
  dailyStatus: form.get('dailyStatus'),
  stageTypeSnapshot: form.get('stageTypeSnapshot'),
  spend: form.get('spend'),
  platformOpenCount: form.get('platformOpenCount'),
  actualOpenCount: form.get('actualOpenCount'),
  platformLeadCount: form.get('platformLeadCount'),
  actualLeadCount: form.get('actualLeadCount'),
  reviewDecision: form.get('reviewDecision'),
  note: form.get('note') || null,
  platformNoteId: form.get('platformNoteId'),
});

export const promotionDailyUpdateSchema = z.object({
  ...promotionDailyMetricFields,
  confirmCascade: z.coerce.boolean().default(false),
}).superRefine(validateWaitingAction);

export const promotionDailyUpdateInputFromForm = (form: FormData) => ({
  dailyStatus: form.get('dailyStatus'),
  stageTypeSnapshot: form.get('stageTypeSnapshot'),
  spend: form.get('spend'),
  platformOpenCount: form.get('platformOpenCount'),
  actualOpenCount: form.get('actualOpenCount'),
  platformLeadCount: form.get('platformLeadCount'),
  actualLeadCount: form.get('actualLeadCount'),
  reviewDecision: form.get('reviewDecision'),
  note: form.get('note') || null,
  confirmCascade: form.get('confirmCascade') === 'true',
});
