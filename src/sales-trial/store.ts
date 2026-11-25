import { extractPublicationLink, publicationNoteId } from '../db/publication-link.mjs';
import { businessDateTime } from '../scripts/business-date';
import { previewPosts } from './fixture';
import { activePayments, needs, salesToday, sources, stages } from './model';
import type { Filters, Lead, Need, Role, Source, Stage } from './model';

export type Action = 'create' | 'follow' | 'deal' | 'source' | 'merge';
export interface Workspace { rows: Lead[]; receipts: Map<string, string> }

const active = (rows: Lead[]) => rows.filter(row => !row.mergedTo);
export const postFor = (postId: string | undefined) => previewPosts.find(post => post.id === postId);
const nameKey = (name: string) => name.trim().normalize('NFKC').toLowerCase();
const sortDate = <T extends { date: string }>(items: T[]) =>
  [...items].sort((left, right) => right.date.localeCompare(left.date));

function text(form: FormData, field: string, max = 700) {
  const value = String(form.get(field) ?? '').trim();
  if (value.length > max) throw new Error('填写内容过长，请缩短后保存。');
  return value;
}
function day(value: string, label: string, earliest = '') {
  const parsed = new Date(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== value || value > salesToday() || value < earliest) {
    throw new Error(earliest ? `请选择 ${earliest} 至 ${salesToday()} 之间的${label}。` : `请选择不晚于今天的有效${label}。`);
  }
  return value;
}
function addHistory(lead: Lead, actor: Role, description: string) {
  lead.history.unshift({ at: businessDateTime(new Date()), actor, text: description });
}
function getLead(rows: Lead[], id: string) {
  const lead = rows.find(row => row.id === id && !row.mergedTo);
  if (!lead) throw new Error('这条记录已合并或暂不可用。');
  return lead;
}
export function filtersFrom(params: URLSearchParams): Filters {
  const month = params.get('month') ?? '';
  const stage = params.get('stage') ?? '';
  const source = params.get('source') ?? '';
  return {
    q: (params.get('q') ?? '').slice(0, 100),
    month: /^\d{4}-(?:0[1-9]|1[0-2])$/.test(month) ? month : '',
    stage: Object.hasOwn(stages, stage) ? stage : '',
    source: source === 'all' || Object.hasOwn(sources, source) ? source : '',
    post: postFor(params.get('post') ?? '')?.id ?? '',
  };
}
export function readList(workspace: Workspace, filters: Filters, queue: boolean) {
  const visible = active(workspace.rows);
  const rows = visible.filter(row => {
    if (queue && filters.source !== 'all' && row.source.status !== (filters.source || 'pending')) return false;
    if (filters.q && ![row.name, postFor(row.source.postId)?.title, row.source.evidence].some(value => value?.toLowerCase().includes(filters.q.toLowerCase()))) return false;
    if (filters.month && !row.added.startsWith(filters.month)) return false;
    return !filters.stage || row.stage === filters.stage;
  }).sort((left, right) => right.added.localeCompare(left.added));
  return {
    count: rows.length,
    waiting: visible.filter(row => row.source.status === 'pending').length,
    rows: rows.map(row => ({
      id: row.id, name: row.name, added: row.added, source: row.source, post: postFor(row.source.postId),
      need: row.need, subject: row.subject, interest: row.interest, stage: row.stage,
      latestPayment: queue ? undefined : sortDate(activePayments(row))[0],
    })),
  };
}
export function readLead(workspace: Workspace, id: string, queue: boolean) {
  const lead = getLead(workspace.rows, id);
  const base = {
    id: lead.id, name: lead.name, added: lead.added, source: lead.source, post: postFor(lead.source.postId),
    need: lead.need, subject: lead.subject, interest: lead.interest,
  };
  if (queue) return {
    ...base, history: lead.history.filter(event => event.actor === 'operator'),
    duplicates: active(workspace.rows).filter(other => other.id !== lead.id && nameKey(other.name) === nameKey(lead.name))
      .map(other => ({ id: other.id, name: other.name, added: other.added })),
  };
  return {
    ...base, stage: lead.stage, follows: sortDate(lead.follows), payments: sortDate(lead.payments), history: lead.history,
  };
}

