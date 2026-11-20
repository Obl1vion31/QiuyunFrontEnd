import test from 'node:test';
import assert from 'node:assert/strict';
import {nonPromotionItemSchema,issuesByField} from '../src/db/stage-review-validation';
import {promotionDailySchema} from '../src/db/promotion-validation';
import {workflowErrorResponse} from '../src/db/workflow-api';
import {validationMessage} from '../src/db/validation-messages';
import {weeklyDeadlineMessage,preplanRequiredMessage,readableOperationError,saveResultUnknownMessage,reviewAvailableMessage} from '../src/db/business-messages';
import {failure} from '../src/integrations/juguang-token';

test('真实非推广与日度校验返回字段名称和中文要求，保留原字段键与错误状态',()=>{
 const parsed=nonPromotionItemSchema.safeParse({scheduleId:'00000000-0000-4000-8000-000000000001',checkpointType:'day_7',recordedThrough:'2026-11-19',threeSecondReadRate:101,exposureCount:'',readCount:-1,conclusion:''});
 assert.equal(parsed.success,false);if(parsed.success)return;
 const fields=issuesByField(parsed.error.issues);
 assert.match(fields.exposureCount.join(''),/曝光量/);assert.match(fields.readCount.join(''),/阅读量/);assert.match(fields.threeSecondReadRate.join(''),/3 秒阅读率/);
 assert.doesNotMatch(JSON.stringify(fields),/Invalid input|Too small|Too big|received NaN|expected number/);
 const daily=promotionDailySchema.safeParse({campaignId:'00000000-0000-4000-8000-000000000001',metricDate:'2026-11-19',dailyStatus:'active',stageTypeSnapshot:'testing',spend:'',platformOpenCount:'',actualOpenCount:0,platformLeadCount:0,actualLeadCount:0,reviewDecision:'test_continue'});
 assert.equal(daily.success,false);if(daily.success)return;
 assert(daily.error.issues.map(validationMessage).some(s=>s.includes('消耗金额')));
 assert(daily.error.issues.map(validationMessage).some(s=>s.includes('平台开口人数')));
});
test('公共接口区分重复记录与更新冲突，不把重复数据描述成需要刷新',async()=>{
 const duplicate=workflowErrorResponse({code:'23505'}),stale=workflowErrorResponse({code:'40001'});
 assert.equal(duplicate.status,409);assert.equal(stale.status,409);
 const a=await duplicate.json(),b=await stale.json();
 assert.match(a.message,/已存在相同记录/);assert.doesNotMatch(a.message,/已被更新|刷新/);
 assert.equal(b.code,'STALE_WRITE');assert.match(b.message,/本次修改尚未保存/);
});
test('期限说明区分三个操作，角色指引不承诺解锁或让管理员联系自己',()=>{
 for(const action of ['arrangements','post','restore'] as const){const s=weeklyDeadlineMessage('2026-11-21',action);assert.match(s,/2026-11-21 05:00/);assert.match(s,/文字|结论和说明/);assert.doesNotMatch(s,/联系管理员|解冻/);}
 assert.match(weeklyDeadlineMessage('2026-11-21','post'),/会后定稿/);
 assert.match(weeklyDeadlineMessage('2026-11-21','restore'),/恢复历史版本/);
 assert.match(preplanRequiredMessage('2026-12','employee'),/联系管理员/);assert.doesNotMatch(preplanRequiredMessage('2026-12','admin'),/联系管理员/);
 for(const role of ['admin','employee'] as const){const s=failure('410016',role);assert.equal(s.status,'reauthorize');assert.doesNotMatch(s.message,/令牌/);assert.equal(s.message.includes('联系管理员'),role==='employee');}
});
test('未知网络或解析异常不冒充保存失败，已确认的部分成功继续明确说明',()=>{
 assert.equal(readableOperationError(new TypeError('Failed to fetch'),saveResultUnknownMessage),saveResultUnknownMessage);
 assert.equal(readableOperationError(new SyntaxError('Unexpected token <'),saveResultUnknownMessage),saveResultUnknownMessage);
 const confirmed='复盘已保存，列表暂时读取不到，请重新读取。';
 assert.equal(readableOperationError(new Error(confirmed),saveResultUnknownMessage),confirmed);
 assert.doesNotMatch(saveResultUnknownMessage,/保存失败|没有保存成功|未提交/);
});
test('复盘开放日期保留标准节点当天和自定义次日规则，跨年仍显示完整日期',()=>{
 assert.match(reviewAvailableMessage('2026-12-31',false),/2026-12-31/);
 assert.match(reviewAvailableMessage('2026-12-31'),/2027-01-01/);
});
