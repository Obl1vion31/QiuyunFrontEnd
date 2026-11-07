import {effectiveCategoryName} from './content-config';
import {sameNonPromotionCohort,rolesForCategory} from './content-roles';
import {nonPromotionGroups} from './non-promotion-groups';
import {nonPromotionFingerprint} from './non-promotion-record';
import {desc,eq,getTableColumns,isNotNull} from 'drizzle-orm';
import {getDb} from './client';
import * as s from './schema';
import {shanghaiDateKey,summarizeRates} from './stage-review-rules.mjs';
import {readCheckpointEvents} from './non-promotion-workflow';
import {readTaxonomy} from './taxonomy-store';
import {anchorReviewPosts,readReviewPlanning} from './non-promotion-plan';
import {reviewNodes,reviewNodeWindow,nextEnabledNode,nodeCanRecord,type ReviewNode} from './non-promotion-nodes';

/** SSR/API共用原帖锚点；旧改版事实只保留历史，不重新计入样本。 */
export async function readNonPromotionReview(url:URL,{includeAllModes=false}={}){
 const db=getDb(),{subjects,subjectCategories,postCategories,subjectCategoryMappings}=await readTaxonomy(db),today=shanghaiDateKey(new Date());
 const load=async()=>{
  const [schedules,metrics,reviews,checkpointEvents,planning]=await Promise.all([
   db.select({id:s.operationsContentSchedule.id,finalReviewOn:s.operationsContentSchedule.finalReviewOn,contentId:s.operationsContent.id,platformNoteId:s.operationsContent.platformNoteId,plannedPublishAt:s.operationsContentSchedule.plannedPublishAt,actualPublishAt:s.operationsContentSchedule.actualPublishAt,isPromoted:s.operationsContentSchedule.isPromoted,operationType:s.operationsContent.operationType,contentRole:s.operationsContent.contentRole,publicationUrl:s.operationsContentSchedule.publicationUrl,contentName:s.operationsContentVersion.contentName,projectDocUrl:s.operationsContentVersion.projectDocUrl,versionNumber:s.operationsContentVersion.versionNumber,subjectId:s.operationsContentVersion.subjectId,subjectName:s.operationsSubject.name,categoryId:s.operationsContentVersion.categoryId,categoryName:effectiveCategoryName(s.operationsContentVersion.subjectId,s.operationsContentVersion.categoryId,s.operationsCategory.name)}).from(s.operationsContentSchedule).innerJoin(s.operationsContentVersion,eq(s.operationsContentSchedule.contentVersionId,s.operationsContentVersion.id)).innerJoin(s.operationsContent,eq(s.operationsContentVersion.contentId,s.operationsContent.id)).innerJoin(s.operationsSubject,eq(s.operationsContentVersion.subjectId,s.operationsSubject.id)).leftJoin(s.operationsCategory,eq(s.operationsContentVersion.categoryId,s.operationsCategory.id)).where(isNotNull(s.operationsContentSchedule.actualPublishAt)).orderBy(desc(s.operationsContentSchedule.actualPublishAt)),
   db.select({...getTableColumns(s.operationsContentPerformanceMetric),subjectId:s.operationsContentVersion.subjectId,categoryId:s.operationsContentVersion.categoryId,contentRole:s.operationsContent.contentRole}).from(s.operationsContentPerformanceMetric).innerJoin(s.operationsContentSchedule,eq(s.operationsContentPerformanceMetric.scheduleId,s.operationsContentSchedule.id)).innerJoin(s.operationsContentVersion,eq(s.operationsContentSchedule.contentVersionId,s.operationsContentVersion.id)).innerJoin(s.operationsContent,eq(s.operationsContentVersion.contentId,s.operationsContent.id)),
   db.select().from(s.operationsNonPromotionReview).orderBy(desc(s.operationsNonPromotionReview.reviewedAt)),readCheckpointEvents(db),readReviewPlanning(db),
  ]);return {schedules,metrics,reviews,checkpointEvents,...planning};
 };
 let loadError='',data:Awaited<ReturnType<typeof load>>;
 try{data=await load();}catch(error){console.error('non-promotion review query failed',error);loadError='非推广复盘数据暂时不可用，请重试。';data={schedules:[],metrics:[],reviews:[],checkpointEvents:new Map(),plans:[],custom:[],context:{campaigns:[],pauses:[],targets:[],holds:[],waitRanges:[],metrics:[],stateChanges:[],meetingDecisions:[]}};}
 const {schedules,metrics,reviews,checkpointEvents,plans,custom,context}=data;
 const reviewMap=new Map(reviews.map(r=>[`${r.scheduleId}:${r.checkpointType}`,r])),metricMap=new Map(metrics.map(r=>[`${r.scheduleId}:${r.checkpointType}`,r]));
 const selectedSubject=subjects.some(s=>s.id===url.searchParams.get('subject'))?url.searchParams.get('subject')!:'',categoryOptions=selectedSubject?subjectCategories.filter(c=>c.subjectId===selectedSubject):[];
 const selectedCategory=categoryOptions.some(c=>c.id===url.searchParams.get('category'))?url.searchParams.get('category')!:'';
 const roleOptions=rolesForCategory(selectedCategory),selectedRole=roleOptions.includes(url.searchParams.get('role') as typeof roleOptions[number])?url.searchParams.get('role')!:'';
 const anchors=anchorReviewPosts(schedules,plans,context),anchorIds=new Set(anchors.map(p=>p.id));
 const cohortAnchorIds=new Set(anchors.filter(p=>p.standardCohortEligible).map(p=>p.id));
 const matches=(p:typeof schedules[number])=>(!selectedSubject||p.subjectId===selectedSubject)&&(!selectedCategory||p.categoryId===selectedCategory)&&(!selectedRole||p.contentRole===selectedRole);
 const buildRow=(post:typeof anchors[number],legacy=false)=>{
  const enabled=reviewNodes(post.actualPublishAt,post.enabledPlan,custom.filter(c=>c.contentId===post.contentId&&(post.operationType!=='promotion_then_continuous'||c.scheduleId===post.id))).filter(n=>!post.activatedOn||n.dueOn>=post.activatedOn);
  const all=reviewNodes(post.actualPublishAt,undefined,custom.filter(c=>c.scheduleId===post.id).map(c=>reviewMap.has(`${post.id}:custom:${c.id}`)?{...c,cancelledAt:null}:c));
  const checkpoints=[...enabled,...all.filter(n=>!enabled.some(e=>e.type===n.type)&&(reviewMap.has(`${post.id}:${n.type}`)||checkpointEvents.get(`${post.id}:${n.type}`)?.action==='skip'))];
  const completed=checkpoints.filter(n=>reviewMap.has(`${post.id}:${n.type}`)).map(n=>n.type),skipped=checkpoints.filter(n=>checkpointEvents.get(`${post.id}:${n.type}`)?.action==='skip').map(n=>n.type);
  const resolved=[...completed,...skipped],available=legacy?[]:enabled.filter(n=>!resolved.includes(n.type)&&nodeCanRecord(enabled,n,resolved,today));
  return {...post,legacy,completed,skipped,checkpoints,available,next:nextEnabledNode(enabled,resolved,today)};
 };
 const rows=anchors.filter(p=>p.reviewActive&&matches(p)).map(p=>buildRow(p));
 const legacy=schedules.filter(p=>(!anchorIds.has(p.id)||anchors.some(a=>a.id===p.id&&!a.reviewActive))&&p.actualPublishAt&&matches(p)&&reviews.some(r=>r.scheduleId===p.id)).map(p=>buildRow({...p,actualPublishAt:p.actualPublishAt!,standardCohortEligible:false,reviewActive:false,activatedOn:null,statisticsFrom:null,latestScheduleId:p.id,mode:p.operationType==='promotion_then_continuous'?'continuous' as const:'standard' as const,plan:undefined,enabledPlan:{mode:p.operationType==='promotion_then_continuous'?'continuous' as const:'standard' as const,day7:p.operationType!=='promotion_then_continuous',day15:p.operationType!=='promotion_then_continuous'}},true));
 const pending=rows.flatMap(row=>row.available.map(checkpoint=>({row,checkpoint})));
 const activeView=['history','skipped'].includes(url.searchParams.get('view')??'')?url.searchParams.get('view')!:'pending',selectedRound='';
 const names:Record<string,string>={day_7:'7 天',day_15:'15 天'};
 for(const node of custom)names['custom:'+node.id]='自定义';
 const allItems=[...rows,...legacy].flatMap(row=>{
  return row.checkpoints.map((checkpoint:ReviewNode)=>{
   const key=`${row.id}:${checkpoint.type}`,metric=metricMap.get(key),window=reviewNodeWindow(row.actualPublishAt,checkpoint,today);
   const peers=checkpoint.kind==='custom'?[]:metrics.filter(m=>cohortAnchorIds.has(m.scheduleId)&&m.checkpointType===checkpoint.type&&sameNonPromotionCohort(m,row)&&checkpointEvents.get(`${m.scheduleId}:${m.checkpointType}`)?.action!=='skip');
   const storedMetric=metric&&Object.fromEntries(Object.entries(metric).filter(([name])=>!['subjectId','categoryId','contentRole'].includes(name)));
   return {key,row,checkpoint,window,cohortEligible:cohortAnchorIds.has(row.id)&&checkpoint.kind==='standard'&&!!reviewMap.get(key)&&checkpointEvents.get(key)?.action!=='skip',historical:row.legacy||row.operationType==='promotion_then_continuous'&&!!metric&&metric.statisticsFrom!==row.statisticsFrom||!!row.activatedOn&&checkpoint.dueOn<row.activatedOn||checkpoint.type==='day_7'&&!row.enabledPlan.day7||checkpoint.type==='day_15'&&!row.enabledPlan.day15||!!metric&&(metric.recordedThrough<window.min||metric.recordedThrough>window.max),fingerprint:nonPromotionFingerprint(storedMetric,reviewMap.get(key),checkpointEvents.get(key)),dueOn:checkpoint.dueOn,metric,review:reviewMap.get(key),event:checkpointEvents.get(key),click:summarizeRates(peers.flatMap(m=>m.clickRate==null?[]:[Number(m.clickRate)])),read:summarizeRates(peers.flatMap(m=>m.threeSecondReadRate==null?[]:[Number(m.threeSecondReadRate)]))};
  });
 });
 const linked=allItems.find(item=>item.key===url.searchParams.get('row'));
 const requestedMode=url.searchParams.get('mode');
 const mode=requestedMode==='instant'||requestedMode==='continuous'||requestedMode==='standard'?requestedMode:linked?.row.mode??'standard';
 const grouped=activeView==='history'&&mode==='standard'&&url.searchParams.get('group')!=='0';
 const viewHref=(view:string,key?:string)=>{const q=new URLSearchParams({view,mode});if(selectedSubject)q.set('subject',selectedSubject);if(selectedCategory)q.set('category',selectedCategory);if(selectedRole)q.set('role',selectedRole);if(view==='history')q.set('group',url.searchParams.get('group')==='0'?'0':'1');if(key)q.set('row',key);return '?'+q;};
 // 分类基准跨复盘方式共享，明细与均值使用完全相同的入样条件。
 const standardHistory=allItems.filter(item=>item.cohortEligible);
 const order=(key:string)=>{const [subject,category]=key.split(':');return subjectCategories.findIndex(c=>c.subjectId===subject&&c.id===category);};
 const categoryGroups=nonPromotionGroups(standardHistory).sort((a,b)=>order(a.key)-order(b.key));
 const visible=allItems.filter(item=>activeView==='history'?!!item.review:!item.row.legacy&&(activeView==='skipped'?item.row.skipped.includes(item.checkpoint.type):item.row.available.some(n=>n.type===item.checkpoint.type)));
 const tableRows=(grouped&&!includeAllModes?standardHistory:visible.filter(item=>includeAllModes||item.row.mode===mode)).sort((a,b)=>activeView==='pending'?a.dueOn.localeCompare(b.dueOn)||a.key.localeCompare(b.key):b.dueOn.localeCompare(a.dueOn)||a.key.localeCompare(b.key));
 const selectedGroup=categoryGroups.some(g=>g.key===url.searchParams.get('bucket'))?url.searchParams.get('bucket')!:null,selected=tableRows.find(r=>r.key===url.searchParams.get('row')),baseHref=viewHref(activeView);
 const awaitingDates=rows.filter(p=>p.mode==='continuous'&&(includeAllModes||mode==='continuous')&&(p.finalReviewOn?!!p.statisticsFrom&&p.finalReviewOn<p.statisticsFrom:!p.checkpoints.some(n=>!p.completed.includes(n.type)&&!p.skipped.includes(n.type))));
 const upcoming=rows.filter(row=>row.mode===mode).flatMap(row=>row.checkpoints.filter(node=>!row.completed.includes(node.type)&&!row.skipped.includes(node.type)&&!row.available.some(n=>n.type===node.type)).map(node=>({row,node}))).sort((a,b)=>a.node.dueOn.localeCompare(b.node.dueOn));
 return {roleOptions,selectedRole,mode,sampleRows:standardHistory,upcoming,awaitingDates,checkpointEvents,today,names,loadError,schedules,metrics,reviews,selectedSubject,categoryOptions,selectedCategory,rows,pending,activeView,selectedRound,grouped,viewHref,tableRows,selected,baseHref,categoryGroups,selectedGroup,subjects};
}
