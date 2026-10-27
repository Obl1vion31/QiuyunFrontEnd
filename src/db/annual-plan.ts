import { z } from 'zod';
import { isDeepStrictEqual } from 'node:util';
import { overlappingBlockPairs } from './annual-plan-rules.mjs';
import { normalizeSnapshot } from './annual-plan-rules.mjs';
import type { AnnualPlanSnapshot, AnnualPlanSnapshotV4 } from './schema';

const optionalText = (maximum: number) => z.preprocess(
  (value) => typeof value === 'string' && value.trim() === '' ? null : value,
  z.string().trim().max(maximum).nullable(),
);
const httpUrl = z.url('请输入有效的 HTTP/HTTPS 链接')
  .refine((url) => /^https?:\/\//.test(url), '仅支持 HTTP/HTTPS 链接');
const rangeSchema = z.object({ startSlot: z.int().min(1).max(24), endSlot: z.int().min(1).max(24) })
  .refine(range => range.endSlot >= range.startSlot, { path: ['endSlot'], message: '结束时间不能早于开始时间' });
const blockSchema = z.object({
  startSlot: z.int().min(1).max(24),
  endSlot: z.int().min(1).max(24),
  label: z.string().trim().max(200).default(''),
  note: z.string().trim().max(500).default(''),
  promotionRanges: z.array(rangeSchema).max(24),
  sortOrder: z.int().min(0).max(9999),
}).superRefine((block, context) => {
  if (block.endSlot < block.startSlot) context.addIssue({ code: 'custom', path: ['endSlot'], message: '结束时间不能早于开始时间' });
  for (const range of block.promotionRanges) {
    if (range.startSlot < block.startSlot || range.endSlot > block.endSlot) context.addIssue({ code: 'custom', path: ['promotionRanges'], message: '推广区间必须位于本周期内' });
  }
  if (overlappingBlockPairs(block.promotionRanges).length) context.addIssue({ code: 'custom', path: ['promotionRanges'], message: '推广区间不能重叠' });
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
  // 已合并分类的旧稿/历史恢复使用现有字典；不回写旧版本JSON。
  categoryId: z.string().trim().min(1).transform(value => value === 'interview-non-promotional-handout' ? 'non-promotional-handout' : value).nullable(),
  note: optionalText(1000),
  sortOrder: z.int().min(0).max(9999),
  isActive: z.boolean(),
  blocks: z.array(blockSchema).max(24),
  links: z.array(linkSchema).max(30),
  changeSummary: z.string().trim().max(500).default(''),
};
const withRowRules = <T extends z.ZodRawShape>(shape: T) => z.object(shape).superRefine((data, context) => {
  const row = data as {
    subjectId?: string | null;
    categoryId?: string | null;
    blocks?: Array<{ startSlot: number; endSlot: number }>;
  };
  if (row.categoryId && !row.subjectId) {
    context.addIssue({ code: 'custom', path: ['categoryId'], message: '关联帖子分类前必须选择学科分区' });
  }
  const overlaps = overlappingBlockPairs(row.blocks ?? []);
  for (const [left, right] of overlaps) {
    context.addIssue({
      code: 'custom',
      path: ['blocks'],
      message: `第 ${left + 1} 和第 ${right + 1} 个时间块时间重叠`,
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
    countsTowardPromotion: input.blocks.some(block => block.promotionRanges.length > 0),
    blocks: [...input.blocks]
      .sort((left, right) => left.startSlot - right.startSlot || left.sortOrder - right.sortOrder)
      .map((block, index) => ({
        ...block,
        label: block.label || input.rowName,
        promotionRanges: [...block.promotionRanges].sort((a, b) => a.startSlot - b.startSlot),
        sortOrder: index * 10,
      })),
    links: [...input.links]
      .sort((left, right) => left.sortOrder - right.sortOrder)
      .map((link) => ({ ...link })),
  };
}

export function buildAnnualPlanSnapshot(
  input: AnnualPlanInput,
  names: { subjectName: string | null; categoryName: string | null },
): AnnualPlanSnapshotV4 {
  const normalized = normalizedPlanInput(input);
  return {
    schemaVersion: 4,
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
  return isDeepStrictEqual(normalizeSnapshot(left), normalizeSnapshot(right));
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
  ];
  for (const [field, label] of fields) {
    if (JSON.stringify(previous.row[field]) !== JSON.stringify(next.row[field])) changes.push(`修改${label}`);
  }
  if (!isDeepStrictEqual(normalizeSnapshot(previous).blocks, normalizeSnapshot(next).blocks)) changes.push('调整时间块');
  if (!isDeepStrictEqual(previous.links, next.links)) changes.push('修改 SOP / 帖集链接');
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

export const copyAnnualPlanSchema = z.object({ targetYear: z.int().min(2000).max(9999) });

/** 保留旧月份字段供兼容部署读取；数量规则不再参与新数据写入。 */
export function annualPlanBlockValues(planId: string, block: AnnualPlanSnapshotV4['blocks'][number]) {
  return {
    planId, ...block,
    startMonth: Math.ceil(block.startSlot / 2),
    endMonth: Math.ceil(block.endSlot / 2),
    ruleType: null, monthlyFrequency: null, quantityParts: null,
  };
}
