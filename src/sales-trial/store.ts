import { businessDateTime } from '../scripts/business-date';
import { activePayments, directionsOf, labelSource, needs, salesToday, sourcePost, sourceStatus, sources, stages, subjects } from './model';
import type { Direction, Filters, Lead, Need, Post, Role, Source, Stage } from './model';

export type Action = 'create' | 'contact' | 'follow' | 'deal' | 'source' | 'merge';
export interface Workspace { rows: Lead[]; receipts: Map<string, string> }

const active = (rows: Lead[]) => rows.filter(row => !row.mergedTo);
const nameKey = (name: string) => name.trim().normalize('NFKC').toLowerCase();
const sortDate = <T extends { date: string }>(items: T[]) =>
  [...items].sort((left, right) => right.date.localeCompare(left.date));

function bounded(value: FormDataEntryValue | null, max: number) {
  const trimmed = String(value ?? '').trim();
  if (trimmed.length > max) throw new Error('填写内容过长，请缩短后保存。');
  return trimmed;
}
const text = (form: FormData, field: string, max = 700) => bounded(form.get(field), max);
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
  if (!lead) throw new Error('这条记录已删除、合并或暂不可用。');
  return lead;
}
export function filtersFrom(params: URLSearchParams): Filters {
  const month = params.get('month') ?? '';
  const stage = params.get('stage') ?? '';
  const source = params.get('source') ?? '';
  const post = params.get('post') ?? '';
  return {
    q: (params.get('q') ?? '').slice(0, 100),
    month: /^\d{4}-(?:0[1-9]|1[0-2])$/.test(month) ? month : '',
    stage: Object.hasOwn(stages, stage) ? stage : '',
    source: source === 'all' || Object.hasOwn(sources, source) ? source : '',
    post: /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(post) ? post.toLowerCase() : '',
  };
}
export function readList(workspace: Workspace, filters: Filters, queue: boolean) {
  const visible = active(workspace.rows);
  const rows = visible.filter(row => {
    if (queue && filters.source !== 'all' && sourceStatus(row.source) !== (filters.source || 'pending')) return false;
    if (filters.q && ![row.name, row.wechatId, sourcePost(row.source)?.title, row.source.entry, row.source.evidence].some(value => value?.toLowerCase().includes(filters.q.toLowerCase()))) return false;
    if (filters.month && !row.added.startsWith(filters.month)) return false;
    return !filters.stage || row.stage === filters.stage;
  }).sort((left, right) => right.added.localeCompare(left.added));
  return {
    count: rows.length,
    waiting: visible.filter(row => sourceStatus(row.source) === 'pending').length,
    rows: rows.map(row => ({
      id: row.id, name: row.name, wechatId: row.wechatId, added: row.added, source: row.source, post: sourcePost(row.source),
      directions: directionsOf(row), stage: row.stage,
      latestPayment: queue ? undefined : sortDate(activePayments(row))[0],
    })),
  };
}
function possibleDuplicate(a: Lead, b: Lead) {
  if (a.id === b.id) return false;
  if (a.wechatId && b.wechatId) return nameKey(a.wechatId) === nameKey(b.wechatId);
  return nameKey(a.name) === nameKey(b.name);
}
export function readLead(workspace: Workspace, id: string) {
  const lead = getLead(workspace.rows, id);
  return {
    id: lead.id, name: lead.name, wechatId: lead.wechatId, added: lead.added, source: lead.source, post: sourcePost(lead.source),
    directions: directionsOf(lead), stage: lead.stage, follows: sortDate(lead.follows), payments: sortDate(lead.payments), history: lead.history,
    duplicates: active(workspace.rows).filter(other => possibleDuplicate(lead, other))
      .map(other => ({ id: other.id, name: other.name, wechatId: other.wechatId, added: other.added })),
  };
}

