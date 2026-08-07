import { z } from 'zod';

const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式无效');
const nonNegativeInteger = z.coerce.number().int('人数必须是整数').min(0, '人数不能小于 0');

export const promotionDailySchema = z.object({
  campaignId: z.uuid('推广活动无效'),
  metricDate: dateKey,
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
  ]),
  note: z.string().trim().max(500, '备注不能超过 500 字').nullable().optional(),
});

export const promotionDailyInputFromForm = (form: FormData) => ({
  campaignId: form.get('campaignId'),
  metricDate: form.get('metricDate'),
  spend: form.get('spend'),
  platformOpenCount: form.get('platformOpenCount'),
  actualOpenCount: form.get('actualOpenCount'),
  platformLeadCount: form.get('platformLeadCount'),
  actualLeadCount: form.get('actualLeadCount'),
  reviewDecision: form.get('reviewDecision'),
  note: form.get('note') || null,
});

export const promotionDailyUpdateSchema = promotionDailySchema.omit({
  campaignId: true,
  metricDate: true,
}).extend({
  confirmCascade: z.coerce.boolean().default(false),
});

export const promotionDailyUpdateInputFromForm = (form: FormData) => ({
  spend: form.get('spend'),
  platformOpenCount: form.get('platformOpenCount'),
  actualOpenCount: form.get('actualOpenCount'),
  platformLeadCount: form.get('platformLeadCount'),
  actualLeadCount: form.get('actualLeadCount'),
  reviewDecision: form.get('reviewDecision'),
  note: form.get('note') || null,
  confirmCascade: form.get('confirmCascade') === 'true',
});
