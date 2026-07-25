import { z } from 'zod';
import {
  categoryBelongsToSubject,
  postCategories,
  subjectRequiresCategory,
  subjects,
} from './taxonomy';

export const promotionStatuses = [
  'none',
  'pending',
  'testing',
  'scaling',
  'ended',
  'test_discarded',
  'formal_discarded',
] as const;
export const delayThresholdMs = 12 * 60 * 60 * 1000;
const subjectIds = subjects.map((subject) => subject.id) as [string, ...string[]];
const categoryIds = postCategories.map((category) => category.id) as [string, ...string[]];

const emptyToNull = (value: unknown) => typeof value === 'string' && value.trim() === '' ? null : value;
const optionalText = z.preprocess(emptyToNull, z.string().trim().max(500).nullable());
const requiredDocText = z.string().trim().min(1, '请填写项目文档名称').max(500);
const shanghaiDateTime = z.string().trim().min(1, '请选择时间').transform((value, context) => {
  const date = new Date(`${value}:00+08:00`);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) || Number.isNaN(date.getTime())) {
    context.addIssue({ code: 'custom', message: '请选择有效时间' });
    return z.NEVER;
  }
  return date;
});
const optionalShanghaiDateTime = z.preprocess(emptyToNull, shanghaiDateTime.nullable());

const versionFields = {
  contentName: z.string().trim().min(1, '请填写内容名称').max(200),
  subjectId: z.enum(subjectIds, { message: '请选择有效学科' }),
  categoryId: z.preprocess(emptyToNull, z.enum(categoryIds, { message: '请选择有效帖子分类' }).nullable()),
  projectDocName: requiredDocText,
  projectDocUrl: z.url('请输入有效的 HTTP/HTTPS 链接').refine((url) => /^https?:\/\//.test(url), '仅支持 HTTP/HTTPS 链接'),
};

const scheduleFields = {
  syncToMoments: z.boolean(),
  promotionStatus: z.enum(promotionStatuses, { message: '请选择有效推广状态' }),
  plannedPublishAt: shanghaiDateTime,
  actualPublishAt: optionalShanghaiDateTime,
  delayReason: optionalText,
};

const withBusinessRules = <T extends z.ZodRawShape>(shape: T) => z.object(shape).superRefine((data, context) => {
  const values = data as {
    subjectId?: string; categoryId?: string | null;
    plannedPublishAt?: Date; actualPublishAt?: Date | null; delayReason?: string | null;
  };
  if (values.subjectId && subjectRequiresCategory(values.subjectId) && !values.categoryId) {
    context.addIssue({ code: 'custom', path: ['categoryId'], message: '请选择帖子分类' });
  } else if (values.subjectId && values.categoryId && !categoryBelongsToSubject(values.categoryId, values.subjectId)) {
    context.addIssue({ code: 'custom', path: ['categoryId'], message: '帖子分类不属于所选学科' });
  }
  const delayed = values.actualPublishAt && values.plannedPublishAt
    && values.actualPublishAt.getTime() - values.plannedPublishAt.getTime() > delayThresholdMs;
  if (delayed && !values.delayReason) {
    context.addIssue({ code: 'custom', path: ['delayReason'], message: '请填写延期原因' });
  }
});

export const newPostSchema = withBusinessRules({ ...versionFields, ...scheduleFields });
export const editScheduleSchema = withBusinessRules({ ...versionFields, ...scheduleFields });
export const revisionSchema = withBusinessRules({
  ...versionFields,
  ...scheduleFields,
  sourceScheduleId: z.uuid('来源排期无效'),
  revisionSummary: z.string().trim().min(1, '请填写具体改动说明').max(1000),
});

export const normalizeCompletionStatus = (
  data: { plannedPublishAt: Date; actualPublishAt: Date | null },
) => {
  if (data.actualPublishAt) {
    return data.actualPublishAt.getTime() - data.plannedPublishAt.getTime() > delayThresholdMs ? 'delayed' : 'on_time';
  }
  return 'pending';
};

const commonInputFromForm = (form: FormData) => ({
  contentName: form.get('contentName'),
  subjectId: form.get('subjectId'),
  categoryId: form.get('categoryId'),
  syncToMoments: form.get('syncToMoments') === 'on',
  promotionStatus: form.get('promotionStatus'),
  projectDocName: form.get('projectDocName'),
  projectDocUrl: form.get('projectDocUrl'),
  plannedPublishAt: form.get('plannedPublishAt'),
  actualPublishAt: form.get('actualPublishAt'),
  delayReason: form.get('delayReason'),
});

export const newPostInputFromForm = commonInputFromForm;
export const editScheduleInputFromForm = commonInputFromForm;
export const revisionInputFromForm = (form: FormData) => ({
  ...commonInputFromForm(form),
  sourceScheduleId: form.get('sourceScheduleId'),
  revisionSummary: form.get('revisionSummary'),
});

export const issuesByField = (issues: z.core.$ZodIssue[]) => {
  const fields: Record<string, string[]> = {};
  for (const issue of issues) {
    const field = String(issue.path?.[0] ?? 'form');
    (fields[field] ??= []).push(issue.message);
  }
  return fields;
};
