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
export async function readNonPromotionReview(url:URL){
 const db=getDb(),{subjects,postCategories,subjectCategoryMappings}=await readTaxonomy(db),today=shanghaiDateKey(new Date());
 const load=async()=>{
  const [schedules,metrics,reviews,checkpointEvents,planning]=await Promise.all([
   db.select({id:s.operationsContentSchedule.id,contentId:s.operationsContent.id,platformNoteId:s.operationsContent.platformNoteId,plannedPublishAt:s.operationsContentSchedule.plannedPublishAt,actualPublishAt:s.operationsContentSchedule.actualPublishAt,isPromoted:s.operationsContentSchedule.isPromoted,operationType:s.operationsContent.operationType,publicationUrl:s.operationsContentSchedule.publicationUrl,contentName:s.operationsContentVersion.contentName,projectDocUrl:s.operationsContentVersion.projectDocUrl,versionNumber:s.operationsContentVersion.versionNumber,subjectId:s.operationsContentVersion.subjectId,subjectName:s.operationsSubject.name,categoryId:s.operationsContentVersion.categoryId,categoryName:s.operationsCategory.name}).from(s.operationsContentSchedule).innerJoin(s.operationsContentVersion,eq(s.operationsContentSchedule.contentVersionId,s.operationsContentVersion.id)).innerJoin(s.operationsContent,eq(s.operationsContentVersion.contentId,s.operationsContent.id)).innerJoin(s.operationsSubject,eq(s.operationsContentVersion.subjectId,s.operationsSubject.id)).leftJoin(s.operationsCategory,eq(s.operationsContentVersion.categoryId,s.operationsCategory.id)).where(isNotNull(s.operationsContentSchedule.actualPublishAt)).orderBy(desc(s.operationsContentSchedule.actualPublishAt)),
   db.select({...getTableColumns(s.operationsContentPerformanceMetric),subjectId:s.operationsContentVersion.subjectId,categoryId:s.operationsContentVersion.categoryId}).from(s.operationsContentPerformanceMetric).innerJoin(s.operationsContentSchedule,eq(s.operationsContentPerformanceMetric.scheduleId,s.operationsContentSchedule.id)).innerJoin(s.operationsContentVersion,eq(s.operationsContentSchedule.contentVersionId,s.operationsContentVersion.id)),
   db.select().from(s.operationsNonPromotionReview).orderBy(desc(s.operationsNonPromotionReview.reviewedAt)),readCheckpointEvents(db),readReviewPlanning(db),
  ]);return {schedules,metrics,reviews,checkpointEvents,...planning};
 };
 let loadError='',data:Awaited<ReturnType<typeof load>>;
 try{data=await load();}catch(error){console.error('non-promotion review query failed',error);loadError='非推广复盘数据暂时不可用，请重试。';data={schedules:[],metrics:[],reviews:[],checkpointEvents:new Map(),plans:[],custom:[],context:{campaigns:[],pauses:[],targets:[],holds:[],waitRanges:[],metrics:[],stateChanges:[],meetingDecisions:[]}};}
 const {schedules,metrics,reviews,checkpointEvents,plans,custom,context}=data;
 const reviewMap=new Map(reviews.map(r=>[`${r.scheduleId}:${r.checkpointType}`,r])),metricMap=new Map(metrics.map(r=>[`${r.scheduleId}:${r.checkpointType}`,r]));
 const selectedSubject=subjects.some(s=>s.id===url.searchParams.get('subject'))?url.searchParams.get('subject')!:'',categoryOptions=selectedSubject?postCategories.filter(c=>subjectCategoryMappings.some(m=>m.subjectId===selectedSubject&&m.categoryId===c.id)):[];
 const selectedCategory=categoryOptions.some(c=>c.id===url.searchParams.get('category'))?url.searchParams.get('category')!:'';
 const anchors=anchorReviewPosts(schedules,plans,context),anchorIds=new Set(anchors.map(p=>p.id));
 const matches=(p:typeof schedules[number])=>(!selectedSubject||p.subjectId===selectedSubject)&&(!selectedCategory||p.categoryId===selectedCategory);
 const buildRow=(post:typeof anchors[number],legacy=false)=>{
  const enabled=reviewNodes(post.actualPublishAt,post.enabledPlan,custom.filter(c=>c.contentId===post.contentId)).filter(n=>!post.activatedOn||n.dueOn>=post.activatedOn);
  const all=reviewNodes(post.actualPublishAt,undefined,custom.filter(c=>c.scheduleId===post.id));
  const checkpoints=[...enabled,...all.filter(n=>!enabled.some(e=>e.type===n.type)&&(reviewMap.has(`${post.id}:${n.type}`)||checkpointEvents.get(`${post.id}:${n.type}`)?.action==='skip'))];
  const completed=checkpoints.filter(n=>reviewMap.has(`${post.id}:${n.type}`)).map(n=>n.type),skipped=checkpoints.filter(n=>checkpointEvents.get(`${post.id}:${n.type}`)?.action==='skip').map(n=>n.type);
  const resolved=[...completed,...skipped],available=legacy?[]:enabled.filter(n=>!resolved.includes(n.type)&&nodeCanRecord(enabled,n,resolved,today));
  return {...post,legacy,completed,skipped,checkpoints,available,next:nextEnabledNode(enabled,resolved,today)};
 };
 const rows=anchors.filter(p=>p.reviewActive&&matches(p)).map(p=>buildRow(p));
 const legacy=schedules.filter(p=>(!anchorIds.has(p.id)||anchors.some(a=>a.id===p.id&&!a.reviewActive))&&p.actualPublishAt&&matches(p)&&reviews.some(r=>r.scheduleId===p.id)).map(p=>buildRow({...p,actualPublishAt:p.actualPublishAt!,reviewActive:false,activatedOn:null,latestScheduleId:p.id,mode:'standard' as const,plan:undefined,enabledPlan:{mode:'standard' as const,day7:true,day15:true}},true));
 const pending=rows.flatMap(row=>row.available.map(checkpoint=>({row,checkpoint})));
 const activeView=['history','skipped'].includes(url.searchParams.get('view')??'')?url.searchParams.get('view')!:'pending',selectedRound='',grouped=activeView==='history'&&url.searchParams.get('group')!=='0';
 const viewHref=(view:string,key?:string)=>{const q=new URLSearchParams({view});if(selectedSubject)q.set('subject',selectedSubject);if(selectedCategory)q.set('category',selectedCategory);if(view==='history')q.set('group',grouped?'1':'0');if(key)q.set('row',key);return '?'+q;};
 const names:Record<string,string>={day_7:'7 天',day_15:'15 天'};
 for(const node of custom)names['custom:'+node.id]='自定义';
 const tableRows=[...rows,...(activeView==='history'?legacy:[])].flatMap(row=>{
  const visible=activeView==='pending'?row.available:row.checkpoints.filter(n=>(activeView==='history'?row.completed:row.skipped).includes(n.type));
  return visible.map((checkpoint:ReviewNode)=>{
   const key=`${row.id}:${checkpoint.type}`,metric=metricMap.get(key),window=reviewNodeWindow(row.actualPublishAt,checkpoint,today);
   const peers=checkpoint.kind==='custom'?[]:metrics.filter(m=>anchors.some(p=>p.id===m.scheduleId&&p.reviewActive)&&m.checkpointType===checkpoint.type&&m.subjectId===row.subjectId&&m.categoryId===row.categoryId&&checkpointEvents.get(`${m.scheduleId}:${m.checkpointType}`)?.action!=='skip');
   const storedMetric=metric&&Object.fromEntries(Object.entries(metric).filter(([name])=>!['subjectId','categoryId'].includes(name)));
   return {key,row,checkpoint,window,historical:row.legacy||!!row.activatedOn&&checkpoint.dueOn<row.activatedOn||checkpoint.type==='day_7'&&!row.enabledPlan.day7||checkpoint.type==='day_15'&&!row.enabledPlan.day15||!!metric&&(metric.recordedThrough<window.min||metric.recordedThrough>window.max),fingerprint:nonPromotionFingerprint(storedMetric,reviewMap.get(key),checkpointEvents.get(key)),dueOn:checkpoint.dueOn,metric,review:reviewMap.get(key),event:checkpointEvents.get(key),click:summarizeRates(peers.flatMap(m=>m.clickRate==null?[]:[Number(m.clickRate)])),read:summarizeRates(peers.flatMap(m=>m.threeSecondReadRate==null?[]:[Number(m.threeSecondReadRate)]))};
  });
 });
 const categoryGroups=nonPromotionGroups(tableRows.filter(r=>!r.row.legacy&&r.checkpoint.kind==='standard'));
 // 自定义仍可在分类内查看，但不纳入7/15天样本。
 for(const item of tableRows)if(!categoryGroups.some(g=>g.key===`${item.row.subjectId}:${item.row.categoryId??'temporary'}`))categoryGroups.push({key:`${item.row.subjectId}:${item.row.categoryId??'temporary'}`,label:item.row.subjectName+' · '+(item.row.categoryName??'临时帖'),rounds:[]});
 const selectedGroup=categoryGroups.some(g=>g.key===url.searchParams.get('bucket'))?url.searchParams.get('bucket')!:null,selected=tableRows.find(r=>r.key===url.searchParams.get('row')),baseHref=viewHref(activeView);
 const awaitingDates=rows.filter(p=>p.mode==='continuous'&&!p.checkpoints.some(n=>!p.completed.includes(n.type)&&!p.skipped.includes(n.type)));
 return {awaitingDates,checkpointEvents,today,names,loadError,schedules,metrics,reviews,selectedSubject,categoryOptions,selectedCategory,rows,pending,activeView,selectedRound,grouped,viewHref,tableRows,selected,baseHref,categoryGroups,selectedGroup,subjects};
}
