import { z } from 'zod';
import { optionalPlatformNoteIdSchema } from './platform-note-id';

const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式无效').refine(value=>{const date=new Date(`${value}T00:00:00Z`);return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value;},'日期无效');
const presentNumber=(value:unknown)=>value==null||typeof value==='string'&&!value.trim()?undefined:value;
const nonNegativeInteger = z.preprocess(presentNumber,z.coerce.number().int('人数必须是整数').min(0, '人数不能小于 0').max(2147483647,'人数过大'));

const promotionDailyMetricFields = {
  dailyStatus: z.enum(['active', 'waiting_action']),
  actualStatusSnapshot:z.enum(['testing','test_paused','test_pending','scaling','scaling_paused','test_discarded','formal_discarded','ended']).nullable().optional(),
  recordKind:z.enum(['regular','test_residual']).default('regular'),
  stageTypeSnapshot: z.enum(['testing', 'scaling']),
  spend: z.preprocess(presentNumber,z.coerce.number().min(0, '消耗不能小于 0').max(9999999999.99, '消耗金额过大')),
  platformOpenCount: nonNegativeInteger,
  actualOpenCount: nonNegativeInteger,
  platformLeadCount: nonNegativeInteger,
  actualLeadCount: nonNegativeInteger,
  reviewDecision: z.enum([
    'test_continue', 'restart_testing',
    'test_discarded',
    'start_scaling',
    'scaling_continue',
    'formal_discarded',
    'ended',
    'wait_continue',
    'test_pause', 'test_pending', 'scaling_pause',
  ]),
  note: z.string().trim().max(500, '备注不能超过 500 字').nullable().optional(),
};

export const promotionDailySchema = z.object({
  campaignId: z.uuid('推广活动无效'),
  requestKey:z.uuid().optional(),fingerprint:z.string().optional(),
  metricDate: dateKey,
  platformNoteId: optionalPlatformNoteIdSchema,
  ...promotionDailyMetricFields,
});

export const promotionDailyInputFromForm = (form: FormData) => ({
  campaignId: form.get('campaignId'),
  requestKey:form.get('requestKey')||undefined,fingerprint:form.get('fingerprint')||undefined,
  metricDate: form.get('metricDate'),
  dailyStatus: form.get('dailyStatus'),
  actualStatusSnapshot: form.get('actualStatusSnapshot')||undefined,
  recordKind:form.get('recordKind')||'regular',
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
});

export const promotionDailyUpdateInputFromForm = (form: FormData) => ({
  dailyStatus: form.get('dailyStatus'),
  actualStatusSnapshot: form.get('actualStatusSnapshot')||undefined,
  recordKind:form.get('recordKind')||'regular',
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
