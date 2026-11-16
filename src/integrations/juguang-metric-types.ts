/** 可在浏览器使用的数据口径；不含任何授权凭据。 */
import {shanghaiDateKey} from '../db/promotion-rules.mjs';
export const JUGUANG_START_DATE = '2026-10-01';
export const juguangTargetKey=(campaignId:string,date:string)=>campaignId+':'+date;
export function isJuguangMetricDate(date:string,now=new Date()){
  const parsed=new Date(date+'T00:00:00Z');
  return Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===date&&date>=JUGUANG_START_DATE&&date<shanghaiDateKey(now);
}
export const juguangMetricFields = ['spend','platformOpenCount','platformLeadCount','impressionCount','clickCount'] as const;
export type JuguangMetricField = typeof juguangMetricFields[number];
export type JuguangMetricValues = Record<JuguangMetricField, number>;
export interface JuguangMetricSource {
  kind: 'juguang_offline_note';
  fetchedAt: string;
  noteId: string;
  mappingFingerprint: string;
  advertiserIds: number[];
  original: JuguangMetricValues;
  overriddenFields: JuguangMetricField[];
  overrideReason: string | null;
}
export interface JuguangMetricPreview {
  key: string;
  campaignId: string;
  metricId: string | null;
  source: JuguangMetricSource;
  receipt: string;
}
export function promotionClickRate(impressions: number | null | undefined, clicks: number | null | undefined) {
  return impressions != null && impressions > 0 && clicks != null ? clicks / impressions * 100 : null;
}
