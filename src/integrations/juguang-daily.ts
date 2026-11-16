import {createHmac, timingSafeEqual} from 'node:crypto';
import {eq} from 'drizzle-orm';
import {z} from 'zod';
import {getDb, type Database} from '../db/client';
import * as s from '../db/schema';
import {readVersionNotes} from '../db/note-identities';
import {noteIdOn} from '../db/note-identity-rules';
import {WorkflowError,type Transaction} from '../db/schedule-workflow';
import {decryptJuguangTokens,hasJuguangReportScope,juguangConfig,withJuguangLock,JuguangError} from './xiaohongshu-juguang';
import {upstream,UpstreamFailure,failure,refreshJuguangConnection} from './juguang-token';
import {JUGUANG_NOTE_REPORT} from './juguang-check';
import {JUGUANG_PILOT_DATE,juguangMetricFields,promotionClickRate,type JuguangMetricSource,type JuguangMetricValues} from './juguang-metric-types';

const numeric=z.union([z.number(),z.string().regex(/^\d+(\.\d+)?$/)]).transform(Number);
const count = numeric.pipe(z.number().int().min(0).max(2147483647));
const amount = numeric.pipe(z.number().min(0).max(9999999999.99));
// 上游缺项不是零值；在协议边界一次性解析，金额用分累计。
const reportRow = z.object({time:z.literal(JUGUANG_PILOT_DATE),note_id:z.string().regex(/^[a-f0-9]{24}$/i),fee:amount,impression:count,click:count,initiative_message:count,msg_leads_num:count});
const report = z.object({data:z.object({total_count:count,data_list:z.array(reportRow)})});
const originalSchema = z.object({spend:amount,platformOpenCount:count,platformLeadCount:count,impressionCount:count,clickCount:count});
const sourceSchema = z.object({kind:z.literal('juguang_offline_note'),fetchedAt:z.iso.datetime(),noteId:z.string(),mappingFingerprint:z.string(),advertiserIds:z.array(z.number().int().positive()),original:originalSchema,overriddenFields:z.array(z.enum(juguangMetricFields)),overrideReason:z.string().nullable()});
const receiptSchema = z.object({sessionId:z.string(),metricId:z.string(),metricUpdatedAt:z.string(),date:z.literal(JUGUANG_PILOT_DATE),expiresAt:z.number(),source:sourceSchema});
function signature(value:string) {
  const key=process.env.BETTER_AUTH_SECRET || import.meta.env?.BETTER_AUTH_SECRET;
  if(!key || key.length<32)throw new JuguangError('JUGUANG_STORAGE_UNAVAILABLE','报表来源校验暂不可用，请稍后重试。',503);
  return createHmac('sha256',key).update('qiuyun:juguang-daily:v1\0'+value).digest();
}
function signReceipt(value:z.infer<typeof receiptSchema>) {
  const body=Buffer.from(JSON.stringify(value)).toString('base64url');
  return body+'.'+signature(body).toString('base64url');
}
function verifyReceipt(value:string,sessionId:string,metric:typeof s.operationsPromotionDailyMetric.$inferSelect) {
  const invalid=()=>new WorkflowError('聚光读取结果已失效，请重新读取；当前输入已保留。',409);
  const [body,mac,...extra]=value.split('.');
  if(!body || !mac || extra.length)throw invalid();
  const expected=signature(body),actual=Buffer.from(mac,'base64url');
  if(actual.length!==expected.length || !timingSafeEqual(actual,expected))throw invalid();
  let raw:unknown;try{raw=JSON.parse(Buffer.from(body,'base64url').toString());}catch{throw invalid();}
  const parsed=receiptSchema.safeParse(raw);
  if(!parsed.success)throw invalid();
  const data=parsed.data;
  if(data.expiresAt<=Date.now() || data.sessionId!==sessionId || data.metricId!==metric.id || data.metricUpdatedAt!==metric.updatedAt.toISOString())throw invalid();
  return data.source;
}
async function pilotIdentities(db:Database|Transaction) {
  const rows=await db.select({metric:s.operationsPromotionDailyMetric,versionId:s.operationsContentSchedule.contentVersionId})
    .from(s.operationsPromotionDailyMetric).innerJoin(s.operationsPromotionCampaign,eq(s.operationsPromotionDailyMetric.campaignId,s.operationsPromotionCampaign.id))
    .innerJoin(s.operationsContentSchedule,eq(s.operationsPromotionCampaign.scheduleId,s.operationsContentSchedule.id))
    .where(eq(s.operationsPromotionDailyMetric.metricDate,JUGUANG_PILOT_DATE));
  const notes=await readVersionNotes(db,rows.map(r=>r.versionId));
  return rows.map(row=>({...row,noteId:noteIdOn(notes.get(row.versionId)!.periods,JUGUANG_PILOT_DATE),mappingFingerprint:notes.get(row.versionId)!.fingerprint}));
}

