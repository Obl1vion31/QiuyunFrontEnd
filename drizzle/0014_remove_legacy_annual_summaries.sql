DO $$
DECLARE
  general_count integer;
  expected_count integer;
BEGIN
  SELECT count(*)
  INTO general_count
  FROM "operations_annual_plan"
  WHERE "year" = 2026
    AND "section_key" = 'general';

  SELECT count(*)
  INTO expected_count
  FROM "operations_annual_plan"
  WHERE "year" = 2026
    AND "section_key" = 'general'
    AND "row_name" = ANY (ARRAY[
      'TMUA 发帖周期',
      'TMUA 推广周期',
      'STEP 发帖周期',
      'STEP 推广周期',
      '面试课 发帖周期',
      '面试课 推广周期',
      'G5 学校相关资讯周期'
    ]);

  IF general_count = 0 THEN
    RETURN;
  END IF;

  IF general_count <> 7 OR expected_count <> 7 THEN
    RAISE EXCEPTION
      'Cannot remove legacy annual summaries: expected exactly seven known 2026 general rows, found % general and % known rows',
      general_count,
      expected_count;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "operations_annual_plan"
    WHERE "year" = 2026
      AND "section_key" = 'general'
      AND (
        "subject_id" IS NOT NULL
        OR "category_id" IS NOT NULL
        OR "course_name" IS NOT NULL
      )
  ) THEN
    RAISE EXCEPTION
      'Cannot remove legacy annual summaries: a target row has subject, category, or course data';
  END IF;
END $$;
--> statement-breakpoint
DELETE FROM "operations_annual_plan_version" AS version
USING "operations_annual_plan" AS plan
WHERE version."plan_id" = plan."id"
  AND plan."year" = 2026
  AND plan."section_key" = 'general'
  AND plan."row_name" = ANY (ARRAY[
    'TMUA 发帖周期',
    'TMUA 推广周期',
    'STEP 发帖周期',
    'STEP 推广周期',
    '面试课 发帖周期',
    '面试课 推广周期',
    'G5 学校相关资讯周期'
  ]);
--> statement-breakpoint
DELETE FROM "operations_annual_plan_block" AS block
USING "operations_annual_plan" AS plan
WHERE block."plan_id" = plan."id"
  AND plan."year" = 2026
  AND plan."section_key" = 'general'
  AND plan."row_name" = ANY (ARRAY[
    'TMUA 发帖周期',
    'TMUA 推广周期',
    'STEP 发帖周期',
    'STEP 推广周期',
    '面试课 发帖周期',
    '面试课 推广周期',
    'G5 学校相关资讯周期'
  ]);
--> statement-breakpoint
DELETE FROM "operations_annual_plan_link" AS link
USING "operations_annual_plan" AS plan
WHERE link."plan_id" = plan."id"
  AND plan."year" = 2026
  AND plan."section_key" = 'general'
  AND plan."row_name" = ANY (ARRAY[
    'TMUA 发帖周期',
    'TMUA 推广周期',
    'STEP 发帖周期',
    'STEP 推广周期',
    '面试课 发帖周期',
    '面试课 推广周期',
    'G5 学校相关资讯周期'
  ]);
--> statement-breakpoint
DELETE FROM "operations_annual_plan"
WHERE "year" = 2026
  AND "section_key" = 'general'
  AND "row_name" = ANY (ARRAY[
    'TMUA 发帖周期',
    'TMUA 推广周期',
    'STEP 发帖周期',
    'STEP 推广周期',
    '面试课 发帖周期',
    '面试课 推广周期',
    'G5 学校相关资讯周期'
  ]);
