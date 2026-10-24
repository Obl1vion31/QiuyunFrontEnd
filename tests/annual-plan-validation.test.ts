import assert from 'node:assert/strict';
import test from 'node:test';
import { createAnnualPlanSchema, buildAnnualPlanSnapshot, snapshotsEqual } from '../src/db/annual-plan';
const row = { year: 2026, sectionKey: 'subject:tmua', sectionLabel: 'TMUA 细致规划', subjectId: 'tmua', rowName: '虚构规划', categoryId: null, note: null, sortOrder: 0, isActive: true, blocks: [] as unknown[], links: [] };
const block = { startSlot: 5, endSlot: 17, promotionRanges: [{ startSlot: 5, endSlot: 6 }], note: '测试积累，仅测试 1000 预算', sortOrder: 0 };
test('新建不要求数量、分类、时间块及手填变更说明', () => {
  assert.ok(createAnnualPlanSchema.safeParse(row).success);
  const parsed = createAnnualPlanSchema.parse({ ...row, blocks: [block] });
  const snapshot = buildAnnualPlanSnapshot(parsed, { subjectName: 'TMUA', categoryName: null });
  assert.equal(snapshot.schemaVersion, 4); assert.equal(snapshot.blocks[0].note, block.note);
  assert.deepEqual(snapshot.blocks[0].promotionRanges, block.promotionRanges);
});
test('拒绝倒置、越界、相交周期和越出周期的推广范围', () => {
  for (const blocks of [
    [{ ...block, endSlot: 4 }], [{ ...block, startSlot: 0 }], [{ ...block, endSlot: 25 }],
    [block, { ...block, startSlot: 17, endSlot: 23 }],
    [{ ...block, promotionRanges: [{ startSlot: 4, endSlot: 6 }] }],
    [{ ...block, promotionRanges: [{ startSlot: 5, endSlot: 8 }, { startSlot: 8, endSlot: 9 }] }],
    [{ ...block, promotionRanges: [{ startSlot: 8, endSlot: 7 }] }],
  ]) assert.equal(createAnnualPlanSchema.safeParse({ ...row, blocks }).success, false);
});
test('首月策略不锁死用户，自定义多个付费区间可保存', () => {
  assert.ok(createAnnualPlanSchema.safeParse({ ...row, blocks: [{ ...block, promotionRanges: [{ startSlot: 5, endSlot: 6 }, { startSlot: 10, endSlot: 12 }] }] }).success);
});
test('旧客户端月份载荷不能静默覆盖新的半月和推广数据', () => {
  assert.equal(createAnnualPlanSchema.safeParse({ ...row, blocks: [{ startMonth: 3, endMonth: 9, label: '', ruleType: null, sortOrder: 0, note: '' }] }).success, false);
});

test('JSONB 重排对象键后，相同内容仍判为未修改', () => {
  const snapshot = buildAnnualPlanSnapshot(createAnnualPlanSchema.parse({ ...row, blocks: [block] }), { subjectName: 'TMUA', categoryName: null });
  const reverseKeys = (value: any): any => Array.isArray(value) ? value.map(reverseKeys) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).reverse().map(key => [key, reverseKeys(value[key])])) : value;
  assert.equal(snapshotsEqual(snapshot, reverseKeys(snapshot)), true);
});
