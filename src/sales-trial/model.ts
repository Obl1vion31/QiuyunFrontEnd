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
export const subjects = ['TMUA', '面试课', 'ESAT', 'STEP'] as const;
export const sources: Record<SourceStatus, string> = {
  pending: '待核对', confirmed: '已确认', other: '其他来源', unknown: '无法确认来源帖',
};
export const stages: Record<Stage, string> = {
  new: '待跟进', following: '跟进中', closed: '已结束',
};

export interface Post {
  id: string;
  title: string;
  subject: string;
  type: '推广' | '非推广';
  note: string | null;
  published: string;
  plannedMonth: string;
  version: string;
  publication: string;
  promotion?: string;
}
export interface Source {
  status: SourceStatus;
  post?: Post;
  version?: string;
  entry?: string;
  evidence?: string;
}
export interface Direction {
  need?: Need;
  subject?: string;
  interest: string;
}
interface Consultation extends Direction {
  directions?: Direction[];
}
export interface Follow extends Consultation {
  id: string;
  date: string;
  stage: Stage;
}
export interface Payment { id: string; date: string; product: string; voided?: boolean }
export interface History { at: string; actor: Role; text: string }
export interface Lead extends Consultation {
  id: string;
  name: string;
  wechatId?: string;
  added: string;
  stage: Stage;
  source: Source;
  follows: Follow[];
  payments: Payment[];
  history: History[];
  mergedTo?: string;
}
export interface Filters { q: string; month: string; stage: string; source: string; post: string }

export function directionsOf({ directions, need, subject, interest }: Consultation): Direction[] {
  return directions ?? (need || subject || interest ? [{ need, subject, interest }] : []);
}

export const sourcePost = (source: Source) => source.status === 'confirmed' ? source.post : undefined;
export const sourceStatus = (source: Source): SourceStatus => source.status === 'confirmed' && !source.post ? 'pending' : source.status;
export const labelSource = (source: Source) => sourcePost(source)?.title ??
  (source.status === 'confirmed' ? '待重新核对' : sources[source.status]);
export function sourcePostHref(post: Post) {
  return post.publication || '/business/operations-schedule?' + new URLSearchParams({ month: post.plannedMonth, row: post.id });
}
export const sourcePostLinkLabel = (post: Post) => post.publication ? '查看原帖' : '查看排期详情';
export const dateText = (value: string) => value.replace('T', ' ');
export const activePayments = (lead: Lead) => lead.payments.filter(payment => !payment.voided);
export const monthLabel = (value: string) => value.slice(0, 4) + ' 年 ' + Number(value.slice(5, 7)) + ' 月';

export function salesHref(view: View = 'ledger', values: Record<string, string> = {}) {
  const query = new URLSearchParams();
  if (view !== 'ledger') query.set('view', view);
  for (const [key, value] of Object.entries(values)) if (value) query.set(key, value);
  return query.size ? salesPath + '?' + query : salesPath;
}
