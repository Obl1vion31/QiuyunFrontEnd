/** 可在浏览器使用的数据口径；不含任何授权凭据。 */
export const JUGUANG_PILOT_DATE = '2026-11-15';
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
  metricId: string;
  source: JuguangMetricSource;
  receipt: string;
}
export function promotionClickRate(impressions: number | null | undefined, clicks: number | null | undefined) {
  return impressions != null && impressions > 0 && clicks != null ? clicks / impressions * 100 : null;
}
