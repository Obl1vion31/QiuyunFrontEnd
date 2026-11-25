import { businessDate } from '../scripts/business-date';

export const salesPath = '/business/sales';
export const salesToday = () => businessDate(new Date());
export type Role = 'seller' | 'operator';
export const people: Record<Role, string> = { seller: '销售', operator: '总运营' };
export type View = 'ledger' | 'queue' | 'monthly' | 'cohort' | 'posts';
export const views: Record<View, string> = {
  ledger: '销售台账', queue: '核对来源', monthly: '销售统计', cohort: '销售统计', posts: '销售统计',
};
export const viewRole = (view: View): Role => view === 'ledger' ? 'seller' : 'operator';
export const isStatView = (view: View): view is 'monthly' | 'cohort' | 'posts' =>
  view === 'monthly' || view === 'cohort' || view === 'posts';
export function salesView(value: string | null): View {
  return value && Object.hasOwn(views, value) ? value as View : 'ledger';
}
export type SourceStatus = 'pending' | 'confirmed' | 'other' | 'unknown';
export type Stage = 'new' | 'following' | 'closed';
export const needs = ['课程', '讲义', '模考'] as const;
export type Need = typeof needs[number];
export const sources: Record<SourceStatus, string> = {
  pending: '待核对', confirmed: '已确认', other: '其他来源', unknown: '来源未确认',
};
export const stages: Record<Stage, string> = {
  new: '待跟进', following: '跟进中', closed: '已结束',
};

export interface Post {
  id: string;
  title: string;
  subject: string;
  type: string;
  note: string;
  published: string;
  versions: string[];
  short: string;
  promotion?: { name: string; stage: string };
}
export interface Source {
  status: SourceStatus;
  postId?: string;
  version?: string;
  entry?: string;
  evidence?: string;
}
export interface Follow {
  id: string;
  date: string;
  stage: Stage;
  need?: Need;
  subject?: string;
  interest: string;
}
export interface Payment { id: string; date: string; product: string; voided?: boolean }
export interface History { at: string; actor: Role; text: string }
export interface Lead {
  id: string;
  name: string;
  added: string;
  need?: Need;
  subject?: string;
  interest: string;
  stage: Stage;
  source: Source;
  follows: Follow[];
  payments: Payment[];
  history: History[];
  mergedTo?: string;
}
export interface Filters { q: string; month: string; stage: string; source: string; post: string }

export const labelSource = (source: Source, post?: Post) => source.status === 'confirmed' && post ? post.title : sources[source.status];
export const dateText = (value: string) => value.replace('T', ' ');
export const activePayments = (lead: Lead) => lead.payments.filter(payment => !payment.voided);
export const monthLabel = (value: string) => value.slice(0, 4) + ' 年 ' + Number(value.slice(5, 7)) + ' 月';

export function salesHref(view: View = 'ledger', values: Record<string, string> = {}) {
  const query = new URLSearchParams();
  if (view !== 'ledger') query.set('view', view);
  for (const [key, value] of Object.entries(values)) if (value) query.set(key, value);
  return query.size ? salesPath + '?' + query : salesPath;
}
