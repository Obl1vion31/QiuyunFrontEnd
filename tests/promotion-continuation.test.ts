import assert from 'node:assert/strict';
import {test} from 'node:test';
import {anchorReviewPosts} from '../src/db/non-promotion-plan';
import {promotionContinuations} from '../src/db/promotion-continuation';
const now=new Date('2026-11-20T12:00:00+08:00'),today='2026-11-20';
const version={id:'s',contentId:'post',versionNumber:0,actualPublishAt:new Date('2026-10-31T10:00:00+08:00'),isPromoted:true,operationType:'promotion_then_continuous' as const,finalReviewOn:'2026-11-30'};
const campaign={id:'c',scheduleId:'s',startedOn:'2026-11-01',createdAt:now,initialStage:'scaling',currentStage:null,currentStatus:'ended',endedOn:'2026-11-10'};
const context={campaigns:[campaign],metrics:[],stateChanges:[],meetingDecisions:[],pauses:[],targets:[],holds:[],waitRanges:[]} as unknown as NonNullable<Parameters<typeof anchorReviewPosts>[2]>;
const nodes=['2026-11-17','2026-11-24','2026-11-30'].map((dueOn,i)=>({id:'n'+i,scheduleId:'s',dueOn,cancelledAt:null}));
const identities=()=>anchorReviewPosts([version],[],context,today,now);
test('正常结束后的当前版本接入持续阶段，真实日期和T+1状态来自原节点',()=>{
 const metric={id:'m',scheduleId:'s',checkpointType:'custom:n0',statisticsFrom:'2026-11-11',recordedThrough:'2026-11-17'};
 const review={metricId:'m',scheduleId:'s',checkpointType:'custom:n0'};
 const result=promotionContinuations(identities(),nodes,[metric],[review],[],today).get('s')!;
 assert.equal(result.start,'2026-11-11');assert.deepEqual(result.checkpoints.map(n=>n.label),['已复盘','未到期','未到期']);assert.equal(result.next!.dueOn,'2026-11-24');assert.equal(result.completed,false);assert.match(result.checkpoints[0].href,/view=history/);assert.match(result.checkpoints[1].href,/view=pending/);
 const due=promotionContinuations(identities(),nodes,[],[],[],'2026-11-17').get('s')!;assert.equal(due.checkpoints[0].state,'upcoming');assert.equal(promotionContinuations(identities(),nodes,[],[],[],'2026-11-18').get('s')!.checkpoints[0].state,'due');
});
test('跳过／恢复按最后事件，已录优先，旧口径只读，不冒充新的待填',()=>{
 const events=[{scheduleId:'s',checkpointType:'custom:n0',action:'skip' as const},{scheduleId:'s',checkpointType:'custom:n0',action:'restore' as const}];
 assert.equal(promotionContinuations(identities(),nodes,[],[],events,today).get('s')!.checkpoints[0].state,'due');
 assert.equal(promotionContinuations(identities(),nodes,[],[],events.slice(0,1),today).get('s')!.checkpoints[0].state,'skipped');
 const legacy={id:'m',scheduleId:'s',checkpointType:'custom:n0',recordedThrough:'2026-11-17',statisticsFrom:null},review={scheduleId:'s',checkpointType:'custom:n0',metricId:'m'};
 assert.equal(promotionContinuations(identities(),nodes,[legacy],[review],events,today).get('s')!.checkpoints[0].state,'historical');
});
test('已取消与起点前节点不显示；没有日期显示待安排，完成后显示完成',()=>{
 const extra=[...nodes,{id:'cancelled',scheduleId:'s',dueOn:'2026-11-20',cancelledAt:now},{id:'prior',scheduleId:'s',dueOn:'2026-11-10',cancelledAt:null}];
 assert.equal(promotionContinuations(identities(),extra,[],[],[],today).get('s')!.checkpoints.length,3);
 assert.equal(promotionContinuations(identities(),[],[],[],[],today).get('s')!.detail,'待安排复盘日期');
 const skipped=nodes.map(n=>({scheduleId:'s',checkpointType:'custom:'+n.id,action:'skip' as const}));assert.equal(promotionContinuations(identities(),nodes,[],[],skipped,today).get('s')!.label,'持续复盘已完成');
});
test('淘汰、暂停、待定、纯推广不接入持续阶段，也不制造任何节点',()=>{
 for(const status of ['test_discarded','formal_discarded','testing','test_pending','test_paused','scaling_paused']){
  const scoped={...context,campaigns:[{...context.campaigns[0],currentStatus:status,...(!['test_discarded','formal_discarded'].includes(status)?{endedOn:null,initialStage:status.startsWith('test')?'testing':'scaling'}:{})}]};
  assert.equal(promotionContinuations(anchorReviewPosts([version],[],scoped,today,now),nodes,[],[],[],today).size,0,status);
 }
 assert.equal(promotionContinuations(anchorReviewPosts([{...version,operationType:'promotion_only'}],[],context,today,now),nodes,[],[],[],today).size,0);
 const before=JSON.stringify([nodes,context]);promotionContinuations(identities(),nodes,[],[],[],today);assert.equal(JSON.stringify([nodes,context]),before);
});
test('新版实发前旧版继续显示，实际生效后旧版退出；统计起点不改写',()=>{
 const draft={...version,id:'v1',versionNumber:1,actualPublishAt:null},future={...draft,actualPublishAt:new Date('2026-11-21T10:00:00+08:00')},published={...future,actualPublishAt:new Date('2026-11-19T10:00:00+08:00')};
 for(const next of [draft,future])assert(promotionContinuations(anchorReviewPosts([version,next],[],context,today,now),nodes,[],[],[],today).has('s'));
 assert.equal(promotionContinuations(anchorReviewPosts([version,published],[],context,today,now),nodes,[],[],[],today).size,0);
});
