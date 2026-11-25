import { dateText, directionsOf, labelSource, monthLabel, people, salesHref, salesToday, sources, stages } from './model';
import type { Direction, Post, Source } from './model';
import type { readLead, readList, readStats } from './store';

export type LeadView = ReturnType<typeof readLead>;
export type ListView = ReturnType<typeof readList>;

export function escapeText(value: unknown) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character] ?? character);
}
const e = escapeText;
const status = (value: string, label: string) => `<span class="sales-status sales-status--${e(value)}">${e(label)}</span>`;
const pair = (label: string, value: string) => `<div><dt>${e(label)}</dt><dd>${e(value || '—')}</dd></div>`;
const directionText = (items: Direction[]) =>
  items.map(item => [item.need, item.subject, item.interest].filter(Boolean).join(' · ')).join(' / ');
const consultCell = (items: Direction[]) => {
  const content = directionText(items) || '待确认';
  return `<span class="sales-consultation-line" title="${e(content)}">${e(content)}</span>`;
};

function sourceCell(source: Source, post?: Post) {
  if (source.status !== 'confirmed' || !post) return status(source.status, sources[source.status]);
  return `<span class="sales-post-name" title="${e(post.title)}">${e(post.title)}</span>`;
}
export function listRows(list: ListView, queue: boolean, filtered: boolean) {
  if (!list.rows.length) {
    const title = queue ? '当前没有符合条件的来源记录' : filtered ? '未找到客户' : '还没有客户';
    const hint = filtered ? '可更改筛选条件后再查看。' : queue ? '' : '点右上角「登记微信」添加第一位客户。';
    return `<tr><td colspan="5" class="sales-empty"><strong>${title}</strong>${hint ? `<span>${hint}</span>` : ''}</td></tr>`;
  }
  return list.rows.map(row => `<tr data-inspector-key="${e(row.id)}">
    <td><div class="sales-contact-line">
      ${queue ? `<strong class="sales-row-title" title="${e(row.name)}">${e(row.name)}</strong>` :
        `<button class="sales-row-title" type="button" data-inspector-trigger title="${e(row.name)}">${e(row.name)}</button>`}
      ${row.wechatId ? `<span class="sales-wechat-id" title="${e(row.wechatId)}">${e(row.wechatId)}</span>` : ''}
    </div></td>
    <td><time class="sales-time" datetime="${e(row.added)}">${e(dateText(row.added))}</time></td>
    <td>${consultCell(row.directions)}</td>
    ${queue ? `
      <td>${sourceCell(row.source, row.post)}</td>
      <td><button class="sales-row-action" type="button" data-sales-sheet="source" aria-haspopup="dialog">${row.source.status === 'pending' ? '核对来源' : '更正来源'}</button></td>` :
      `<td><div class="sales-row-actions sales-follow-control">${status(row.stage, stages[row.stage])}
        <button class="sales-row-action" type="button" data-sales-sheet="follow" aria-haspopup="dialog">更新跟进</button></div></td>
      <td><div class="sales-row-actions">
        ${row.latestPayment ? status('won', '已成交') : ''}
        <button class="sales-row-action" type="button" data-sales-sheet="deal" aria-haspopup="dialog"
          ${row.latestPayment ? 'aria-label="更正成交"' : ''}>${row.latestPayment ? '更正' : '登记成交'}</button>
      </div></td>`}
  </tr>`).join('');
}
export function detailHeader(title: string, context: string) {
  return `<header><div><h2>${e(title)}</h2><p>${e(context)}</p></div><button type="button" data-close-inspector aria-label="关闭详情">×</button></header>`;
}
const detailFrame = (header: string, body: string, footer = '') => `${header}<div data-inspector-body class="sales-inspector-body">${body}</div>${footer}`;
const footer = (buttons: string) => `<footer class="business-inspector-actions"><div>${buttons}</div></footer>`;
const sheetButton = (target: string, label: string, primary = false) =>
  `<button type="button" class="business-action-${primary ? 'primary' : 'secondary'}" data-sales-sheet="${target}">${label}</button>`;

