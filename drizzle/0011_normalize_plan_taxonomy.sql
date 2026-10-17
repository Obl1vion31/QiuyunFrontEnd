INSERT INTO "operations_category" ("id", "name", "sort_order")
VALUES ('interview-preparation-guide', '面试准备须知', 150);
--> statement-breakpoint
INSERT INTO "operations_subject_category" ("subject_id", "category_id")
VALUES ('interview', 'interview-preparation-guide');
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "operations_content_version"
    WHERE "subject_id" = 'interview' AND "category_id" = 'exam-guide'
  ) THEN
    RAISE EXCEPTION '面试课已有备考须知内容，必须先确认分类转换';
  END IF;
END
$$;
--> statement-breakpoint
UPDATE "operations_annual_plan_block" AS block
SET "label" = CASE plan."row_name"
  WHEN 'TMUA 小班课/1对1' THEN 'TMUA 小班课和一对一'
  WHEN 'TMUA 出分【帖集】' THEN 'TMUA 喜报'
  WHEN 'TMUA 创新' THEN 'TMUA 创新帖'
  WHEN 'STEP 小班课/1对1' THEN 'STEP 小班课和一对一'
  WHEN 'STEP 出分【帖集】' THEN 'STEP 喜报'
  WHEN 'STEP 创新' THEN 'STEP 创新帖'
  WHEN '面试 第一时间跟进【帖集】' THEN '面试课 喜报'
  WHEN '面试 准备须知【帖集】' THEN '面试课 面试准备须知'
  WHEN '面试课 创新' THEN '面试课 创新帖'
  ELSE block."label"
END
FROM "operations_annual_plan" AS plan
WHERE block."plan_id" = plan."id"
  AND plan."year" = 2026
  AND plan."row_name" IN (
    'TMUA 小班课/1对1',
    'TMUA 非推广讲义帖【帖集】',
    'TMUA 考试信息【帖集】',
    'TMUA 第一时间解析【帖集】',
    'TMUA 出分【帖集】',
    'TMUA 备考须知【帖集】',
    'TMUA 创新',
    'STEP 小班课/1对1',
    'STEP 非推广讲义帖【帖集】',
    'STEP 第一时间解析【帖集】',
    'STEP 出分【帖集】',
    'STEP 备考须知【帖集】',
    'STEP 创新',
    '面试 第一时间跟进【帖集】',
    '相关学校 面试时间线',
    '面试 准备须知【帖集】',
    '面试课 创新'
  );
--> statement-breakpoint
UPDATE "operations_annual_plan"
SET
  "row_name" = CASE "row_name"
    WHEN 'TMUA 小班课/1对1' THEN 'TMUA 小班课和一对一'
    WHEN 'TMUA 非推广讲义帖【帖集】' THEN 'TMUA 非推广讲义帖 [帖集]'
    WHEN 'TMUA 考试信息【帖集】' THEN 'TMUA 考试信息 [帖集]'
    WHEN 'TMUA 第一时间解析【帖集】' THEN 'TMUA 第一时间解析 [帖集]'
    WHEN 'TMUA 出分【帖集】' THEN 'TMUA 喜报 [帖集]'
    WHEN 'TMUA 备考须知【帖集】' THEN 'TMUA 备考须知 [帖集]'
    WHEN 'TMUA 创新' THEN 'TMUA 创新帖'
    WHEN 'STEP 小班课/1对1' THEN 'STEP 小班课和一对一'
    WHEN 'STEP 非推广讲义帖【帖集】' THEN 'STEP 非推广讲义帖 [帖集]'
    WHEN 'STEP 第一时间解析【帖集】' THEN 'STEP 第一时间解析 [帖集]'
    WHEN 'STEP 出分【帖集】' THEN 'STEP 喜报 [帖集]'
    WHEN 'STEP 备考须知【帖集】' THEN 'STEP 备考须知 [帖集]'
    WHEN 'STEP 创新' THEN 'STEP 创新帖'
    WHEN '面试 第一时间跟进【帖集】' THEN '面试课 喜报 [帖集]'
    WHEN '相关学校 面试时间线' THEN '面试课 面试信息'
    WHEN '面试 准备须知【帖集】' THEN '面试课 面试准备须知 [帖集]'
    WHEN '面试课 创新' THEN '面试课 创新帖'
  END,
  "category_id" = CASE
    WHEN "row_name" = '面试 第一时间跟进【帖集】' THEN 'score-release-celebration'
    WHEN "row_name" = '面试 准备须知【帖集】' THEN 'interview-preparation-guide'
    ELSE "category_id"
  END,
  "current_version_number" = "current_version_number" + 1,
  "updated_at" = now()
WHERE "year" = 2026
  AND "row_name" IN (
    'TMUA 小班课/1对1',
    'TMUA 非推广讲义帖【帖集】',
    'TMUA 考试信息【帖集】',
    'TMUA 第一时间解析【帖集】',
    'TMUA 出分【帖集】',
    'TMUA 备考须知【帖集】',
    'TMUA 创新',
    'STEP 小班课/1对1',
    'STEP 非推广讲义帖【帖集】',
    'STEP 第一时间解析【帖集】',
    'STEP 出分【帖集】',
    'STEP 备考须知【帖集】',
    'STEP 创新',
    '面试 第一时间跟进【帖集】',
    '相关学校 面试时间线',
    '面试 准备须知【帖集】',
    '面试课 创新'
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
    'schemaVersion', 2,
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
      'isActive', plan."is_active"
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
  '统一规划行命名与帖子分类',
  '["统一规划行命名与帖子分类"]'::jsonb,
  'system-normalization'
FROM "operations_annual_plan" AS plan
LEFT JOIN "operations_subject" AS subject ON subject."id" = plan."subject_id"
LEFT JOIN "operations_category" AS category ON category."id" = plan."category_id"
WHERE plan."year" = 2026
  AND plan."current_version_number" = 2
  AND plan."row_name" IN (
    'TMUA 小班课和一对一',
    'TMUA 非推广讲义帖 [帖集]',
    'TMUA 考试信息 [帖集]',
    'TMUA 第一时间解析 [帖集]',
    'TMUA 喜报 [帖集]',
    'TMUA 备考须知 [帖集]',
    'TMUA 创新帖',
    'STEP 小班课和一对一',
    'STEP 非推广讲义帖 [帖集]',
    'STEP 第一时间解析 [帖集]',
    'STEP 喜报 [帖集]',
    'STEP 备考须知 [帖集]',
    'STEP 创新帖',
    '面试课 喜报 [帖集]',
    '面试课 面试信息',
    '面试课 面试准备须知 [帖集]',
    '面试课 创新帖'
  );
--> statement-breakpoint
DELETE FROM "operations_subject_category"
WHERE "subject_id" = 'interview' AND "category_id" = 'exam-guide';
