import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';

export const operationsContent = pgTable('operations_content', {
  id: uuid('id').defaultRandom().primaryKey(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const operationsContentVersion = pgTable(
  'operations_content_version',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    contentId: uuid('content_id').notNull().references(() => operationsContent.id, { onDelete: 'restrict' }),
    versionNumber: integer('version_number').notNull(),
    sourceVersionId: uuid('source_version_id').references(
      (): AnyPgColumn => operationsContentVersion.id,
      { onDelete: 'restrict' },
    ),
    workType: text('work_type').notNull(),
    contentName: text('content_name').notNull(),
    contentType: text('content_type').notNull(),
    revisionTypes: text('revision_types').array(),
    revisionSummary: text('revision_summary'),
    revisionGoal: text('revision_goal'),
    projectDocName: text('project_doc_name'),
    projectDocUrl: text('project_doc_url'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('operations_content_version_number_idx').on(table.contentId, table.versionNumber),
    index('operations_content_version_source_idx').on(table.sourceVersionId),
  ],
);

export const operationsContentSchedule = pgTable(
  'operations_content_schedule',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    contentVersionId: uuid('content_version_id').notNull().references(() => operationsContentVersion.id, { onDelete: 'restrict' }),
    syncToMoments: boolean('sync_to_moments').notNull().default(false),
    promotionStatus: text('promotion_status').notNull().default('none'),
    plannedPublishAt: timestamp('planned_publish_at', { withTimezone: true }).notNull(),
    actualPublishAt: timestamp('actual_publish_at', { withTimezone: true }),
    completionStatus: text('completion_status').notNull(),
    delayReason: text('delay_reason'),
    sourceKey: text('source_key'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('operations_schedule_version_idx').on(table.contentVersionId),
    index('operations_schedule_planned_at_idx').on(table.plannedPublishAt),
    index('operations_schedule_promotion_idx').on(table.promotionStatus),
    index('operations_schedule_completion_idx').on(table.completionStatus),
    uniqueIndex('operations_schedule_source_key_idx').on(table.sourceKey),
  ],
);

export type OperationsScheduleRow = typeof operationsContentSchedule.$inferSelect;
export type OperationsContentVersionRow = typeof operationsContentVersion.$inferSelect;
