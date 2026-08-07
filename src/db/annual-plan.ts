import { z } from 'zod';
import { overlappingBlockPairs } from './annual-plan-rules.mjs';
import type { AnnualPlanSnapshot } from './schema';

const optionalText = (maximum: number) => z.preprocess(
  (value) => typeof value === 'string' && value.trim() === '' ? null : value,
  z.string().trim().max(maximum).nullable(),
);
const httpUrl = z.url('请输入有效的 HTTP/HTTPS 链接')
  .refine((url) => /^https?:\/\//.test(url), '仅支持 HTTP/HTTPS 链接');
const blockBase = {
  startMonth: z.int().min(1).max(12),
  endMonth: z.int().min(1).max(12),
  label: z.string().trim().min(1, '请填写时间块名称').max(200),
  note: optionalText(500),
  sortOrder: z.int().min(0).max(9999),
};
const blockSchema = z.discriminatedUnion('ruleType', [
  z.object({
    ...blockBase,
    ruleType: z.null(),
    monthlyFrequency: z.null().optional(),
    quantityParts: z.null().optional(),
  }),
  z.object({
    ...blockBase,
    ruleType: z.literal('flexible'),
    monthlyFrequency: z.int().positive().max(999),
    quantityParts: z.null().optional(),
  }),
  z.object({
    ...blockBase,
    ruleType: z.literal('fixed'),
    monthlyFrequency: z.null().optional(),
    quantityParts: z.array(z.int().positive().max(999)).min(1).max(24),
  }),
]).refine((block) => block.endMonth >= block.startMonth, {
  path: ['endMonth'],
  message: '结束月份不能早于开始月份',
});
const linkSchema = z.object({
  label: z.string().trim().min(1).max(120).default('SOP'),
  url: httpUrl,
  sortOrder: z.int().min(0).max(9999),
});
const rowFields = {
  year: z.int().min(2000).max(9999),
  sectionKey: z.string().trim().min(1).max(80),
  sectionLabel: z.string().trim().min(1, '请填写分区名称').max(120),
  subjectId: z.string().trim().min(1).nullable(),
  rowName: z.string().trim().min(1, '请填写规划项目名称').max(200),
  categoryId: z.string().trim().min(1).nullable(),
  note: optionalText(1000),
  sortOrder: z.int().min(0).max(9999),
  isActive: z.boolean(),
  countsTowardPromotion: z.boolean(),
  blocks: z.array(blockSchema).max(24),
  links: z.array(linkSchema).max(30),
  changeSummary: z.string().trim().min(1, '请填写本次调整说明').max(500),
};
const withRowRules = <T extends z.ZodRawShape>(shape: T) => z.object(shape).superRefine((data, context) => {
  const row = data as {
    subjectId?: string | null;
    categoryId?: string | null;
    blocks?: Array<{ startMonth: number; endMonth: number }>;
  };
  if (row.categoryId && !row.subjectId) {
    context.addIssue({ code: 'custom', path: ['categoryId'], message: '关联帖子分类前必须选择学科分区' });
  }
  const overlaps = overlappingBlockPairs(row.blocks ?? []);
  for (const [left, right] of overlaps) {
    context.addIssue({
      code: 'custom',
      path: ['blocks'],
      message: `第 ${left + 1} 和第 ${right + 1} 个时间块月份重叠`,
    });
  }
});

export const createAnnualPlanSchema = withRowRules(rowFields);
export const updateAnnualPlanSchema = withRowRules({
  ...rowFields,
  expectedVersionNumber: z.int().min(0),
});
export const restoreAnnualPlanSchema = z.object({
  versionNumber: z.int().min(0),
  expectedVersionNumber: z.int().min(0),
});
export const annualPlanYearSchema = z.object({
  year: z.int().min(2000).max(9999),
  instructions: optionalText(3000),
});

export type AnnualPlanInput = z.infer<typeof createAnnualPlanSchema>;

export function normalizedPlanInput(input: AnnualPlanInput) {
  return {
    ...input,
    subjectId: input.subjectId ?? null,
    categoryId: input.categoryId ?? null,
    courseName: null,
    note: input.note ?? null,
    blocks: [...input.blocks]
      .sort((left, right) => left.sortOrder - right.sortOrder || left.startMonth - right.startMonth)
      .map((block) => ({
        startMonth: block.startMonth,
        endMonth: block.endMonth,
        label: block.label,
        ruleType: block.ruleType,
        monthlyFrequency: block.ruleType === 'flexible' ? block.monthlyFrequency : null,
        quantityParts: block.ruleType === 'fixed' ? block.quantityParts : null,
        note: block.note ?? null,
        sortOrder: block.sortOrder,
      })),
    links: [...input.links]
      .sort((left, right) => left.sortOrder - right.sortOrder)
      .map((link) => ({ ...link })),
  };
}

export function buildAnnualPlanSnapshot(
  input: AnnualPlanInput,
  names: { subjectName: string | null; categoryName: string | null },
): AnnualPlanSnapshot {
  const normalized = normalizedPlanInput(input);
  return {
    schemaVersion: 3,
    row: {
      year: normalized.year,
      sectionKey: normalized.sectionKey,
      sectionLabel: normalized.sectionLabel,
      subjectId: normalized.subjectId,
      subjectName: names.subjectName,
      rowName: normalized.rowName,
      categoryId: normalized.categoryId,
      categoryName: names.categoryName,
      courseName: normalized.courseName,
      note: normalized.note,
      sortOrder: normalized.sortOrder,
      isActive: normalized.isActive,
      countsTowardPromotion: normalized.countsTowardPromotion,
    },
    blocks: normalized.blocks,
    links: normalized.links,
  };
}

export function snapshotsEqual(left: AnnualPlanSnapshot, right: AnnualPlanSnapshot) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function diffAnnualPlanSnapshots(previous: AnnualPlanSnapshot | null, next: AnnualPlanSnapshot): string[] {
  if (!previous) return ['创建规划行'];
  const changes: string[] = [];
  const fields: Array<[keyof AnnualPlanSnapshot['row'], string]> = [
    ['year', '年份'],
    ['sectionKey', '分区'],
    ['sectionLabel', '分区名称'],
    ['subjectId', '学科关联'],
    ['rowName', '规划项目名称'],
    ['categoryId', '帖子分类'],
    ['note', '备注'],
    ['sortOrder', '显示顺序'],
    ['isActive', '启用状态'],
    ['countsTowardPromotion', '推广周期汇总标记'],
  ];
  for (const [field, label] of fields) {
    if (JSON.stringify(previous.row[field]) !== JSON.stringify(next.row[field])) changes.push(`修改${label}`);
  }
  if (JSON.stringify(previous.blocks) !== JSON.stringify(next.blocks)) changes.push('调整时间块');
  if (JSON.stringify(previous.links) !== JSON.stringify(next.links)) changes.push('修改 SOP / 帖集链接');
  return changes.length ? changes : ['更新规划行'];
}

export function annualPlanIssues(issues: z.core.$ZodIssue[]) {
  const fields: Record<string, string[]> = {};
  for (const issue of issues) {
    const field = String(issue.path?.[0] ?? 'form');
    (fields[field] ??= []).push(issue.message);
  }
  return fields;
}
