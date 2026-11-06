import {test} from 'node:test';
import assert from 'node:assert/strict';
import {defaultOperationType} from '../src/db/operation-types';
test('推广讲义与模考默认推广后持续，课程纯推广，其余常规非推广',()=>{
 for(const category of ['mock-exam','promotional-handout'])assert.equal(defaultOperationType(category),'promotion_then_continuous');
 for(const category of ['interview-course','small-class-or-tutoring','large-class','intensive-course'])assert.equal(defaultOperationType(category),'promotion_only');
 for(const category of ['non-promotional-handout','success-story','innovation','exam-information','first-analysis-series','temporary',''])assert.equal(defaultOperationType(category),'non_promotion_standard');
});
