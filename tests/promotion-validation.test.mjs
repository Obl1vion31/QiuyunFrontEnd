import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const validationSource = await readFile(
  new URL('../src/db/promotion-validation.ts', import.meta.url),
  'utf8',
);

test('does not derive the update schema from a refined daily schema', () => {
  assert.doesNotMatch(validationSource, /promotionDailySchema\.(?:omit|pick|extend|safeExtend)\s*\(/);
  assert.match(validationSource, /promotionDailyUpdateSchema\s*=\s*z\.object\s*\(/);
  assert.doesNotMatch(validationSource, /等待行动日的全部数据必须为 0|validateWaitingAction/);
});
