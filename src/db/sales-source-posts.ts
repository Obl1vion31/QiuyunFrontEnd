import { and, desc, inArray, lte, or, sql, type SQL } from 'drizzle-orm';
import type { Post } from '../sales-trial/model';
import { businessDate, businessDateTime } from '../scripts/business-date';
import { getDb } from './client';
import { contentNoteMatch, contentPosts, contentTitleMatch } from './content-posts';
import { readVersionNotes } from './note-identities';
import { noteIdOn } from './note-identity-rules';
import { extractPublicationLink, publicationNoteId } from './publication-link.mjs';
import { resolvePublicationNote } from './publication-note-link';
import { promotionLabels } from './promotion-state.mjs';
import { promotionActualLabels } from './promotion-successors.mjs';
import * as s from './schema';

const pageSize = 20;

function linkKey(value?: string | null) {
  const { url } = extractPublicationLink(value);
  if (!url) return '';
  const link = new URL(url);
  return link.hostname.replace(/^www[.]/, '') + link.pathname.replace(/\/$/, '');
}

function matchNote(noteId: string) {
  // A non-promotional release can have a public URL before it has a registered note ID.
  const noteInLink = String.raw`https?://(www\.)?xiaohongshu\.com/(explore|discovery/item)/${noteId}([/?#[:space:]]|$)`;
  return or(contentNoteMatch(noteId), sql`${s.operationsContentSchedule.publicationUrl} ~* ${noteInLink}`);
}

export async function searchSalesSourcePosts(query: string, offset: number) {
  if (!query) return { rows: [], next: null };
  const db = getDb();
  const now = new Date();
  const searchRows = (matches: SQL | undefined) => contentPosts()
    .where(and(lte(s.operationsContentSchedule.actualPublishAt, now), matches))
    .orderBy(desc(s.operationsContentSchedule.actualPublishAt), s.operationsContentSchedule.id)
    .limit(pageSize + 1).offset(offset);

  const containsLink = /https?:\/\//i.test(query);
  const link = containsLink ? extractPublicationLink(query).url : '';
  let noteId = link ? publicationNoteId(link) : /^[a-f0-9]{24}$/i.test(query) ? query.toLowerCase() : null;
  let shortKey = link && !noteId ? linkKey(link) : '';
  let recorded: Awaited<ReturnType<typeof searchRows>> = [];
  if (shortKey) {
    // The stored share URL is already evidence. Resolve externally only when it has not been recorded.
    const plainLink = (column: SQL) =>
      sql`regexp_replace(regexp_replace(split_part(split_part(${column}, '?', 1), '#', 1), '^https?://(www[.])?', '', 'i'), '/$', '')`;
    recorded = await searchRows(or(
      sql`${plainLink(sql`${s.operationsContentSchedule.publicationUrl}`)} = ${shortKey}`,
      sql`exists(select 1 from operations_version_note_id ni where ni.version_id = ${s.operationsContentVersion.id}
        and ${plainLink(sql`ni.publication_url`)} = ${shortKey})`,
    ));
  }
  if (containsLink && !noteId && !recorded.length) {
    noteId = (await resolvePublicationNote(query)).noteId;
    shortKey = '';
  }
  const found = recorded.length ? recorded : await searchRows(noteId ? matchNote(noteId) : contentTitleMatch(query.slice(0, 120)));

  const visible = found.slice(0, pageSize);
  if (!visible.length) return { rows: [], next: null };
  const [notes, campaigns] = await Promise.all([
    readVersionNotes(db, visible.map(post => post.versionId)),
    db.select({
      scheduleId: s.operationsPromotionCampaign.scheduleId,
      from: s.operationsPromotionCampaign.startedOn,
      status: s.operationsPromotionCampaign.currentStatus,
    }).from(s.operationsPromotionCampaign)
      .where(inArray(s.operationsPromotionCampaign.scheduleId, visible.map(post => post.id)))
      .orderBy(s.operationsPromotionCampaign.startedOn, s.operationsPromotionCampaign.id),
  ]);
  const latestCampaign = new Map(campaigns.map(row => [row.scheduleId, row]));
  const today = businessDate(now);
  const rows: Post[] = visible.map(row => {
    const periods = notes.get(row.versionId)?.periods ?? [];
    const savedLink = extractPublicationLink(row.publication).url;
    const linkId = publicationNoteId(savedLink);
    const currentNote = noteIdOn(periods, today) ?? linkId;
    const matchedPeriod = shortKey ? periods.findLast(period => linkKey(period.publicationUrl) === shortKey) : undefined;
    const note = noteId ?? matchedPeriod?.platformNoteId ?? currentNote;
    const knownLink = matchedPeriod?.publicationUrl ??
      periods.findLast(period => period.platformNoteId === note && period.publicationUrl)?.publicationUrl;
    const currentLink = !noteId || (linkId ? linkId === noteId : currentNote === noteId) ? savedLink : '';
    const campaign = latestCampaign.get(row.id);
    const status = campaign?.status ?? row.status;
    return {
      id: row.id,
      title: row.name,
      subject: row.subject,
      type: row.promoted || campaign ? '推广' : '非推广',
      note,
      published: businessDateTime(row.actual!),
      plannedMonth: businessDate(row.planned).slice(0, 7),
      version: 'V' + row.version,
      publication: extractPublicationLink(knownLink).url || currentLink,
      ...(campaign ? { promotion: (promotionActualLabels[status] ?? promotionLabels[status] ?? '已登记推广') + ' · ' + campaign.from + ' 开始' } : {}),
    };
  });
  return { rows, next: found.length > pageSize ? offset + pageSize : null };
}
