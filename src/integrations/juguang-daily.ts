import {createHmac,timingSafeEqual} from 'node:crypto';
import {and,eq,gte,inArray,isNull,lte,or} from 'drizzle-orm';
import {z} from 'zod';
import {getDb,type Database} from '../db/client';
import * as s from '../db/schema';
import {readVersionNotes} from '../db/note-identities';
import {noteIdOn} from '../db/note-identity-rules';
import {WorkflowError,type Transaction} from '../db/schedule-workflow';
import {decryptJuguangTokens,hasJuguangReportScope,juguangConfig,withJuguangLock,JuguangError} from './xiaohongshu-juguang';
import {upstream,UpstreamFailure,failure,refreshJuguangConnection} from './juguang-token';
import {JUGUANG_NOTE_REPORT} from './juguang-check';
import {isJuguangMetricDate,juguangTargetKey,juguangMetricFields,promotionClickRate,type JuguangMetricSource,type JuguangMetricValues} from './juguang-metric-types';

const numeric=z.union([z.number(),z.string().regex(/^\d+(\.\d+)?$/)]).transform(Number);
const count=numeric.pipe(z.number().int().min(0).max(2147483647));
const amount=numeric.pipe(z.number().min(0).max(9999999999.99));
const reportRow=z.object({time:z.iso.date(),note_id:z.string().regex(/^[a-f0-9]{24}$/i),fee:amount,impression:count,click:count,initiative_message:count,msg_leads_num:count});
const report=z.object({data:z.object({total_count:count,data_list:z.array(reportRow)})});
const sourceSchema=z.object({kind:z.literal('juguang_offline_note'),fetchedAt:z.iso.datetime(),noteId:z.string(),mappingFingerprint:z.string(),advertiserIds:z.array(z.number().int().positive()),original:z.object({spend:amount,platformOpenCount:count,platformLeadCount:count,impressionCount:count,clickCount:count}),overriddenFields:z.array(z.enum(juguangMetricFields)),overrideReason:z.string().nullable()});
const receiptBase={sessionId:z.string(),expiresAt:z.number(),source:sourceSchema};
const receiptSchema=z.union([
 z.object({...receiptBase,v:z.literal(2),campaignId:z.uuid(),metricId:z.uuid().nullable(),metricUpdatedAt:z.string().nullable(),date:z.iso.date()}),
 // 已打开的旧11/15编辑器仍可保存；旧凭证不能跨日期或跨记录使用。
 z.object({...receiptBase,metricId:z.string(),metricUpdatedAt:z.string(),date:z.literal('2026-11-15')}),
]);
export type JuguangMetricTarget=Pick<typeof s.operationsPromotionDailyMetric.$inferSelect,'campaignId'|'metricDate'>&Partial<Pick<typeof s.operationsPromotionDailyMetric.$inferSelect,'juguangSource'|'impressionCount'|'clickCount'>>&{id:string|null;updatedAt:Date|null;draftNoteId?:string|null};
function signature(value:string){
 const key=process.env.BETTER_AUTH_SECRET||import.meta.env?.BETTER_AUTH_SECRET;
 if(!key||key.length<32)throw new JuguangError('JUGUANG_STORAGE_UNAVAILABLE','报表来源校验暂不可用，请稍后重试。',503);
 return createHmac('sha256',key).update('qiuyun:juguang-daily:v1\0'+value).digest();
}
function signReceipt(value:z.infer<typeof receiptSchema>){const body=Buffer.from(JSON.stringify(value)).toString('base64url');return body+'.'+signature(body).toString('base64url');}
function verifyReceipt(value:string,sessionId:string,metric:JuguangMetricTarget){
 const invalid=()=>new WorkflowError('聚光读取结果已失效，请重新读取；当前输入已保留。',409);
 const [body,mac,...extra]=value.split('.');if(!body||!mac||extra.length)throw invalid();
 const expected=signature(body),actual=Buffer.from(mac,'base64url');if(actual.length!==expected.length||!timingSafeEqual(actual,expected))throw invalid();
 let raw:unknown;try{raw=JSON.parse(Buffer.from(body,'base64url').toString());}catch{throw invalid();}
 const parsed=receiptSchema.safeParse(raw);if(!parsed.success)throw invalid();const data=parsed.data;
 if(data.expiresAt<=Date.now()||data.sessionId!==sessionId||data.metricId!==metric.id||data.metricUpdatedAt!==(metric.updatedAt?.toISOString()??null)||data.date!==metric.metricDate||('v' in data&&data.campaignId!==metric.campaignId))throw invalid();
 return data.source;
}
function requireDate(date:string){if(!isJuguangMetricDate(date))throw new WorkflowError('聚光带入开放2026-10-01起、今天以前的数据。',422);}
async function dailyIdentities(db:Database|Transaction,date:string,campaignIds:string[]=[]){
 const rows=await db.select({metric:s.operationsPromotionDailyMetric,campaignId:s.operationsPromotionCampaign.id,scheduleId:s.operationsContentSchedule.id,versionId:s.operationsContentSchedule.contentVersionId,startedOn:s.operationsPromotionCampaign.startedOn})
 .from(s.operationsPromotionCampaign).innerJoin(s.operationsContentSchedule,eq(s.operationsPromotionCampaign.scheduleId,s.operationsContentSchedule.id))
 .leftJoin(s.operationsPromotionDailyMetric,and(eq(s.operationsPromotionDailyMetric.campaignId,s.operationsPromotionCampaign.id),eq(s.operationsPromotionDailyMetric.metricDate,date)))
 .where(or(eq(s.operationsPromotionDailyMetric.metricDate,date),and(lte(s.operationsPromotionCampaign.startedOn,date),or(isNull(s.operationsPromotionCampaign.endedOn),gte(s.operationsPromotionCampaign.endedOn,date))),...(campaignIds.length?[inArray(s.operationsPromotionCampaign.id,campaignIds)]:[])));
 const notes=await readVersionNotes(db,rows.map(r=>r.versionId));
 return rows.filter(r=>r.metric||r.startedOn<=date).map(row=>({...row,noteId:noteIdOn(notes.get(row.versionId)!.periods,date),mappingFingerprint:notes.get(row.versionId)!.fingerprint}));
}
async function readNoteReport(date:string){
 const config=juguangConfig();
 const result=await withJuguangLock(config.appId,true,async()=>{
  const connections=await getDb().select().from(s.xiaohongshuJuguangConnection).where(eq(s.xiaohongshuJuguangConnection.appId,config.appId));
  if(!connections.length)return {error:'请联系管理员完成聚光报表授权。',rows:[]};
  const seen=new Set<number>(),tuples=new Set<string>(),rows:Array<{advertiserId:number;values:z.infer<typeof reportRow>}>=[];
  const deadline=Date.now()+25_000;
  const started=Date.now();let advertiserId:number|null=null,pageNumber:number|null=null;
  try{
   for(const connection of connections){
    if(!hasJuguangReportScope(connection.scope))throw new UpstreamFailure('SCOPE');
    if(connection.refreshTokenExpiresAt.getTime()<=Date.now())throw new UpstreamFailure('410017');
    let tokens:ReturnType<typeof decryptJuguangTokens>;
    try{tokens=decryptJuguangTokens(connection.encryptedTokens,config.appId+':'+connection.authorizationUserId);}catch{throw new UpstreamFailure('IDENTITY');}
    let refreshed=false;const refresh=async()=>{tokens=await refreshJuguangConnection(connection,config,deadline);refreshed=true;};
    if(connection.accessTokenExpiresAt.getTime()<=Date.now()+60_000)await refresh();
    for(const account of connection.advertisers){
     advertiserId=account.advertiser_id;
     if(seen.has(account.advertiser_id))continue;seen.add(account.advertiser_id);
     for(let page=1;page<=20;page++){
      pageNumber=page;
      const read=()=>upstream(JUGUANG_NOTE_REPORT,{advertiser_id:account.advertiser_id,start_date:date,end_date:date,time_unit:'DAY',data_caliber:0,page_num:page,page_size:500},deadline,tokens.accessToken);
      let raw:unknown;try{raw=await read();}catch(error){if(error instanceof UpstreamFailure&&['410019','410020'].includes(error.code)&&!refreshed){await refresh();raw=await read();}else throw error;}
      const parsed=report.safeParse(raw);if(!parsed.success)throw new UpstreamFailure('RESPONSE');const data=parsed.data.data;
      if(data.data_list.length!==Math.min(500,Math.max(0,data.total_count-(page-1)*500)))throw new UpstreamFailure('RESPONSE');
      for(const values of data.data_list){const key=account.advertiser_id+':'+values.note_id.toLowerCase();if(values.time!==date||tuples.has(key))throw new UpstreamFailure('RESPONSE');tuples.add(key);rows.push({advertiserId:account.advertiser_id,values});}
      if(page*500>=data.total_count)break;if(!data.data_list.length||page===20)throw new UpstreamFailure('RESPONSE');
     }
    }
   }
   if(!seen.size)throw new UpstreamFailure('SCOPE');return {rows,error:null};
  }catch(error){if(!(error instanceof UpstreamFailure))throw error;console.warn('Juguang offline note read failed',{date,advertiserId,page:pageNumber,elapsedMs:Date.now()-started,code:error.code});return {rows:[],error:failure(error.code).message,code:error.code};}
 });
 if(result.error)throw new JuguangError('JUGUANG_'+('code' in result?result.code:'UNAVAILABLE'),result.error+' 原数据已保留。',503);
 return result.rows;
}
/** 按授权账户＋日期＋版本当天有效笔记ID读取；空报表允许零值，缺ID和归属冲突仍需核对。 */
export async function readJuguangDailyPreview(date:string,sessionId:string,campaignIds:string[]=[],draftNoteIds:Record<string,string>={}){
 requireDate(date);
 const identities=await dailyIdentities(getDb(),date,campaignIds);
 const selected=campaignIds.length?identities.filter(i=>campaignIds.includes(i.campaignId)):identities.filter(i=>!!i.metric);
 const rows=selected.some(i=>i.noteId||!i.metric&&draftNoteIds[i.campaignId])?await readNoteReport(date):[],fetchedAt=new Date().toISOString();
 return {date,rows:selected.map(identity=>{
  const base={key:juguangTargetKey(identity.campaignId,date),campaignId:identity.campaignId,metricId:identity.metric?.id??null};
  const noteId=identity.noteId??(!identity.metric?draftNoteIds[identity.campaignId]:null);
  if(!noteId)return {...base,message:'请先补齐当天笔记 ID。'};
  if(identities.some(i=>i.campaignId!==identity.campaignId&&i.noteId?.toLowerCase()===noteId.toLowerCase()))return {...base,message:'这一天有多条推广记录共用同一笔记 ID，请先核对归属。'};
  const matched=rows.filter(r=>r.values.note_id.toLowerCase()===noteId.toLowerCase());
  if(!matched.length)return {...base,waiting:true as const,message:'聚光暂无这一天的报表，可按 0 填写并保存。已有输入保留。'};
  const sum=(key:'fee'|'impression'|'click'|'initiative_message'|'msg_leads_num')=>matched.reduce((total,row)=>total+(key==='fee'?Math.round(row.values.fee*100):row.values[key]),0);
  const original:JuguangMetricValues={spend:sum('fee')/100,impressionCount:sum('impression'),clickCount:sum('click'),platformOpenCount:sum('initiative_message'),platformLeadCount:sum('msg_leads_num')};
  if(original.clickCount>original.impressionCount||Object.entries(original).some(([key,value])=>value>(key==='spend'?9999999999.99:2147483647)))throw new WorkflowError('聚光指标超出可保存范围，原数据已保留。',503);
  const source:JuguangMetricSource={kind:'juguang_offline_note',fetchedAt,noteId,mappingFingerprint:identity.mappingFingerprint,advertiserIds:[...new Set(matched.map(r=>r.advertiserId))].sort((a,b)=>a-b),original,overriddenFields:[],overrideReason:null};
  return {...base,source,receipt:signReceipt({v:2,sessionId,campaignId:identity.campaignId,metricId:base.metricId,metricUpdatedAt:identity.metric?.updatedAt.toISOString()??null,date,expiresAt:Date.now()+3600_000,source})};
 })};
}
export interface JuguangDailyInput{spend:number;platformOpenCount:number;platformLeadCount:number;impressionCount?:number|null;clickCount?:number|null;juguangReceipt?:string;juguangOverrideReason?:string}
/** 原写入事务内仅返回五项事实、派生CTR与来源；不接收实际人数或策略。 */
export async function juguangDailyChanges(db:Database|Transaction,metric:JuguangMetricTarget,input:JuguangDailyInput,sessionId:string){
 const submitted=input.impressionCount!=null||input.clickCount!=null||!!input.juguangReceipt;
 if(!isJuguangMetricDate(metric.metricDate)){if(submitted)requireDate(metric.metricDate);return {};}
 let source=input.juguangReceipt?verifyReceipt(input.juguangReceipt,sessionId,metric):metric.juguangSource;
 if(!source){
  if(!submitted)return {};
  if(input.impressionCount===0&&input.clickCount===0)return {impressionCount:0,clickCount:0,clickRate:null};
  throw new WorkflowError('没有聚光来源时，曝光量和点击量可同时填 0；填写其他数值前，请先读取聚光数据。',422);
 }
 const identities=await dailyIdentities(db,metric.metricDate,[metric.campaignId]),identity=identities.find(i=>i.campaignId===metric.campaignId);
 const expectedNoteId=identity?.noteId??(!metric.id?metric.draftNoteId:null);
 if(!identity||expectedNoteId!==source.noteId||identity.mappingFingerprint!==source.mappingFingerprint||identities.some(i=>i.campaignId!==metric.campaignId&&i.noteId===expectedNoteId))throw new WorkflowError('当天笔记 ID 或推广归属已变化，请重新读取聚光；当前输入已保留。',409);
 const impressions=input.impressionCount===undefined?metric.impressionCount:input.impressionCount,clicks=input.clickCount===undefined?metric.clickCount:input.clickCount;
 if(impressions==null||clicks==null||clicks>impressions)throw new WorkflowError('请填写有效的曝光量和点击量；点击量不能大于曝光量。',422);
 const values:JuguangMetricValues={spend:Number(input.spend.toFixed(2)),platformOpenCount:input.platformOpenCount,platformLeadCount:input.platformLeadCount,impressionCount:impressions,clickCount:clicks};
 const original=source.original;
 const overriddenFields=juguangMetricFields.filter(key=>values[key]!==original[key]);
 const overrideReason=input.juguangOverrideReason?.trim()||(JSON.stringify(overriddenFields)===JSON.stringify(source.overriddenFields)?source.overrideReason:null);
 if(overriddenFields.length&&!overrideReason)throw new WorkflowError('请填写人工覆盖聚光数据的原因。',422);
 source={...source,overriddenFields,overrideReason:overriddenFields.length?overrideReason:null};
 const rate=promotionClickRate(impressions,clicks);
 return {impressionCount:impressions,clickCount:clicks,clickRate:rate==null?null:rate.toFixed(4),juguangSource:source};
}