export function searchPosts(value: string) {
  const q = value.trim().slice(0, 250);
  if (!q) return [];
  const note = publicationNoteId(q) ?? (/^[\da-f]{24}$/i.test(q) ? q.toLowerCase() : null);
  const { url } = extractPublicationLink(q);
  if (note) return previewPosts.filter(post => post.note === note);
  if (url) {
    const supplied = new URL(url);
    return previewPosts.filter(post => {
      const sample = new URL(post.short);
      return sample.hostname === supplied.hostname && sample.pathname === supplied.pathname;
    });
  }
  return previewPosts.filter(post => post.title.toLowerCase().includes(q.toLowerCase()));
}

function changeSource(lead: Lead, form: FormData) {
  const status = text(form, 'sourceStatus');
  if (!Object.hasOwn(sources, status)) throw new Error('请选择来源核对结果。');
  const post = postFor(text(form, 'postId'));
  const version = text(form, 'version', 15);
  const entry = text(form, 'entry', 15);
  const evidence = text(form, 'evidence');
  if (status === 'confirmed') {
    if (!post) throw new Error('请先选择要关联的帖子。');
    if (version && !post.versions.includes(version)) throw new Error('所选版本不属于这篇帖子。');
    if (!['仅确认帖子', '开口', '留资'].includes(entry)) throw new Error('请选择能确认的来源层级。');
    if ((entry !== '仅确认帖子' || version) && !evidence) throw new Error('请补充判断入口或版本的依据。');
  }
  if (status === 'other' && !evidence) throw new Error('请补充其他来源的信息。');
  const previous = postFor(lead.source.postId)?.title ?? sources[lead.source.status];
  const next: Source = { status: status as Source['status'], ...(evidence ? { evidence } : {}) };
  if (next.status === 'confirmed' && post) Object.assign(next, { postId: post.id, entry, ...(version ? { version } : {}) });
  lead.source = next;
  addHistory(lead, 'operator', `来源由「${previous}」更新为「${post && next.status === 'confirmed' ? post.title : sources[next.status]}」。`);
}
function mergeLead(workspace: Workspace, lead: Lead, duplicateId: string) {
  const duplicate = getLead(workspace.rows, duplicateId);
  if (lead.id === duplicate.id || nameKey(lead.name) !== nameKey(duplicate.name)) {
    throw new Error('请选择同名待核对记录。');
  }
  if (lead.added > duplicate.added) lead.added = duplicate.added;
  lead.follows.push(...duplicate.follows);
  lead.payments.push(...duplicate.payments);
  lead.need ??= duplicate.need;
  lead.subject ??= duplicate.subject;
  lead.interest ||= duplicate.interest;
  if (lead.source.status !== 'confirmed' && duplicate.source.status === 'confirmed') lead.source = duplicate.source;
  lead.stage = sortDate(lead.follows)[0]?.stage ?? lead.stage;
  duplicate.mergedTo = lead.id;
  lead.history.push(...duplicate.history);
  addHistory(lead, 'operator', '已合并同一客户的另一条登记。');
}
function followFields(form: FormData) {
  const stage = text(form, 'stage') as Stage;
  const need = text(form, 'need') as Need;
  if (!Object.hasOwn(stages, stage)) throw new Error('请选择跟进进度。');
  if (need && !needs.includes(need)) throw new Error('请选择正确的咨询类别。');
  return { stage, need: need || undefined, subject: text(form, 'subject', 40) || undefined, interest: text(form, 'interest', 70) };
}
function changeDeal(lead: Lead, form: FormData) {
  const current = sortDate(activePayments(lead))[0];
  const outcome = text(form, 'outcome');
  if (outcome === 'no') {
    if (current) {
      for (const payment of lead.payments) payment.voided = true;
      addHistory(lead, 'seller', '将成交状态更正为未成交。');
    }
    return;
  }
  if (outcome !== 'yes') throw new Error('请选择是否成交。');
  const date = day(text(form, 'dealDay'), '付款日期', lead.added.slice(0, 10));
  const product = text(form, 'product', 70);
  if (current) {
    if (current.date === date && current.product === product) return;
    Object.assign(current, { date, product });
    addHistory(lead, 'seller', '更正了成交登记。');
  } else {
    lead.payments.unshift({ id: crypto.randomUUID(), date, product });
    addHistory(lead, 'seller', '登记了成交。');
  }
}
export function saveLead(workspace: Workspace, action: Action, form: FormData) {
  const requestId = text(form, 'requestId', 50);
  const key = action + ':' + requestId;
  const prior = requestId && workspace.receipts.get(key);
  if (prior) return prior;
  let id: string;
  if (action === 'create') {
    const name = text(form, 'name', 40);
    if (!name) throw new Error('请填写微信名。');
    const date = day(text(form, 'addedDay'), '添加日期');
    const time = text(form, 'addedTime', 5);
    if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error('请填写添加时间。');
    const follow = followFields(form);
    id = crypto.randomUUID();
    const lead: Lead = {
      id, name, added: `${date}T${time}`, ...follow, source: { status: 'pending' },
      follows: follow.stage === 'new' ? [] : [{ id: crypto.randomUUID(), date: salesToday(), ...follow }],
      payments: [], history: [],
    };
    addHistory(lead, 'seller', '登记了客户。');
    workspace.rows.push(lead);
  } else {
    const lead = getLead(workspace.rows, text(form, 'leadId', 50));
    id = lead.id;
    switch (action) {
      case 'source': changeSource(lead, form); break;
      case 'merge': mergeLead(workspace, lead, text(form, 'duplicateId', 50)); break;
      case 'follow': {
        const follow = followFields(form);
        Object.assign(lead, follow);
        lead.follows.unshift({ id: crypto.randomUUID(), date: salesToday(), ...follow });
        addHistory(lead, 'seller', '保存了一次跟进。');
        break;
      }
      case 'deal': changeDeal(lead, form); break;
    }
  }
  if (requestId) workspace.receipts.set(key, id);
  return id;
}

