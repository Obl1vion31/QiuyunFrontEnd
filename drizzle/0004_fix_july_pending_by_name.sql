UPDATE "operations_content_schedule"
SET "promotion_status" = 'pending', "updated_at" = now()
WHERE "planned_publish_at" >= timestamp with time zone '2026-07-01 00:00:00+08:00'
  AND "planned_publish_at" < timestamp with time zone '2026-08-01 00:00:00+08:00'
  AND "content_name" IN (
    'TMUA小班课第三轮2',
    '面试课第一轮1',
    '面试课第一轮2'
  );
