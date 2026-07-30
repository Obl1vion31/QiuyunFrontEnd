import {
  boolean,
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

export interface AnnualPlanSnapshot {
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
      sql`((${table.subjectId} IN ('tmua', 'step') AND ${table.categoryId} IS NOT NULL) OR ${table.subjectId} = 'interview')`,
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
    index('operations_schedule_is_promoted_idx').on(table.isPromoted),
    index('operations_schedule_completion_idx').on(table.completionStatus),
    uniqueIndex('operations_schedule_source_key_idx').on(table.sourceKey),
    check(
      'operations_schedule_promotion_consistency_check',
      sql`(
        (${table.isPromoted} = false AND ${table.promotionStatus} = 'none')
        OR
        (${table.isPromoted} = true AND ${table.promotionStatus} IN (
          'pending', 'testing', 'scaling', 'ended', 'test_discarded', 'formal_discarded'
        ))
      )`,
    ),
  ],
);

export const operationsPromotionCampaign = pgTable(
  'operations_promotion_campaign',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    scheduleId: uuid('schedule_id').notNull().references(() => operationsContentSchedule.id, { onDelete: 'cascade' }),
    startedOn: date('started_on').notNull(),
    endedOn: date('ended_on'),
    currentStage: text('current_stage'),
    currentStatus: text('current_status').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('operations_promotion_campaign_schedule_idx').on(table.scheduleId),
    index('operations_promotion_campaign_status_idx').on(table.currentStatus),
    check(
      'operations_promotion_campaign_status_check',
      sql`${table.currentStatus} IN ('testing', 'scaling', 'ended', 'test_discarded', 'formal_discarded')`,
    ),
    check(
      'operations_promotion_campaign_stage_check',
      sql`(
        (${table.currentStatus} = 'testing' AND ${table.currentStage} = 'testing')
        OR (${table.currentStatus} = 'scaling' AND ${table.currentStage} = 'scaling')
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
    check('operations_promotion_stage_type_check', sql`${table.stageType} IN ('testing', 'scaling')`),
    check(
      'operations_promotion_stage_outcome_check',
      sql`${table.outcome} IS NULL OR ${table.outcome} IN ('continued', 'start_scaling', 'test_discarded', 'scaling_continued', 'ended', 'formal_discarded')`,
    ),
    check(
      'operations_promotion_stage_dates_check',
      sql`${table.endedOn} IS NULL OR ${table.endedOn} >= ${table.startedOn}`,
    ),
  ],
);

export const operationsPromotionDailyMetric = pgTable(
  'operations_promotion_daily_metric',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    campaignId: uuid('campaign_id').notNull().references(() => operationsPromotionCampaign.id, { onDelete: 'cascade' }),
    metricDate: date('metric_date').notNull(),
    stageTypeSnapshot: text('stage_type_snapshot').notNull(),
    spend: numeric('spend', { precision: 12, scale: 2 }).notNull(),
    clickRate: numeric('click_rate', { precision: 7, scale: 4 }).notNull(),
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
    check('operations_promotion_daily_spend_check', sql`${table.spend} >= 0`),
    check('operations_promotion_daily_click_rate_check', sql`${table.clickRate} BETWEEN 0 AND 100`),
    check(
      'operations_promotion_daily_counts_check',
      sql`${table.platformOpenCount} >= 0
        AND ${table.actualOpenCount} >= 0
        AND ${table.platformLeadCount} >= 0
        AND ${table.actualLeadCount} >= 0`,
    ),
    check(
      'operations_promotion_daily_decision_check',
      sql`(
        (${table.stageTypeSnapshot} = 'testing' AND ${table.reviewDecision} IN ('test_continue', 'test_discarded', 'start_scaling'))
        OR
        (${table.stageTypeSnapshot} = 'scaling' AND ${table.reviewDecision} IN ('scaling_continue', 'formal_discarded', 'ended'))
      )`,
    ),
  ],
);

export type OperationsScheduleRow = typeof operationsContentSchedule.$inferSelect;
export type OperationsContentVersionRow = typeof operationsContentVersion.$inferSelect;
