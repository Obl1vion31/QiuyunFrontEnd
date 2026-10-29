import { z } from 'zod';
import { extractPublicationLink } from './publication-link.mjs';
import {
  subjectCategoryMappings,
  postCategories,
  subjects,
} from './taxonomy';

export const promotionStatuses = [
  'none',
  'pending',
  'awaiting_promotion',
  'testing',
  'scaling',
  'waiting_action',
  'ended',
  'test_discarded',
  'formal_discarded',
] as const;
export { delayThresholdMs } from './schedule-rules.mjs';
import { completionStatus } from './schedule-rules.mjs';
const emptyToNull = (value: unknown) => typeof value === 'string' && value.trim() === '' ? null : value;
export const shanghaiDateTime = z.string().trim().min(1, '请选择时间').transform((value, context) => {
  const date = new Date(`${value}:00+08:00`);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) || Number.isNaN(date.getTime()) || new Date(date.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 16) !== value) {
    context.addIssue({ code: 'custom', message: '请选择有效时间' });
    return z.NEVER;
  }
  return date;
});
const optionalHttpUrl = z.preprocess(
  emptyToNull,
  z.url('请输入有效的 HTTP/HTTPS 链接').refine((url) => /^https?:\/\//.test(url), '仅支持 HTTP/HTTPS 链接').nullable(),
);
export const publicationUrlSchema = z.string().trim().min(1,'请粘贴对应的小红书帖子链接').max(4000).transform((value,context) => {
  const result = extractPublicationLink(value);
  if (result.error) { context.addIssue({ code: 'custom', message: result.error }); return z.NEVER; }
  return result.url;
});

export function createPostSchemas(taxonomy:{subjects:ReadonlyArray<{id:string}>;postCategories:ReadonlyArray<{id:string}>;subjectCategoryMappings:ReadonlyArray<{subjectId:string;categoryId:string}>}){
 const subjectIds=taxonomy.subjects.map(row=>row.id) as [string,...string[]],categoryIds=taxonomy.postCategories.map(row=>row.id) as [string,...string[]];
 const versionFields={contentName:z.string().trim().min(1,'请填写内容名称').max(200),subjectId:z.enum(subjectIds,{message:'请选择有效学科'}),categoryId:z.preprocess(emptyToNull,z.enum(categoryIds,{message:'请选择有效帖子分类'}).nullable()),projectDocUrl:optionalHttpUrl};
 const scheduleFields={syncToMoments:z.boolean(),isPromoted:z.boolean(),promotionStatus:z.enum(promotionStatuses,{message:'请选择有效推广状态'}),plannedPublishAt:shanghaiDateTime};
 const rules=<T extends z.ZodRawShape>(shape:T)=>z.object(shape).superRefine((data,context)=>{const v=data as {subjectId?:string;categoryId?:string|null};if(v.subjectId&&!v.categoryId)context.addIssue({code:'custom',path:['categoryId'],message:'请选择帖子分类'});else if(v.subjectId&&v.categoryId&&!taxonomy.subjectCategoryMappings.some(m=>m.subjectId===v.subjectId&&m.categoryId===v.categoryId))context.addIssue({code:'custom',path:['categoryId'],message:'帖子分类不属于所选学科'});});
 return {newPostSchema:rules({...versionFields,...scheduleFields}),editScheduleSchema:rules({...versionFields,...scheduleFields}),revisionSchema:rules({...versionFields,...scheduleFields,sourceScheduleId:z.uuid('来源排期无效'),revisionSummary:z.string().trim().min(1,'请填写具体改动说明').max(1000)})};
}
// 静态导出仅供旧种子与纯规则测试；业务接口按数据库字典创建校验器。
export const {newPostSchema,editScheduleSchema,revisionSchema}=createPostSchemas({subjects,postCategories,subjectCategoryMappings});

export const publicationSchema = z.object({
  actualPublishAt: z.preprocess(emptyToNull,shanghaiDateTime.nullable().optional()),
  projectDocUrl: optionalHttpUrl.optional(),
  publicationUrl: z.preprocess(emptyToNull, publicationUrlSchema.nullable().optional()),
  expectedPlanRevision:z.coerce.number().int().min(0),
  expectedPublicationRevision:z.coerce.number().int().min(0),
  correctionReason:z.string().trim().max(500).optional(),
  momentsSentConfirmed:z.boolean().optional(),
  momentsRequestSentConfirmed:z.boolean().optional(),
});

export const normalizeCompletionStatus = (
  data: { plannedPublishAt: Date; actualPublishAt: Date | null; delayThresholdHours?: number },
) => {
  return completionStatus(data.plannedPublishAt, data.actualPublishAt, data.delayThresholdHours);
};

const commonInputFromForm = (form: FormData) => ({
  contentName: form.get('contentName'),
  subjectId: form.get('subjectId'),
  categoryId: form.get('categoryId'),
  syncToMoments: form.get('syncToMoments') === 'on',
  isPromoted: form.get('isPromoted') === 'on',
  promotionStatus: form.get('promotionStatus'),
  projectDocUrl: form.get('projectDocUrl'),
  plannedPublishAt: form.get('plannedPublishAt'),
});

export const newPostInputFromForm = commonInputFromForm;
export const editScheduleInputFromForm = commonInputFromForm;
export const revisionInputFromForm = (form: FormData) => ({
  ...commonInputFromForm(form),
  sourceScheduleId: form.get('sourceScheduleId'),
  revisionSummary: form.get('revisionSummary'),
});

export const publicationInputFromForm = (form: FormData) => ({
  actualPublishAt: form.get('actualPublishAt') ?? undefined,
  projectDocUrl: form.get('projectDocUrl') ?? undefined,
  publicationUrl: form.get('publicationUrl'),
  expectedPlanRevision:form.get('expectedPlanRevision') ?? undefined,
  expectedPublicationRevision:form.get('expectedPublicationRevision') ?? undefined,
  correctionReason:form.get('correctionReason') ?? undefined,
  momentsSentConfirmed:form.get('momentsSentConfirmed') === 'on',
  momentsRequestSentConfirmed:form.get('momentsRequestSentConfirmed') === 'on',
});

export const issuesByField = (issues: z.core.$ZodIssue[]) => {
  const fields: Record<string, string[]> = {};
  for (const issue of issues) {
    const field = String(issue.path?.[0] ?? 'form');
    (fields[field] ??= []).push(issue.message);
  }
  return fields;
};
