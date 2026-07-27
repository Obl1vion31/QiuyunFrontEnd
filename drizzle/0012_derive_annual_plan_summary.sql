ALTER TABLE "operations_annual_plan"
ADD COLUMN "counts_toward_promotion" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
UPDATE "operations_annual_plan"
SET
  "counts_toward_promotion" = true,
  "current_version_number" = "current_version_number" + 1,
  "updated_at" = now()
WHERE "year" = 2026
  AND (
    ("subject_id" = 'tmua' AND "category_id" IN (
      'small-class-or-tutoring',
      'promotional-handout',
      'large-class',
      'mock-exam',
      'intensive-course'
    ))
    OR
    ("subject_id" = 'step' AND "category_id" IN (
      'small-class-or-tutoring',
      'promotional-handout',
      'large-class',
      'mock-exam'
    ))
    OR
    ("subject_id" = 'interview' AND "category_id" IN (
      'interview-course',
      'promotional-handout'
    ))
  );
--> statement-breakpoint
INSERT INTO "operations_annual_plan_version" (
  "plan_id",
  "version_number",
  "snapshot",
  "change_summary",
  "diff_summary",
  "changed_by_label"
)
SELECT
  plan."id",
  plan."current_version_number",
  jsonb_build_object(
    'schemaVersion', 3,
    'row', jsonb_build_object(
      'year', plan."year",
      'sectionKey', plan."section_key",
      'sectionLabel', plan."section_label",
      'subjectId', plan."subject_id",
      'subjectName', subject."name",
      'rowName', plan."row_name",
      'categoryId', plan."category_id",
      'categoryName', category."name",
      'courseName', plan."course_name",
      'note', plan."note",
      'sortOrder', plan."sort_order",
      'isActive', plan."is_active",
      'countsTowardPromotion', plan."counts_toward_promotion"
    ),
    'blocks', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'startMonth', block."start_month",
        'endMonth', block."end_month",
        'label', block."label",
        'ruleType', block."rule_type",
        'monthlyFrequency', block."monthly_frequency",
        'quantityParts', block."quantity_parts",
        'note', block."note",
        'sortOrder', block."sort_order"
      ) ORDER BY block."sort_order", block."start_month")
      FROM "operations_annual_plan_block" AS block
      WHERE block."plan_id" = plan."id"
    ), '[]'::jsonb),
    'links', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'label', link."label",
        'url', link."url",
        'sortOrder', link."sort_order"
      ) ORDER BY link."sort_order")
      FROM "operations_annual_plan_link" AS link
      WHERE link."plan_id" = plan."id"
    ), '[]'::jsonb)
  ),
  '设置自动推广周期汇总范围',
  '["修改推广周期汇总标记"]'::jsonb,
  'system-summary-initialization'
FROM "operations_annual_plan" AS plan
LEFT JOIN "operations_subject" AS subject ON subject."id" = plan."subject_id"
LEFT JOIN "operations_category" AS category ON category."id" = plan."category_id"
WHERE plan."year" = 2026
  AND plan."counts_toward_promotion" = true;