/** 单日、已保存事实的读取预览。没有指标、策略或任务写入。 */
export async function readJuguangDailyPreview(date:string,sessionId:string) {
  if(date!==JUGUANG_PILOT_DATE)throw new WorkflowError('本次聚光带入仅开放 2026-11-15。',422);
  const identities=await pilotIdentities(getDb()),config=juguangConfig();
  const result=await withJuguangLock(config.appId,true,async()=>{
    const connections=await getDb().select().from(s.xiaohongshuJuguangConnection).where(eq(s.xiaohongshuJuguangConnection.appId,config.appId));
    if(!connections.length)return {error:'请联系管理员完成聚光报表授权。',rows:[]};
    const seen=new Set<number>(),rows:Array<{advertiserId:number;values:z.infer<typeof reportRow>}> = [];
    const deadline=Date.now()+25_000;
    try {
      for(const connection of connections) {
        if(!hasJuguangReportScope(connection.scope))throw new UpstreamFailure('SCOPE');
        if(connection.refreshTokenExpiresAt.getTime()<=Date.now())throw new UpstreamFailure('410017');
        let tokens:ReturnType<typeof decryptJuguangTokens>;
        try{tokens=decryptJuguangTokens(connection.encryptedTokens,config.appId+':'+connection.authorizationUserId);}catch{throw new UpstreamFailure('IDENTITY');}
        let refreshed=false;
        const refresh=async()=>{tokens=await refreshJuguangConnection(connection,config,deadline);refreshed=true;};
        if(connection.accessTokenExpiresAt.getTime()<=Date.now()+60_000)await refresh();
        for(const account of connection.advertisers) {
          if(seen.has(account.advertiser_id))continue;
          seen.add(account.advertiser_id);
          for(let page=1;page<=20;page++) {
            const read=()=>upstream(JUGUANG_NOTE_REPORT,{advertiser_id:account.advertiser_id,start_date:date,end_date:date,time_unit:'DAY',data_caliber:0,page_num:page,page_size:500},deadline,tokens.accessToken);
            let raw:unknown;
            try{raw=await read();}catch(error){if(error instanceof UpstreamFailure && ['410019','410020'].includes(error.code) && !refreshed){await refresh();raw=await read();}else throw error;}
            const parsed=report.safeParse(raw);
            if(!parsed.success)throw new UpstreamFailure('RESPONSE');
            const data=parsed.data.data;
            if(data.data_list.length!==Math.min(500,Math.max(0,data.total_count-(page-1)*500)))throw new UpstreamFailure('RESPONSE');
            rows.push(...data.data_list.map(values=>({advertiserId:account.advertiser_id,values})));
            if(page*500>=data.total_count)break;
            if(!data.data_list.length || page===20)throw new UpstreamFailure('RESPONSE');
          }
        }
      }
      if(!seen.size)throw new UpstreamFailure('SCOPE');
      return {rows,error:null};
    } catch(error) {
      if(!(error instanceof UpstreamFailure))throw error;
      // 将错误带出锁事务后再响应，已轮换的刷新令牌必须提交。
      return {rows:[],error:failure(error.code).message};
    }
  });
  if(result.error)throw new WorkflowError(result.error+' 原数据已保留。',503);
  const fetchedAt=new Date().toISOString();
  return {date,rows:identities.map(identity=>{
    const matched=result.rows.filter(row=>row.values.note_id.toLowerCase()===identity.noteId?.toLowerCase());
    if(!matched.length)return {metricId:identity.metric.id,message:identity.noteId?'聚光尚无这一天的笔记报表，保留原数据。':'请先补齐当天笔记 ID。'};
    const sum=(key:'fee'|'impression'|'click'|'initiative_message'|'msg_leads_num')=>matched.reduce((total,row)=>total+(key==='fee'?Math.round(row.values.fee*100):row.values[key]),0);
    const original:JuguangMetricValues={spend:sum('fee')/100,impressionCount:sum('impression'),clickCount:sum('click'),platformOpenCount:sum('initiative_message'),platformLeadCount:sum('msg_leads_num')};
    if(original.clickCount>original.impressionCount || Object.entries(original).some(([key,value])=>value>(key==='spend'?9999999999.99:2147483647)))throw new WorkflowError('聚光指标超出可保存范围，原数据已保留。',503);
    const source:JuguangMetricSource={kind:'juguang_offline_note',fetchedAt,noteId:identity.noteId!,mappingFingerprint:identity.mappingFingerprint,advertiserIds:[...new Set(matched.map(r=>r.advertiserId))],original,overriddenFields:[],overrideReason:null};
    return {metricId:identity.metric.id,source,receipt:signReceipt({sessionId,metricId:identity.metric.id,metricUpdatedAt:identity.metric.updatedAt.toISOString(),date:JUGUANG_PILOT_DATE,expiresAt:Date.now()+3600_000,source})};
  })};
}

