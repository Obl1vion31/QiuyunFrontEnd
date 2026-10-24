export const publicationLabels = { unpublished: '待发布', published: '已发送' };
export const publicationState = schedule => schedule.actualPublishAt ? 'published' : 'unpublished';

export function mayKeepEmptyPublicationLink(schedule, actual = schedule.actualPublishAt) {
  const cutoff = new Date('2026-10-17T00:00:00+08:00');
  return Boolean(schedule.actualPublishAt && actual && !schedule.publicationUrl
    && new Date(schedule.actualPublishAt) < cutoff && new Date(actual) < cutoff);
}
