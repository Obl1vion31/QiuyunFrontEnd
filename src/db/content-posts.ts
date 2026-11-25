import { eq, ilike, sql } from 'drizzle-orm';
import { effectiveCategoryName } from './content-config';
import { getDb } from './client';
import * as s from './schema';

const selection = {
  versionId: s.operationsContentVersion.id,
  cancelledAt: s.operationsContentSchedule.cancelledAt,
  id: s.operationsContentSchedule.id,
  contentId: s.operationsContent.id,
  name: s.operationsContentVersion.contentName,
  version: s.operationsContentVersion.versionNumber,
  subject: s.operationsSubject.name,
  category: effectiveCategoryName(s.operationsContentVersion.subjectId, s.operationsContentVersion.categoryId, s.operationsCategory.name),
  planned: s.operationsContentSchedule.plannedPublishAt,
  actual: s.operationsContentSchedule.actualPublishAt,
  promoted: s.operationsContentSchedule.isPromoted,
  status: s.operationsContentSchedule.promotionStatus,
  noteId: s.operationsContent.platformNoteId,
  document: s.operationsContentVersion.projectDocUrl,
  publication: s.operationsContentSchedule.publicationUrl,
  revision: s.operationsContentVersion.revisionSummary,
};

export function contentPosts() {
  return getDb().select(selection).from(s.operationsContentSchedule)
    .innerJoin(s.operationsContentVersion, eq(s.operationsContentVersion.id, s.operationsContentSchedule.contentVersionId))
    .innerJoin(s.operationsContent, eq(s.operationsContent.id, s.operationsContentVersion.contentId))
    .innerJoin(s.operationsSubject, eq(s.operationsSubject.id, s.operationsContentVersion.subjectId))
    .leftJoin(s.operationsCategory, eq(s.operationsCategory.id, s.operationsContentVersion.categoryId));
}

export function contentTitleMatch(query: string) {
  const pattern = '%'+query.replace(/[\\%_]/g,'\\$&')+'%';
  return ilike(s.operationsContentVersion.contentName, pattern);
}

export function contentNoteMatch(noteId: string) {
  return sql`(
    exists(select 1 from operations_version_note_id ni
      where ni.version_id = ${s.operationsContentVersion.id} and ni.platform_note_id = ${noteId})
    or (${s.operationsContent.platformNoteId} = ${noteId}
      and not exists(select 1 from operations_version_note_id ni where ni.version_id = ${s.operationsContentVersion.id}))
  )`;
}