export interface JuguangDailyInput {
  spend:number;platformOpenCount:number;platformLeadCount:number;
  impressionCount?:number|null;clickCount?:number|null;juguangReceipt?:string;juguangOverrideReason?:string;
}
/** 在原指标写事务及工作流锁内调用；只返回数值和来源，绝不接收策略。 */
export async function juguangDailyChanges(db:Database|Transaction,metric:typeof s.operationsPromotionDailyMetric.$inferSelect,input:JuguangDailyInput,sessionId:string) {
  const submitted=input.impressionCount!=null || input.clickCount!=null || !!input.juguangReceipt;
  if(metric.metricDate!==JUGUANG_PILOT_DATE){if(submitted)throw new WorkflowError('本次聚光带入仅开放 2026-11-15。',422);return {};}
  let source=input.juguangReceipt?verifyReceipt(input.juguangReceipt,sessionId,metric):metric.juguangSource;
  if(!source){if(submitted)throw new WorkflowError('请先读取聚光数据，再保存曝光量与点击量。',422);return {};}
  const [identity]=(await pilotIdentities(db)).filter(row=>row.metric.id===metric.id);
  if(!identity || identity.noteId!==source.noteId || identity.mappingFingerprint!==source.mappingFingerprint)throw new WorkflowError('当天笔记 ID 已变化，请重新读取聚光；当前输入已保留。',409);
  const impressions=input.impressionCount===undefined?metric.impressionCount:input.impressionCount,clicks=input.clickCount===undefined?metric.clickCount:input.clickCount;
  if(impressions==null || clicks==null || clicks>impressions)throw new WorkflowError('请填写有效的曝光量和点击量；点击量不能大于曝光量。',422);
  const values:JuguangMetricValues={spend:Number(input.spend.toFixed(2)),platformOpenCount:input.platformOpenCount,platformLeadCount:input.platformLeadCount,impressionCount:impressions,clickCount:clicks};
  const original=source.original;
  const overriddenFields=juguangMetricFields.filter(key=>values[key]!==original[key]);
  const overrideReason=input.juguangOverrideReason?.trim() || (JSON.stringify(overriddenFields)===JSON.stringify(source.overriddenFields)?source.overrideReason:null);
  if(overriddenFields.length && !overrideReason)throw new WorkflowError('请填写人工覆盖聚光数据的原因。',422);
  source={...source,overriddenFields,overrideReason:overriddenFields.length?overrideReason:null};
  const rate=promotionClickRate(impressions,clicks);
  return {impressionCount:impressions,clickCount:clicks,clickRate:rate==null?null:rate.toFixed(4),juguangSource:source};
}