export function leadSummary(lead: ListView['rows'][number] | undefined) {
  if (!lead) return detailFrame(detailHeader('客户详情', ''), '');
  return detailFrame(detailHeader(lead.name, ''), `<section><h3>客户资料</h3><dl>${pair('添加微信', dateText(lead.added))}${pair('来源', labelSource(lead.source, lead.post))}</dl></section>`);
}
export function leadDetail(lead: LeadView) {
  const header = detailHeader(lead.name, '');
  const basic = `<section><div class="sales-inspector-heading"><h3>客户资料</h3>
    <button class="sales-text-action" type="button" data-sales-sheet="contact">${lead.wechatId ? '编辑微信信息' : '补填微信号'}</button></div>
    <dl>${pair('微信号', lead.wechatId || '待补填')}${pair('添加微信', dateText(lead.added))}
    ${lead.directions.map((item, index) => pair(index === 0 ? '咨询方向' : '', directionText([item]))).join('')}</dl></section>`;
  const source = `<section><h3>来源</h3>
    <dl>${pair('核对结果', labelSource(lead.source, lead.post))}${lead.source.version ? pair('确认版本', lead.source.version) : ''}${lead.source.entry ? pair(lead.source.status === 'other' ? '入口' : '确认依据', lead.source.entry) : ''}
    ${lead.post ? pair('实发时间', dateText(lead.post.published)) + pair('帖子类型', postType(lead.post)) : ''}
    ${lead.post?.promotion ? pair('推广记录', lead.post.promotion.name + ' · ' + lead.post.promotion.stage) : ''}
    ${lead.source.evidence ? pair(lead.source.status === 'other' ? '具体来源' : '核对说明', lead.source.evidence) : ''}</dl>
    ${lead.post ? `<a class="sales-text-action" href="${e(salesHref('posts', { post: lead.post.id }))}">查看样例发布资料</a>` : ''}
  </section>`;
  const history = lead.history.length ? `<details class="sales-history"><summary>业务历史 (${lead.history.length})</summary>
    <ol>${lead.history.map(item => `<li><strong>${e(item.text)}</strong><small>${e(dateText(item.at))} · ${e(people[item.actor])}</small></li>`).join('')}</ol></details>` : '';
  const duplicates = lead.duplicates.length ? `<section class="sales-duplicate-note"><div class="sales-inspector-heading"><h3>疑似重复登记 (${lead.duplicates.length})</h3>
    <button class="sales-text-action" type="button" data-sales-sheet="merge">核对合并</button></div>
    <p>核实是同一个人后，可合并到当前档案。</p></section>` : '';
  const follows = lead.follows.length ? `<section><h3>跟进记录 (${lead.follows.length})</h3><ol class="sales-record-timeline">${lead.follows.map(item =>
    `<li><time>${e(item.date)}</time><span class="sales-reply">${e(stages[item.stage])}</span>
    ${directionsOf(item).map(direction => `<p>${e(directionText([direction]))}</p>`).join('')}</li>`).join('')}</ol></section>` : '';
  const active = lead.payments.filter(payment => !payment.voided);
  const payments = active.length ? `<section><h3>成交记录 (${active.length})</h3><ol class="sales-record-timeline">
    ${active.map(item => `<li><time>${e(item.date)}</time>${item.product ? `<p>${e(item.product)}</p>` : ''}</li>`).join('')}</ol></section>` : '';
  return detailFrame(header, basic + duplicates + follows + payments + source + history,
    footer(sheetButton('follow', '更新跟进') + sheetButton('deal', active.length ? '更正成交' : '登记成交', true)));
}
export const postType = (post: Post) => post.type === '推广' ? '推广帖' : '非推广';
export function detailFeedback(kind: 'loading' | 'error') {
  return kind === 'loading'
    ? '<p class="sales-inspector-feedback" role="status">正在读取详情…</p>'
    : '<p class="sales-inspector-feedback" role="alert">详情暂时未能读取。 <button type="button" class="sales-text-action" data-sales-retry>重试</button></p>';
}
export function postChoice(post: Post) {
  return `<label class="sales-post-choice"><input type="radio" name="candidate" value="${e(post.id)}"><span><strong>${e(post.title)}</strong>
    <small>${e(post.subject)} · ${e(postType(post))} · ${e(dateText(post.published))}</small></span></label>`;
}

