import {
  boolean,
  bigint,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// 内部账号与业务事实分开保存，两个角色共享团队数据。
export const authUser = pgTable('auth_user', {
  id: text('id').primaryKey(), name: text('name').notNull(), email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false), image: text('image'),
  username: text('username').notNull().unique(), displayUsername: text('display_username'),
  role: text('role').$type<'admin' | 'employee'>().notNull().default('employee'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [check('auth_user_role_check', sql`${table.role} IN ('admin', 'employee')`)]);

export const authSession = pgTable('auth_session', {
  id: text('id').primaryKey(), userId: text('user_id').notNull().references(() => authUser.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(), expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  ipAddress: text('ip_address'), userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [index('auth_session_user_idx').on(table.userId)]);

export const authAccount = pgTable('auth_account', {
  id: text('id').primaryKey(), userId: text('user_id').notNull().references(() => authUser.id, { onDelete: 'cascade' }),
  accountId: text('account_id').notNull(), providerId: text('provider_id').notNull(), password: text('password'),
  accessToken: text('access_token'), refreshToken: text('refresh_token'), idToken: text('id_token'), scope: text('scope'),
  accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [index('auth_account_user_idx').on(table.userId), uniqueIndex('auth_account_provider_idx').on(table.providerId, table.accountId)]);

export const authVerification = pgTable('auth_verification', {
  id: text('id').primaryKey(), identifier: text('identifier').notNull(), value: text('value').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [index('auth_verification_identifier_idx').on(table.identifier)]);

export const authRateLimit = pgTable('auth_rate_limit', {
  id: text('id').primaryKey(), key: text('key').notNull().unique(), count: integer('count').notNull(),
  lastRequest: bigint('last_request', { mode: 'number' }).notNull(),
}, table => [index('auth_rate_limit_last_request_idx').on(table.lastRequest)]);

// 业务权限只作用于现有账号，不授予角色或账号管理权限。
export const operationsAccountPermission = pgTable('operations_account_permission', {
  userId: text('user_id').notNull().references(() => authUser.id, { onDelete: 'cascade' }),
  operation: text('operation').notNull(),
  mode: text('mode').$type<'disabled' | 'direct' | 'review'>().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [primaryKey({ columns: [table.userId, table.operation] }), check('operations_permission_mode_check', sql`${table.mode} IN ('disabled','direct','review')`)]);

export const operationsPermissionAudit = pgTable('operations_permission_audit', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: text('user_id').notNull().references(() => authUser.id, { onDelete: 'restrict' }),
  before: jsonb('before').$type<Record<string,string>>().notNull(),
  after: jsonb('after').$type<Record<string,string>>().notNull(),
  changedById: text('changed_by_id').notNull(), changedByLabel: text('changed_by_label').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const operationsChangeProposal = pgTable('operations_change_proposal', {
  id: uuid('id').defaultRandom().primaryKey(),
  requestedById: text('requested_by_id').notNull().references(() => authUser.id, { onDelete: 'restrict' }),
  requestedByLabel: text('requested_by_label').notNull(),
  module: text('module').$type<'annual' | 'schedule'>().notNull(), target: text('target').notNull(),
  operations: jsonb('operations').$type<string[]>().notNull(),
  path: text('path').notNull(), method: text('method').notNull(), contentType: text('content_type').notNull(), body: text('body').notNull(),
  fingerprint: text('fingerprint').notNull(), requestKey: text('request_key').notNull().unique(),
  before: jsonb('before').$type<Record<string,unknown>>().notNull(),
  after: jsonb('after').$type<Record<string,unknown>>().notNull(),
  status: text('status').$type<'pending' | 'approved' | 'rejected' | 'obsolete'>().notNull().default('pending'),
  result: jsonb('result').$type<Record<string,unknown>>(),
  decisionReason: text('decision_reason'), decidedById: text('decided_by_id'), decidedByLabel: text('decided_by_label'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
}, table => [index('operations_proposal_status_idx').on(table.status), index('operations_proposal_owner_idx').on(table.requestedById),
  check('operations_proposal_status_check', sql`${table.status} IN ('pending','approved','rejected','obsolete')`)]);

export interface LegacyAnnualPlanSnapshot {
  schemaVersion: 2 | 3;
  row: {
    year: number;
    sectionKey: string;
    sectionLabel: string;
    subjectId: string | null;
    subjectName: string | null;
    rowName: string;
    categoryId: string | null;
    categoryName: string | null;
    courseName: string | null;
    note: string | null;
    sortOrder: number;
    isActive: boolean;
    countsTowardPromotion?: boolean;
  };
  blocks: Array<{
    startMonth: number;
    endMonth: number;
    label: string;
    ruleType: 'flexible' | 'fixed' | null;
    monthlyFrequency: number | null;
    quantityParts: number[] | null;
    note: string | null;
    sortOrder: number;
  }>;
  links: Array<{
    label: string;
    url: string;
    sortOrder: number;
  }>;
}

export interface AnnualPlanSnapshotV4 {
  schemaVersion: 4;
  row: LegacyAnnualPlanSnapshot['row'];
  blocks: Array<{
    startSlot: number;
    endSlot: number;
    label: string;
    note: string;
    promotionRanges: Array<{ startSlot: number; endSlot: number }>;
    sortOrder: number;
  }>;
  links: LegacyAnnualPlanSnapshot['links'];
}
export type AnnualPlanSnapshot = LegacyAnnualPlanSnapshot | AnnualPlanSnapshotV4;

export const operationsSubject = pgTable('operations_subject', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  sortOrder: integer('sort_order').notNull(),
});

export const operationsCategory = pgTable('operations_category', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  sortOrder: integer('sort_order').notNull(),
});

export const operationsSubjectCategory = pgTable(
  'operations_subject_category',
  {
    subjectId: text('subject_id').notNull().references(() => operationsSubject.id, { onDelete: 'restrict' }),
    categoryId: text('category_id').notNull().references(() => operationsCategory.id, { onDelete: 'restrict' }),
  },
  (table) => [
    primaryKey({ columns: [table.subjectId, table.categoryId] }),
    index('operations_subject_category_category_idx').on(table.categoryId),
  ],
);

export const operationsAnnualPlanYear = pgTable('operations_annual_plan_year', {
  year: integer('year').primaryKey(),
  instructions: text('instructions'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check('operations_annual_plan_year_number_check', sql`${table.year} BETWEEN 2000 AND 9999`),
]);

export const operationsAnnualPlan = pgTable(
  'operations_annual_plan',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    year: integer('year').notNull(),
    sectionKey: text('section_key').notNull(),
    sectionLabel: text('section_label').notNull(),
    subjectId: text('subject_id').references(() => operationsSubject.id, { onDelete: 'restrict' }),
    rowName: text('row_name').notNull(),
    categoryId: text('category_id').references(() => operationsCategory.id, { onDelete: 'restrict' }),
    courseName: text('course_name'),
    note: text('note'),
    sortOrder: integer('sort_order').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    countsTowardPromotion: boolean('counts_toward_promotion').notNull().default(false),
    currentVersionNumber: integer('current_version_number').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('operations_annual_plan_row_identity_idx').on(table.year, table.sectionKey, table.rowName),
    index('operations_annual_plan_year_section_sort_idx').on(table.year, table.sectionKey, table.sortOrder),
    foreignKey({
      name: 'operations_annual_plan_subject_category_fk',
      columns: [table.subjectId, table.categoryId],
      foreignColumns: [operationsSubjectCategory.subjectId, operationsSubjectCategory.categoryId],
    }).onDelete('restrict'),
    check('operations_annual_plan_year_check', sql`${table.year} BETWEEN 2000 AND 9999`),
    check('operations_annual_plan_version_check', sql`${table.currentVersionNumber} >= 0`),
    check(
      'operations_annual_plan_section_subject_check',
      sql`(${table.subjectId} IS NOT NULL OR ${table.categoryId} IS NULL)`,
    ),
  ],
);

export const operationsAnnualPlanBlock = pgTable(
  'operations_annual_plan_block',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    planId: uuid('plan_id').notNull().references(() => operationsAnnualPlan.id, { onDelete: 'cascade' }),
    startSlot: integer('start_slot'),
    endSlot: integer('end_slot'),
    promotionRanges: jsonb('promotion_ranges').$type<Array<{ startSlot: number; endSlot: number }>>(),
    startMonth: integer('start_month').notNull(),
    endMonth: integer('end_month').notNull(),
    label: text('label').notNull(),
    ruleType: text('rule_type'),
    monthlyFrequency: integer('monthly_frequency'),
    quantityParts: integer('quantity_parts').array(),
    note: text('note'),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (table) => [
    index('operations_annual_plan_block_plan_sort_idx').on(table.planId, table.sortOrder),
    check('operations_annual_plan_block_slot_check', sql`(${table.startSlot} IS NULL AND ${table.endSlot} IS NULL AND ${table.promotionRanges} IS NULL) OR (${table.startSlot} IS NOT NULL AND ${table.endSlot} IS NOT NULL AND ${table.promotionRanges} IS NOT NULL AND ${table.startSlot} BETWEEN 1 AND 24 AND ${table.endSlot} BETWEEN ${table.startSlot} AND 24)`),
    check(
      'operations_annual_plan_block_month_check',
      sql`${table.startMonth} BETWEEN 1 AND 12 AND ${table.endMonth} BETWEEN ${table.startMonth} AND 12`,
    ),
    check(
      'operations_annual_plan_block_rule_check',
      sql`(
        (${table.ruleType} IS NULL AND ${table.monthlyFrequency} IS NULL AND ${table.quantityParts} IS NULL)
        OR
        (${table.ruleType} = 'flexible' AND ${table.monthlyFrequency} > 0 AND ${table.quantityParts} IS NULL)
        OR
        (${table.ruleType} = 'fixed' AND ${table.monthlyFrequency} IS NULL
          AND cardinality(${table.quantityParts}) > 0 AND 0 < ALL(${table.quantityParts}))
      )`,
    ),
  ],
);

export const operationsAnnualPlanLink = pgTable(
  'operations_annual_plan_link',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    planId: uuid('plan_id').notNull().references(() => operationsAnnualPlan.id, { onDelete: 'cascade' }),
    label: text('label').notNull(),
    url: text('url').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (table) => [
    index('operations_annual_plan_link_plan_idx').on(table.planId, table.sortOrder),
  ],
);

export const operationsAnnualPlanVersion = pgTable(
  'operations_annual_plan_version',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    planId: uuid('plan_id').notNull().references(() => operationsAnnualPlan.id, { onDelete: 'restrict' }),
    versionNumber: integer('version_number').notNull(),
    snapshot: jsonb('snapshot').$type<AnnualPlanSnapshot>().notNull(),
    changeSummary: text('change_summary').notNull(),
    diffSummary: jsonb('diff_summary').$type<string[]>().notNull(),
    changedByLabel: text('changed_by_label').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('operations_annual_plan_version_number_idx').on(table.planId, table.versionNumber),
    index('operations_annual_plan_version_created_idx').on(table.planId, table.createdAt),
    check('operations_annual_plan_version_number_check', sql`${table.versionNumber} >= 0`),
  ],
);

export const operationsContent = pgTable('operations_content', {
  id: uuid('id').defaultRandom().primaryKey(),
  platformNoteId: text('platform_note_id').unique(),
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
    subjectId: text('subject_id').notNull().references(() => operationsSubject.id, { onDelete: 'restrict' }),
    categoryId: text('category_id').references(() => operationsCategory.id, { onDelete: 'restrict' }),
    revisionSummary: text('revision_summary'),
    projectDocName: text('project_doc_name'),
    projectDocUrl: text('project_doc_url'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('operations_content_version_number_idx').on(table.contentId, table.versionNumber),
    index('operations_content_version_source_idx').on(table.sourceVersionId),
    foreignKey({
      name: 'operations_content_version_subject_category_fk',
      columns: [table.subjectId, table.categoryId],
      foreignColumns: [operationsSubjectCategory.subjectId, operationsSubjectCategory.categoryId],
    }).onDelete('restrict'),
    check(
      'operations_content_version_category_required_check',
      sql`(${table.categoryId} IS NOT NULL OR ${table.subjectId} = 'interview')`,
    ),
  ],
);

export const operationsContentSchedule = pgTable(
  'operations_content_schedule',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    contentVersionId: uuid('content_version_id').notNull().references(() => operationsContentVersion.id, { onDelete: 'restrict' }),
    syncToMoments: boolean('sync_to_moments').notNull().default(false),
    isPromoted: boolean('is_promoted').notNull().default(false),
    promotionStatus: text('promotion_status').notNull().default('none'),
    promotionDeferredThrough: date('promotion_deferred_through'),
    plannedPublishAt: timestamp('planned_publish_at', { withTimezone: true }).notNull(),
    planRevision: integer('plan_revision').notNull().default(0),
    planEffectiveAt: timestamp('plan_effective_at', { withTimezone: true }),
    delayThresholdHours: integer('delay_threshold_hours').notNull().default(2),
    actualPublishAt: timestamp('actual_publish_at', { withTimezone: true }),
    publicationUrl: text('publication_url'),
    publicationRevision: integer('publication_revision').notNull().default(0),
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
    index('operations_schedule_is_promoted_idx').on(table.isPromoted),
    index('operations_schedule_completion_idx').on(table.completionStatus),
    uniqueIndex('operations_schedule_source_key_idx').on(table.sourceKey),
    check(
      'operations_schedule_promotion_consistency_check',
      sql`(
        (${table.isPromoted} = false AND ${table.promotionStatus} = 'none')
        OR
        (${table.isPromoted} = true AND ${table.promotionStatus} IN (
          'pending', 'awaiting_promotion', 'testing', 'test_paused', 'test_pending', 'scaling', 'scaling_paused', 'waiting_action', 'ended', 'test_discarded', 'formal_discarded'
        ))
      )`,
    ),
  ],
);

// 预约与实发分别留痕；预约时间永远不充当 actual_publish_at。
export const operationsPublicationReservation = pgTable('operations_publication_reservation', {
  id: uuid('id').defaultRandom().primaryKey(),
  scheduleId: uuid('schedule_id').notNull().references(() => operationsContentSchedule.id, { onDelete: 'restrict' }),
  planRevision: integer('plan_revision').notNull(),
  scheduledPublishAt: timestamp('scheduled_publish_at', { withTimezone: true }).notNull(),
  requestKey: uuid('request_key').notNull().unique(),
  history:jsonb('history').$type<Array<{status:string;actorId:string;actorLabel:string;at:string;reason:string|null}>>().notNull().default([]),
  status: text('status').$type<'pending'|'approved'|'rejected'|'cancelled'|'obsolete'|'fulfilled'>().notNull(),
  requestedById: text('requested_by_id').notNull(),
  requestedByLabel: text('requested_by_label').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  decidedById: text('decided_by_id'),
  decidedByLabel: text('decided_by_label'),
  decisionReason: text('decision_reason'),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  uniqueIndex('operations_reservation_active_idx').on(table.scheduleId).where(sql`${table.status} IN ('pending','approved')`),
  index('operations_reservation_schedule_idx').on(table.scheduleId,table.createdAt),
  index('operations_reservation_due_idx').on(table.status,table.scheduledPublishAt),
  check('operations_reservation_status_check',sql`${table.status} IN ('pending','approved','rejected','cancelled','obsolete','fulfilled')`),
]);

export const operationsPublicationEvent = pgTable('operations_publication_event', {
  id: uuid('id').defaultRandom().primaryKey(),
  scheduleId: uuid('schedule_id').notNull().references(() => operationsContentSchedule.id, { onDelete: 'restrict' }),
  revision: integer('revision').notNull(),
  before: jsonb('before').$type<{actualPublishAt:string|null;publicationUrl:string|null;projectDocUrl:string|null}>().notNull(),
  after: jsonb('after').$type<{actualPublishAt:string;publicationUrl:string|null;projectDocUrl:string|null}>().notNull(),
  reason: text('reason'),
  changedById: text('changed_by_id').notNull(),
  changedByLabel: text('changed_by_label').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [uniqueIndex('operations_publication_event_revision_idx').on(table.scheduleId,table.revision)]);

// 改期关闭旧排期计时段；逐日理由依然归属当时的排期修订，不随新日期覆盖。
export const operationsSchedulePlanHistory = pgTable('operations_schedule_plan_history', {
  id: uuid('id').defaultRandom().primaryKey(),
  scheduleId: uuid('schedule_id').notNull().references(() => operationsContentSchedule.id, { onDelete: 'restrict' }),
  revision: integer('revision').notNull(),
  plannedPublishAt: timestamp('planned_publish_at', { withTimezone: true }).notNull(),
  effectiveAt: timestamp('effective_at', { withTimezone: true }),
  delayThresholdHours: integer('delay_threshold_hours').notNull().default(2),
  endedAt: timestamp('ended_at', { withTimezone: true }).notNull(),
  newPlannedPublishAt: timestamp('new_planned_publish_at', { withTimezone: true }).notNull(),
  reason: text('reason').notNull(),
  changedById: text('changed_by_id').notNull(),
  changedByLabel: text('changed_by_label').notNull(),
}, table => [uniqueIndex('operations_plan_history_revision_idx').on(table.scheduleId, table.revision)]);

export const operationsScheduleChangeRequest = pgTable('operations_schedule_change_request', {
  id: uuid('id').defaultRandom().primaryKey(),
  scheduleId: uuid('schedule_id').notNull().references(() => operationsContentSchedule.id, { onDelete: 'restrict' }),
  planRevision: integer('plan_revision').notNull(),
  originalPlannedPublishAt: timestamp('original_planned_publish_at', { withTimezone: true }).notNull(),
  requestedPublishAt: timestamp('requested_publish_at', { withTimezone: true }).notNull(),
  reason: text('reason').notNull(),
  status: text('status').$type<'pending' | 'approved' | 'rejected' | 'obsolete'>().notNull().default('pending'),
  requestedById: text('requested_by_id').notNull(),
  requestedByLabel: text('requested_by_label').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  decidedById: text('decided_by_id'),
  decidedByLabel: text('decided_by_label'),
  decisionReason: text('decision_reason'),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
}, table => [
  uniqueIndex('operations_change_request_pending_idx').on(table.scheduleId).where(sql`${table.status} = 'pending'`),
  index('operations_change_request_status_idx').on(table.status),
  check('operations_change_request_status_check', sql`${table.status} IN ('pending','approved','rejected','obsolete')`),
]);

export const operationsScheduleDelayReason = pgTable('operations_schedule_delay_reason', {
  id: uuid('id').defaultRandom().primaryKey(),
  scheduleId: uuid('schedule_id').notNull().references(() => operationsContentSchedule.id, { onDelete: 'restrict' }),
  planRevision: integer('plan_revision').notNull(),
  dayNumber: integer('day_number').notNull(),
  dueAt: timestamp('due_at', { withTimezone: true }).notNull(),
  responsibility: text('responsibility').$type<'self' | 'external' | 'requester' | 'unknown'>().notNull(),
  reason: text('reason').notNull(),
  source: text('source').$type<'manual' | 'historical'>().notNull().default('manual'),
  changedById: text('changed_by_id'),
  changedByLabel: text('changed_by_label').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  history: jsonb('history').$type<Array<Record<string, unknown>>>().notNull().default([]),
}, table => [
  uniqueIndex('operations_delay_reason_day_idx').on(table.scheduleId, table.planRevision, table.dayNumber),
  check('operations_delay_reason_day_check', sql`${table.dayNumber} > 0`),
  check('operations_delay_reason_responsibility_check', sql`${table.responsibility} IN ('self','external','requester','unknown')`),
  check('operations_delay_reason_source_check', sql`${table.source} IN ('manual','historical')`),
  check('operations_delay_reason_text_check', sql`length(trim(${table.reason})) > 0`),
]);

export const operationsNonPromotionCheckpointEvent = pgTable('operations_non_promotion_checkpoint_event', {
  id: uuid('id').defaultRandom().primaryKey(),
  sequence: bigint('sequence', { mode: 'number' }).generatedAlwaysAsIdentity().notNull(),
  scheduleId: uuid('schedule_id').notNull().references(() => operationsContentSchedule.id, { onDelete: 'restrict' }),
  checkpointType: text('checkpoint_type').$type<'day_7' | 'day_15'>().notNull(),
  action: text('action').$type<'skip' | 'restore'>().notNull(),
  reason: text('reason').notNull(),
  changedById: text('changed_by_id').notNull(),
  changedByLabel: text('changed_by_label').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  index('operations_checkpoint_event_schedule_idx').on(table.scheduleId, table.checkpointType, table.createdAt),
  check('operations_checkpoint_event_type_check', sql`${table.checkpointType} IN ('day_7','day_15')`),
  check('operations_checkpoint_event_action_check', sql`${table.action} IN ('skip','restore')`),
]);

export const operationsPromotionCampaign = pgTable(
  'operations_promotion_campaign',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    scheduleId: uuid('schedule_id').notNull().references(() => operationsContentSchedule.id, { onDelete: 'cascade' }),
    startedOn: date('started_on').notNull(),
    initialStage: text('initial_stage').notNull().default('testing'),
    dailyReviewEnabledOn: date('daily_review_enabled_on').notNull().default(sql`(now() AT TIME ZONE 'Asia/Shanghai')::date`),
    endedOn: date('ended_on'),
    currentStage: text('current_stage'),
    currentStatus: text('current_status').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('operations_promotion_campaign_schedule_idx').on(table.scheduleId),
    index('operations_promotion_campaign_status_idx').on(table.currentStatus),
    check('operations_promotion_initial_stage_check', sql`${table.initialStage} IN ('testing', 'scaling')`),
    check(
      'operations_promotion_campaign_status_check',
      sql`${table.currentStatus} IN ('testing', 'test_paused', 'test_pending', 'scaling', 'scaling_paused', 'waiting_action', 'ended', 'test_discarded', 'formal_discarded')`,
    ),
    check(
      'operations_promotion_campaign_stage_check',
      sql`(
        (${table.currentStatus} IN ('testing','test_paused','test_pending') AND ${table.currentStage} = 'testing')
        OR (${table.currentStatus} IN ('scaling','scaling_paused') AND ${table.currentStage} = 'scaling')
        OR (${table.currentStatus} = 'waiting_action' AND ${table.currentStage} IN ('testing', 'scaling'))
        OR (${table.currentStatus} IN ('ended', 'test_discarded', 'formal_discarded') AND ${table.currentStage} IS NULL)
      )`,
    ),
    check(
      'operations_promotion_campaign_dates_check',
      sql`${table.endedOn} IS NULL OR ${table.endedOn} >= ${table.startedOn}`,
    ),
  ],
);

export const operationsPromotionStage = pgTable(
  'operations_promotion_stage',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    campaignId: uuid('campaign_id').notNull().references(() => operationsPromotionCampaign.id, { onDelete: 'cascade' }),
    stageType: text('stage_type').notNull(),
    startedOn: date('started_on').notNull(),
    endedOn: date('ended_on'),
    outcome: text('outcome'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('operations_promotion_stage_campaign_idx').on(table.campaignId, table.startedOn),
    uniqueIndex('operations_promotion_stage_one_open_idx')
      .on(table.campaignId)
      .where(sql`${table.endedOn} IS NULL`),
    check('operations_promotion_stage_type_check', sql`${table.stageType} IN ('testing', 'scaling')`),
    check(
      'operations_promotion_stage_outcome_check',
      sql`${table.outcome} IS NULL OR ${table.outcome} IN ('continued', 'paused', 'start_scaling', 'test_discarded', 'scaling_continued', 'ended', 'formal_discarded')`,
    ),
    check(
      'operations_promotion_stage_dates_check',
      sql`${table.endedOn} IS NULL OR ${table.endedOn} >= ${table.startedOn}`,
    ),
  ],
);

// 首次推广安排归属排期；尚未开始时不虚建 Campaign 或零指标。
export const operationsPromotionStartPlan = pgTable('operations_promotion_start_plan', {
  scheduleId: uuid('schedule_id').primaryKey().references(() => operationsContentSchedule.id, { onDelete: 'restrict' }),
  waitingThrough: date('waiting_through'),
  plannedOn: date('planned_on'),
  plannedStage: text('planned_stage').$type<'testing' | 'scaling'>(),
  revision: integer('revision').notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [check('operations_promotion_start_plan_pair_check', sql`(${table.plannedOn} IS NULL) = (${table.plannedStage} IS NULL) AND (${table.plannedStage} IS NULL OR ${table.plannedStage} IN ('testing','scaling')) AND (${table.plannedOn} IS NULL OR ${table.waitingThrough} IS NULL OR ${table.plannedOn} > ${table.waitingThrough})`)]);

export const operationsPromotionDayDecision = pgTable('operations_promotion_day_decision', {
  id: uuid('id').defaultRandom().primaryKey(),
  campaignId: uuid('campaign_id').notNull().references(() => operationsPromotionCampaign.id, { onDelete: 'restrict' }),
  businessDate: date('business_date').notNull(),
  actualStatus: text('actual_status'),
  reason: text('reason'),
  stageType: text('stage_type').$type<'testing' | 'scaling'>().notNull(),
}, table => [uniqueIndex('operations_promotion_day_decision_date_idx').on(table.campaignId, table.businessDate), check('operations_promotion_day_decision_stage_check', sql`${table.stageType} IN ('testing','scaling')`)]);

// 更正前的事实及被归档的冲突记录保留于私有审计，不覆盖冻结快照。
export const operationsPromotionTimelineAudit = pgTable('operations_promotion_timeline_audit', {
  id: uuid('id').defaultRandom().primaryKey(),
  scheduleId: uuid('schedule_id').notNull().references(() => operationsContentSchedule.id, { onDelete: 'restrict' }),
  requestKey: uuid('request_key').notNull().unique(),
  businessDate: date('business_date').notNull(),
  action: text('action').notNull(),
  reason: text('reason').notNull(),
  before: jsonb('before').$type<Record<string, unknown>>().notNull(),
  after: jsonb('after').$type<Record<string, unknown>>().notNull(),
  changedById: text('changed_by_id').notNull(),
  changedByLabel: text('changed_by_label').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [index('operations_promotion_timeline_schedule_idx').on(table.scheduleId, table.createdAt)]);

export const operationsPromotionDailyMetric = pgTable(
  'operations_promotion_daily_metric',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    campaignId: uuid('campaign_id').notNull().references(() => operationsPromotionCampaign.id, { onDelete: 'cascade' }),
    metricDate: date('metric_date').notNull(),
    dailyStatus: text('daily_status').notNull().default('active'),
    actualStatusSnapshot: text('actual_status_snapshot'),
    recordKind: text('record_kind').notNull().default('regular'),
    sourceStageStartedOn: date('source_stage_started_on'),
    stageTypeSnapshot: text('stage_type_snapshot').notNull(),
    spend: numeric('spend', { precision: 12, scale: 2 }).notNull(),
    clickRate: numeric('click_rate', { precision: 7, scale: 4 }),
    platformOpenCount: integer('platform_open_count').notNull(),
    actualOpenCount: integer('actual_open_count').notNull(),
    platformLeadCount: integer('platform_lead_count').notNull(),
    actualLeadCount: integer('actual_lead_count').notNull(),
    reviewDecision: text('review_decision').notNull(),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }).notNull().defaultNow(),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('operations_promotion_daily_campaign_date_idx').on(table.campaignId, table.metricDate),
    index('operations_promotion_daily_date_idx').on(table.metricDate),
    check('operations_promotion_daily_stage_check', sql`${table.stageTypeSnapshot} IN ('testing', 'scaling')`),
    check('operations_promotion_daily_status_check', sql`${table.dailyStatus} IN ('active', 'waiting_action')`),
    check('operations_promotion_daily_spend_check', sql`${table.spend} >= 0`),
    check(
      'operations_promotion_daily_click_rate_check',
      sql`${table.clickRate} IS NULL OR ${table.clickRate} BETWEEN 0 AND 100`,
    ),
    check(
      'operations_promotion_daily_counts_check',
      sql`${table.platformOpenCount} >= 0
        AND ${table.actualOpenCount} >= 0
        AND ${table.platformLeadCount} >= 0
        AND ${table.actualLeadCount} >= 0`,
    ),
    check('operations_promotion_daily_decision_check', sql`${table.reviewDecision} IN ('test_continue','wait_continue','test_discarded','start_scaling','scaling_continue','formal_discarded','ended','test_pause','test_pending','scaling_pause')`),
    check('operations_promotion_daily_kind_check', sql`${table.recordKind} IN ('regular','test_residual') AND (${table.recordKind} <> 'test_residual' OR (${table.stageTypeSnapshot}='testing' AND ${table.sourceStageStartedOn} IS NOT NULL AND ${table.reviewDecision}='test_discarded'))`),
    check('operations_promotion_daily_actual_status_check', sql`${table.actualStatusSnapshot} IS NULL OR ${table.actualStatusSnapshot} IN ('testing','test_paused','test_pending','scaling','scaling_paused','test_discarded','formal_discarded','ended')`),
  ],
);

/** 明确的历史等待区间，不用虚构零指标表达未投放。 */
export const operationsPromotionHold = pgTable('operations_promotion_hold', {
  id: uuid('id').defaultRandom().primaryKey(),
  campaignId: uuid('campaign_id').notNull().references(() => operationsPromotionCampaign.id, { onDelete: 'restrict' }),
  startedOn: date('started_on').notNull(),
  endedOn: date('ended_on').notNull(),
  stageType: text('stage_type').notNull(),
  resumeStage: text('resume_stage').notNull(),
  reason: text('reason').notNull(),
  sourceKey: text('source_key').unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  uniqueIndex('operations_promotion_hold_campaign_start_idx').on(table.campaignId, table.startedOn),
  check('operations_promotion_hold_dates_check', sql`${table.endedOn} >= ${table.startedOn}`),
  check('operations_promotion_hold_stages_check', sql`${table.stageType} IN ('testing','scaling') AND ${table.resumeStage} IN ('testing','scaling')`),
]);

/** 团队共用节假日暂停；实际生效状态按服务端时间计算，不依赖定时任务。 */
export const operationsPromotionPause = pgTable('operations_promotion_pause', {
  id: uuid('id').defaultRandom().primaryKey(),
  requestKey: uuid('request_key').notNull().unique(),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
  resumedAt: timestamp('resumed_at', { withTimezone: true }),
  reason: text('reason').notNull(),
  revision: integer('revision').notNull().default(0),
  createdById: text('created_by_id').notNull(),
  createdByLabel: text('created_by_label').notNull(),
  updatedById: text('updated_by_id').notNull(),
  updatedByLabel: text('updated_by_label').notNull(),
  history: jsonb('history').$type<Array<{ at: string; actor: string; action: string; endsAt: string }>>().notNull().default([]),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [check('operations_promotion_pause_dates_check', sql`${table.endsAt} > ${table.startsAt} AND (${table.resumedAt} IS NULL OR ${table.resumedAt} >= ${table.startsAt})`)]);

export const operationsPromotionPauseTarget = pgTable('operations_promotion_pause_target', {
  id: uuid('id').defaultRandom().primaryKey(),
  pauseId: uuid('pause_id').notNull().references(() => operationsPromotionPause.id, { onDelete: 'restrict' }),
  campaignId: uuid('campaign_id').notNull().references(() => operationsPromotionCampaign.id, { onDelete: 'restrict' }),
  stageType: text('stage_type').notNull(),
}, table => [
  uniqueIndex('operations_promotion_pause_target_unique').on(table.pauseId, table.campaignId),
  check('operations_promotion_pause_target_stage_check', sql`${table.stageType} IN ('testing','scaling')`),
]);

export interface WeeklyMeetingDraft {
  workflowVersion?:5;
  hasRevisionDraft?:boolean;
  candidatesConfirmed?:boolean;
  finalizationStage?:'pre'|'post';
  promotionDecisions?:Record<string,string>;
  nonPromotionInputs?:Record<string,{mode?:'record'|'skip';editing?:boolean;clickRate?:string;threeSecondReadRate?:string;recordedThrough?:string;conclusion?:string;platformNoteId?:string;reason?:string}>;
  schemaVersion: 2 | 3 | 4;
  promotionSelections?: string[];
  materialFingerprint?: string;
  materialSnapshot?: Record<string, unknown>;
  situation?: string;
  strategy?: string;
  promotionSnapshotIds?: string[];
  temporaryNotes?: string;
  temporaryLinks?: Array<{ label: string; url: string }>;
  attachmentIds?: string[];
  coreConclusion: string;
  nextAction: string;
  promotionInputs: Record<string, { confirmed?:boolean; rateRange?:{from:string;through:string}|null; rateNeedsReview?:boolean; clickRate: number | null; recordedThrough: string; currentSituation: string; activeAction: string }>;
  issues: Array<{ id?: string; problem: string; conclusion: string; status: 'pending' | 'validating' | 'resolved' | 'paused' }>;
  nonPromotionSelections: Array<{ scheduleId: string; checkpointType: 'day_7' | 'day_15' }>;
}

export const operationsReviewMeeting = pgTable(
  'operations_review_meeting',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    periodStart: date('period_start').notNull(),
    periodEnd: date('period_end').notNull(),
    meetingAt: timestamp('meeting_at', { withTimezone: true }).notNull(),
    status: text('status').notNull().default('draft'),
    meetingType: text('meeting_type').notNull().default('weekly'),
    currentVersionNumber: integer('current_version_number').notNull().default(0),
    draftSnapshot: jsonb('draft_snapshot').$type<WeeklyMeetingDraft>().notNull().default({ schemaVersion: 2, coreConclusion: '', nextAction: '', promotionInputs: {}, issues: [], nonPromotionSelections: [] }),
    finalizedAt: timestamp('finalized_at', { withTimezone: true }),
    createdByLabel: text('created_by_label').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('operations_review_meeting_at_idx').on(table.meetingAt),
    check('operations_review_meeting_range_check', sql`${table.periodEnd} >= ${table.periodStart}`),
    check('operations_review_meeting_status_check', sql`${table.status} IN ('draft', 'completed')`),
    check('operations_review_meeting_type_check', sql`${table.meetingType} IN ('weekly', 'monthly')`),
    check('operations_review_meeting_version_check', sql`${table.currentVersionNumber} >= 0`),
  ],
);

export const operationsReviewMeetingVersion = pgTable('operations_review_meeting_version', {
  id: uuid('id').defaultRandom().primaryKey(),
  meetingId: uuid('meeting_id').notNull().references(() => operationsReviewMeeting.id, { onDelete: 'restrict' }),
  versionNumber: integer('version_number').notNull(),
  snapshot: jsonb('snapshot').$type<Record<string, unknown>>().notNull(),
  changeSummary: text('change_summary').notNull(),
  finalizedByLabel: text('finalized_by_label').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('operations_review_meeting_version_idx').on(table.meetingId, table.versionNumber),
  check('operations_review_meeting_version_number_check', sql`${table.versionNumber} >= 0`),
]);

export const operationsReviewActionItem = pgTable('operations_review_action_item', {
  id: uuid('id').defaultRandom().primaryKey(),
  problem: text('problem').notNull(),
  status: text('status').notNull().default('pending'),
  createdMeetingId: uuid('created_meeting_id').notNull().references(() => operationsReviewMeeting.id, { onDelete: 'restrict' }),
  resolvedMeetingId: uuid('resolved_meeting_id').references(() => operationsReviewMeeting.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('operations_review_action_status_idx').on(table.status, table.updatedAt),
  check('operations_review_action_status_check', sql`${table.status} IN ('pending', 'validating', 'resolved', 'paused')`),
]);

export const operationsReviewActionProgress = pgTable('operations_review_action_progress', {
  id: uuid('id').defaultRandom().primaryKey(),
  itemId: uuid('item_id').notNull().references(() => operationsReviewActionItem.id, { onDelete: 'cascade' }),
  meetingId: uuid('meeting_id').notNull().references(() => operationsReviewMeeting.id, { onDelete: 'restrict' }),
  conclusion: text('conclusion').notNull(),
  statusSnapshot: text('status_snapshot').notNull(),
  recordedByLabel: text('recorded_by_label').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('operations_review_action_progress_meeting_idx').on(table.itemId, table.meetingId),
  check('operations_review_action_progress_status_check', sql`${table.statusSnapshot} IN ('pending', 'validating', 'resolved', 'paused')`),
]);

export const operationsContentPerformanceMetric = pgTable(
  'operations_content_performance_metric',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    scheduleId: uuid('schedule_id').notNull().references(() => operationsContentSchedule.id, { onDelete: 'restrict' }),
    checkpointType: text('checkpoint_type').notNull(),
    recordedThrough: date('recorded_through').notNull(),
    clickRate: numeric('click_rate', { precision: 7, scale: 4 }).notNull(),
    threeSecondReadRate: numeric('three_second_read_rate', { precision: 7, scale: 4 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('operations_content_metric_schedule_checkpoint_idx').on(table.scheduleId, table.checkpointType),
    index('operations_content_metric_checkpoint_idx').on(table.checkpointType),
    check('operations_content_metric_checkpoint_check', sql`${table.checkpointType} IN ('day_7', 'day_15')`),
    check('operations_content_metric_click_check', sql`${table.clickRate} BETWEEN 0 AND 100`),
    check('operations_content_metric_read_check', sql`${table.threeSecondReadRate} BETWEEN 0 AND 100`),
  ],
);

export const operationsNonPromotionReview = pgTable(
  'operations_non_promotion_review',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    scheduleId: uuid('schedule_id').notNull().references(() => operationsContentSchedule.id, { onDelete: 'restrict' }),
    metricId: uuid('metric_id').notNull().references(() => operationsContentPerformanceMetric.id, { onDelete: 'restrict' }),
    checkpointType: text('checkpoint_type').notNull(),
    actualPublishAtSnapshot: timestamp('actual_publish_at_snapshot', { withTimezone: true }).notNull(),
    subjectIdSnapshot: text('subject_id_snapshot').notNull(),
    subjectNameSnapshot: text('subject_name_snapshot').notNull(),
    categoryIdSnapshot: text('category_id_snapshot'),
    categoryNameSnapshot: text('category_name_snapshot'),
    contentNameSnapshot: text('content_name_snapshot').notNull(),
    clickRateSnapshot: numeric('click_rate_snapshot', { precision: 7, scale: 4 }).notNull(),
    threeSecondReadRateSnapshot: numeric('three_second_read_rate_snapshot', { precision: 7, scale: 4 }).notNull(),
    cohortSnapshot: jsonb('cohort_snapshot').$type<Record<string, unknown>>().notNull(),
    conclusion: text('conclusion'),
    cause: text('cause'),
    nextAction: text('next_action'),
    reviewedByLabel: text('reviewed_by_label').notNull(),
    currentVersionNumber: integer('current_version_number').notNull().default(0),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('operations_non_promotion_review_checkpoint_idx').on(table.scheduleId, table.checkpointType),
    index('operations_non_promotion_review_reviewed_idx').on(table.reviewedAt),
    check('operations_non_promotion_review_checkpoint_check', sql`${table.checkpointType} IN ('day_7', 'day_15')`),
    check('operations_non_promotion_review_version_check', sql`${table.currentVersionNumber} >= 0`),
  ],
);

export const operationsNonPromotionReviewVersion = pgTable('operations_non_promotion_review_version', {
  id: uuid('id').defaultRandom().primaryKey(),
  reviewId: uuid('review_id').notNull().references(() => operationsNonPromotionReview.id, { onDelete: 'restrict' }),
  versionNumber: integer('version_number').notNull(),
  snapshot: jsonb('snapshot').$type<Record<string, unknown>>().notNull(),
  changeSummary: text('change_summary').notNull(),
  changedByLabel: text('changed_by_label').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('operations_non_promotion_review_version_idx').on(table.reviewId, table.versionNumber),
  check('operations_non_promotion_review_version_number_check', sql`${table.versionNumber} >= 0`),
]);

export const operationsScheduleUsageEvent = pgTable(
  'operations_schedule_usage_event',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    scheduleId: uuid('schedule_id').notNull().references(() => operationsContentSchedule.id, { onDelete: 'restrict' }),
    fromUsage: text('from_usage').notNull(),
    toUsage: text('to_usage').notNull(),
    effectiveOn: date('effective_on').notNull(),
    reason: text('reason').notNull(),
    changedByLabel: text('changed_by_label').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('operations_schedule_usage_event_schedule_idx').on(table.scheduleId, table.effectiveOn),
    check('operations_schedule_usage_event_usage_check', sql`${table.fromUsage} IN ('promotion', 'non_promotion') AND ${table.toUsage} IN ('promotion', 'non_promotion') AND ${table.fromUsage} <> ${table.toUsage}`),
  ],
);

export const operationsCategoryPolicyVersion = pgTable(
  'operations_category_policy_version',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    categoryId: text('category_id').notNull().references(() => operationsCategory.id, { onDelete: 'restrict' }),
    versionNumber: integer('version_number').notNull(),
    displayName: text('display_name').notNull(),
    defaultIsPromoted: boolean('default_is_promoted').notNull().default(false),
    isSelectable: boolean('is_selectable').notNull().default(true),
    requiresNonPromotionReview: boolean('requires_non_promotion_review').notNull().default(true),
    effectiveOn: date('effective_on').notNull(),
    changeSummary: text('change_summary').notNull(),
    changedByLabel: text('changed_by_label').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('operations_category_policy_version_idx').on(table.categoryId, table.versionNumber),
    index('operations_category_policy_effective_idx').on(table.categoryId, table.effectiveOn),
    check('operations_category_policy_version_check', sql`${table.versionNumber} >= 1`),
  ],
);

export type OperationsScheduleRow = typeof operationsContentSchedule.$inferSelect;
export type OperationsContentVersionRow = typeof operationsContentVersion.$inferSelect;

/** 待定截止日只触发下一步提醒；明确决定后才恢复，不生成日度指标。 */
export const operationsPromotionWaitRange = pgTable('operations_promotion_wait_range', {
  id: uuid('id').defaultRandom().primaryKey(),
  campaignId: uuid('campaign_id').notNull().references(() => operationsPromotionCampaign.id, { onDelete: 'restrict' }),
  requestKey: uuid('request_key').notNull().unique(),
  startedOn: date('started_on').notNull(),
  endedOn: date('ended_on').notNull(),
  stageType: text('stage_type').notNull(),
  reason: text('reason').notNull(),
  nextDecision: text('next_decision'),
  nextEffectiveOn: date('next_effective_on'),
  revision: integer('revision').notNull().default(0),
  history: jsonb('history').$type<Array<Record<string, unknown>>>().notNull().default([]),
  updatedByLabel: text('updated_by_label').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  uniqueIndex('operations_promotion_wait_start_idx').on(table.campaignId, table.startedOn),
  check('operations_promotion_wait_dates_check', sql`${table.endedOn} >= ${table.startedOn} AND (${table.nextEffectiveOn} IS NULL OR ${table.nextEffectiveOn} > ${table.endedOn})`),
  check('operations_promotion_wait_stage_check', sql`${table.stageType} IN ('testing','scaling')`),
  check('operations_promotion_wait_decision_check', sql`(${table.nextDecision} IS NULL AND ${table.nextEffectiveOn} IS NULL) OR (${table.nextDecision} IS NOT NULL AND ${table.nextEffectiveOn} IS NOT NULL AND ((${table.stageType} = 'testing' AND ${table.nextDecision} IN ('test_continue','start_scaling','test_discarded')) OR (${table.stageType} = 'scaling' AND ${table.nextDecision} IN ('scaling_continue','formal_discarded','ended'))))`),
]);

export const operationsPromotionStageReview = pgTable('operations_promotion_stage_review', {
  id: uuid('id').defaultRandom().primaryKey(),
  requestKey: uuid('request_key').notNull().unique(),
  name: text('name').notNull(),
  periodStart: date('period_start').notNull(),
  periodEnd: date('period_end').notNull(),
  createdByLabel: text('created_by_label').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [check('operations_promotion_stage_review_dates_check', sql`${table.periodEnd} >= ${table.periodStart}`)]);

export const operationsPromotionStageReviewVersion = pgTable('operations_promotion_stage_review_version', {
  id: uuid('id').defaultRandom().primaryKey(),
  reviewId: uuid('review_id').notNull().references(() => operationsPromotionStageReview.id, { onDelete: 'restrict' }),
  versionNumber: integer('version_number').notNull(),
  snapshot: jsonb('snapshot').$type<Record<string, unknown>>().notNull(),
  createdByLabel: text('created_by_label').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [uniqueIndex('operations_promotion_stage_review_version_idx').on(table.reviewId, table.versionNumber), check('operations_promotion_stage_review_version_number_check', sql`${table.versionNumber} >= 0`)]);

/** 图片私有存储，仅经登录保护接口读取；不将二进制加载进例会列表。 */
export const operationsMeetingAttachment = pgTable('operations_meeting_attachment', {
  id: uuid('id').defaultRandom().primaryKey(),
  meetingId: uuid('meeting_id').notNull().references(() => operationsReviewMeeting.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  mimeType: text('mime_type').notNull(),
  byteLength: integer('byte_length').notNull(),
  base64: text('base64').notNull(),
  createdByLabel: text('created_by_label').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [check('operations_meeting_attachment_size_check', sql`${table.byteLength} > 0 AND ${table.byteLength} <= 3145728`), check('operations_meeting_attachment_type_check', sql`${table.mimeType} IN ('image/png','image/jpeg','image/webp')`)]);