function changeSource(lead: Lead, form: FormData, post?: Post) {
  const status = text(form, 'sourceStatus');
  if (status !== 'confirmed' && status !== 'unknown' && status !== 'other') throw new Error('请选择来源核对结果。');
  const version = text(form, 'version', 15);
  const entry = text(form, 'entry', 15);
  const otherEntry = status === 'other' ? text(form, 'otherEntry', 80) : '';
  const evidence = text(form, status === 'other' ? 'otherSource' : status === 'unknown' ? 'unknownNote' : 'evidence');
  if (status === 'confirmed') {
    if (!post || post.id !== text(form, 'postId') || (post.note ?? '') !== text(form, 'postNote', 24)) {
      throw new Error('请先选择要关联的帖子。');
    }
    if (version && post.version !== version) throw new Error('所选版本不属于这篇帖子。');
    if (!['仅确认帖子', '开口', '留资'].includes(entry)) throw new Error('请选择能确认的来源层级。');
    if ((entry !== '仅确认帖子' || version) && !evidence) throw new Error('请补充判断入口或版本的依据。');
  }
  if (status === 'other' && (!otherEntry || !evidence)) throw new Error('请填写入口和具体来源。');
  const previous = labelSource(lead.source);
  const next: Source = { status, ...(otherEntry ? { entry: otherEntry } : {}), ...(evidence ? { evidence } : {}) };
  if (next.status === 'confirmed' && post) Object.assign(next, { post, entry, ...(version ? { version } : {}) });
  lead.source = next;
  addHistory(lead, 'operator', `来源由「${previous}」更新为「${post && next.status === 'confirmed' ? post.title : sources[next.status]}」。`);
}
function mergeLead(workspace: Workspace, lead: Lead, duplicateId: string) {
  const duplicate = getLead(workspace.rows, duplicateId);
  if (!possibleDuplicate(lead, duplicate)) throw new Error('请选择待核对的重复登记。');
  if (lead.added > duplicate.added) lead.added = duplicate.added;
  lead.follows.push(...duplicate.follows);
  lead.payments.push(...duplicate.payments);
  lead.wechatId ||= duplicate.wechatId;
  const merged = new Map<string, Direction>();
  for (const item of [...directionsOf(lead), ...directionsOf(duplicate)]) {
    merged.set(JSON.stringify([item.need, item.subject, item.interest]), item);
  }
  Object.assign(lead, consultation([...merged.values()]));
  if (sourceStatus(lead.source) !== 'confirmed' && sourceStatus(duplicate.source) === 'confirmed') lead.source = duplicate.source;
  lead.stage = sortDate(lead.follows)[0]?.stage ?? lead.stage;
  duplicate.mergedTo = lead.id;
  lead.history.push(...duplicate.history);
  addHistory(lead, 'operator', '已合并同一客户的另一条登记。');
}
function consultation(directions: Direction[]) {
  const first = directions[0];
  return { directions, need: first?.need, subject: first?.subject, interest: first?.interest ?? '' };
}
function consultationFields(form: FormData, previous: Direction[] = []) {
  const kinds = form.getAll('need');
  const topics = form.getAll('subject');
  const products = form.getAll('interest');
  if (kinds.length !== topics.length || topics.length !== products.length) throw new Error('请检查咨询方向。');
  const options = new Set<string>(subjects);
  for (const item of previous) if (item.subject) options.add(item.subject);
  const directions = kinds.map((kind, index) => {
    const need = bounded(kind, 20) as Need;
    const subject = bounded(topics[index], 40);
    const interest = bounded(products[index], 70);
    if (need && !needs.includes(need)) throw new Error('请选择咨询类别。');
    if (subject && !options.has(subject)) throw new Error('请选择科目。');
    return { need: need || undefined, subject: subject || undefined, interest };
  });
  return consultation(directions.filter(item => item.need || item.subject || item.interest));
}
function contactFields(form: FormData) {
  const name = text(form, 'name', 40);
  const wechatId = text(form, 'wechatId', 64);
  if (!name) throw new Error('请填写微信名。');
  if (!wechatId) throw new Error('请填写微信号。');
  return { name, wechatId };
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
export function saveLead(workspace: Workspace, action: Action, form: FormData, post?: Post) {
  const requestId = text(form, 'requestId', 50);
  const key = action + ':' + requestId;
  const prior = requestId && workspace.receipts.get(key);
  if (prior) return prior;
  let id: string;
  if (action === 'create') {
    const contact = contactFields(form);
    const date = day(text(form, 'addedDay'), '添加日期');
    const time = text(form, 'addedTime', 5);
    if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error('请填写添加时间。');
    id = crypto.randomUUID();
    const lead: Lead = {
      id, ...contact, added: `${date}T${time}`, stage: 'new', ...consultationFields(form),
      source: { status: 'pending' }, follows: [], payments: [], history: [],
    };
    addHistory(lead, 'seller', '登记了客户。');
    workspace.rows.push(lead);
  } else {
    const lead = getLead(workspace.rows, text(form, 'leadId', 50));
    id = lead.id;
    switch (action) {
      case 'source': changeSource(lead, form, post); break;
      case 'merge': mergeLead(workspace, lead, text(form, 'duplicateId', 50)); break;
      case 'contact': {
        const contact = contactFields(form);
        if (contact.name !== lead.name) addHistory(lead, 'seller', `微信名由「${lead.name}」改为「${contact.name}」。`);
        if (contact.wechatId !== lead.wechatId) {
          addHistory(lead, 'seller', lead.wechatId ? `微信号由「${lead.wechatId}」改为「${contact.wechatId}」。` : '补填了微信号。');
        }
        Object.assign(lead, contact);
        break;
      }
      case 'follow': {
        const stage = text(form, 'stage') as Stage;
        if (!Object.hasOwn(stages, stage)) throw new Error('请选择跟进进度。');
        const follow = { stage, ...consultationFields(form, directionsOf(lead)) };
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

export function deleteLead(workspace: Workspace, id: string) {
  const lead = workspace.rows.find(row => row.id === id);
  if (!lead) return 'already-deleted';
  if (lead.mergedTo) return 'merged';

  // 合并保留了原记录，逐层移除属于当前档案的原登记。
  const removed = new Set([id]);
  for (const target of removed) {
    for (const row of workspace.rows) {
      if (row.mergedTo === target) removed.add(row.id);
    }
  }
  workspace.rows = workspace.rows.filter(row => !removed.has(row.id));
  return 'deleted';
}

export function readStats(workspace: Workspace, filters: Filters) {
  const today = salesToday();
  const month = filters.month || today.slice(0, 7);
  const rows = active(workspace.rows);
  const cohort = rows.filter(row => row.added.startsWith(month) && row.added.slice(0, 10) <= today);
  const hasFollow = (lead: Lead) => lead.follows.some(follow => follow.date <= today);
  const paid = (lead: Lead) => activePayments(lead).some(payment => payment.date <= today);
  const course = cohort.filter(row => directionsOf(row).some(item => item.need === '课程'));
  const followed = cohort.filter(hasFollow);
  const summary = {
    added: cohort.length,
    monthlyFollowed: rows.filter(row => row.follows.some(follow => follow.date.startsWith(month) && follow.date <= today)).length,
    monthlyPaid: rows.filter(row => activePayments(row).some(payment => payment.date.startsWith(month) && payment.date <= today)).length,
    followed: followed.length, paid: cohort.filter(paid).length, followedPaid: followed.filter(paid).length,
    course: course.length, courseFollowed: course.filter(hasFollow).length,
    unknownNeed: cohort.filter(row => !directionsOf(row).some(item => item.need)).length,
    unknownSource: cohort.filter(row => ['pending', 'unknown'].includes(sourceStatus(row.source))).length,
  };
  const mix = (values: string[][]) => {
    const counts = new Map<string, number>();
    for (const items of values) {
      for (const item of new Set(items.filter(Boolean))) counts.set(item, (counts.get(item) ?? 0) + 1);
    }
    return [...counts].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'zh'));
  };
  const groups = new Map<string, { post: Post; attributed: Lead[] }>();
  for (const row of cohort) {
    const post = sourcePost(row.source);
    if (!post) continue;
    const group = groups.get(post.id);
    if (group) group.attributed.push(row);
    else groups.set(post.id, { post, attributed: [row] });
  }
  const selected = filters.post ? rows.map(row => sourcePost(row.source)).find(post => post?.id === filters.post) : undefined;
  const selectedGroup = selected && (groups.get(selected.id) ?? { post: selected, attributed: [] });
  const visible = filters.post ? selectedGroup ? [selectedGroup] : [] :
    [...groups.values()].sort((a, b) => b.post.published.localeCompare(a.post.published));
  const postRows = visible.map(({ post, attributed }) => {
    return {
      post, added: attributed.length, followed: attributed.filter(hasFollow).length, paid: attributed.filter(paid).length,
      interests: mix(attributed.map(row => directionsOf(row).map(item => item.interest || item.need || ''))),
      products: mix(attributed.map(row => activePayments(row).filter(payment => payment.date <= today).map(payment => payment.product))),
    };
  });
  return { month, summary, postRows, selected };
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