export function readStats(workspace: Workspace, filters: Filters) {
  const today = salesToday();
  const month = filters.month || today.slice(0, 7);
  const rows = active(workspace.rows);
  const cohort = rows.filter(row => row.added.startsWith(month) && row.added.slice(0, 10) <= today);
  const hasFollow = (lead: Lead) => lead.follows.some(follow => follow.date <= today);
  const paid = (lead: Lead) => activePayments(lead).some(payment => payment.date <= today);
  const course = cohort.filter(row => row.need === '课程');
  const followed = cohort.filter(hasFollow);
  const summary = {
    added: cohort.length,
    monthlyFollowed: rows.filter(row => row.follows.some(follow => follow.date.startsWith(month) && follow.date <= today)).length,
    monthlyPaid: rows.filter(row => activePayments(row).some(payment => payment.date.startsWith(month) && payment.date <= today)).length,
    followed: followed.length, paid: cohort.filter(paid).length, followedPaid: followed.filter(paid).length,
    course: course.length, courseFollowed: course.filter(hasFollow).length,
    unknownNeed: cohort.filter(row => !row.need).length,
    unknownSource: cohort.filter(row => ['pending', 'unknown'].includes(row.source.status)).length,
  };
  const mix = (values: string[][]) => {
    const counts = new Map<string, number>();
    for (const items of values) {
      for (const item of new Set(items.filter(Boolean))) counts.set(item, (counts.get(item) ?? 0) + 1);
    }
    return [...counts].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'zh'));
  };
  const postRows = previewPosts.filter(post => !filters.post || post.id === filters.post).map(post => {
    const attributed = cohort.filter(row => row.source.status === 'confirmed' && row.source.postId === post.id);
    return {
      post, added: attributed.length, followed: attributed.filter(hasFollow).length, paid: attributed.filter(paid).length,
      interests: mix(attributed.map(row => [row.interest || row.need || ''])),
      products: mix(attributed.map(row => activePayments(row).filter(payment => payment.date <= today).map(payment => payment.product))),
    };
  });
  return { month, summary, postRows };
}

export function monthOptions(workspace: Workspace, selected: string) {
  const months = new Set<string>([salesToday().slice(0, 7)]);
  if (selected) months.add(selected);
  for (const row of active(workspace.rows)) {
    months.add(row.added.slice(0, 7));
    for (const entry of [...row.follows, ...activePayments(row)]) months.add(entry.date.slice(0, 7));
  }
  return [...months].sort().reverse();
}