const rate = (count: number, total: number) => total
  ? (count / total * 100).toLocaleString('zh-CN', { maximumFractionDigits: 1 }) + '%' : '—';

export function statsContent(stats: ReturnType<typeof readStats>, view: 'monthly' | 'cohort' | 'posts', post?: Post) {
  const { summary, month } = stats;
  const caption = `${monthLabel(month)}${view === 'monthly' ? ' · 按行为发生日期' : '新增 · 截至 ' + salesToday()}`;
  if (view === 'posts') {
    const products = (items: { label: string; count: number }[]) => items.length
      ? items.map(item => `<span class="sales-mix-value">${e(item.label)} <b>${item.count}</b></span>`).join('') : '—';
    return `<div class="sales-section-heading"><div><h1>${e(post?.title ?? '按帖复盘')}</h1><p>${e(caption)} · 试用样例</p></div>
      ${post ? `<a class="sales-text-action" href="${e(salesHref('posts', { month }))}">查看全部帖子</a>` : `<span class="sales-meta">待核对或未确认来源 ${summary.unknownSource} 人</span>`}</div>
      ${post ? `<dl class="sales-post-facts sales-post-overview">${pair('实发时间', dateText(post.published))}
        ${pair('笔记 ID', post.note)}${pair('内容版本', post.versions.join(' / '))}
        ${post.promotion ? pair('推广记录', post.promotion.name + ' · ' + post.promotion.stage) : ''}</dl>` : ''}
      <div class="sales-data-surface"><div class="sales-table-wrap"><table class="sales-table sales-post-stats">
        <thead><tr><th scope="col">帖子</th><th scope="col">新增微信</th><th scope="col">已跟进</th><th scope="col">已付款</th><th scope="col">变现率</th><th scope="col">意向产品</th><th scope="col">成交产品</th></tr></thead>
        <tbody>${stats.postRows.map(row => `<tr>
          <th scope="row"><a class="sales-text-action" href="${e(salesHref('posts', { post: row.post.id, month }))}">${e(row.post.title)}</a><small>${e(row.post.subject)} · ${e(row.post.type)}</small></th>
          <td>${row.added}</td><td>${row.followed}</td><td>${row.paid}</td><td>${rate(row.paid, row.added)}${row.added ? `<small>${row.paid} / ${row.added} 人</small>` : ''}</td>
          <td>${products(row.interests)}</td><td>${products(row.products)}</td></tr>`).join('')}</tbody>
      </table></div></div>`;
  }
  const title = view === 'monthly' ? '当月销售结果' : '新增客户后续结果';
  const cards = view === 'monthly' ? [
    ['新增微信', summary.added, '按首次添加日期'],
    ['已跟进客户', summary.monthlyFollowed, '按跟进登记日期'],
    ['确认付款', summary.monthlyPaid, '按实际付款日期'],
  ] : [
    ['变现率', rate(summary.paid, summary.added), `${summary.paid} / ${summary.added} 人`],
    ['跟进后成交率', rate(summary.followedPaid, summary.followed), `${summary.followedPaid} / ${summary.followed} 位已跟进客户`],
    ['课程跟进率', rate(summary.courseFollowed, summary.course), `${summary.courseFollowed} / ${summary.course} 位课程意向客户`],
  ];
  return `<div class="sales-section-heading"><div><h1>${title}</h1><p>${e(caption)}</p></div></div>
    <div class="sales-stat-band" aria-label="${title}">
      ${cards.map(([label, value, description]) => `<div><span>${e(label)}</span><strong>${e(value)}</strong><small>${e(description)}</small></div>`).join('')}
    </div>
    ${view === 'cohort' ? `<dl class="sales-cohort-counts">
      <div><dt>新增</dt><dd>${summary.added}</dd></div><div><dt>已跟进</dt><dd>${summary.followed}</dd></div>
      <div><dt>已付款</dt><dd>${summary.paid}</dd></div><div><dt>咨询方向待确认</dt><dd>${summary.unknownNeed}</dd></div></dl>` : ''}`;
}
