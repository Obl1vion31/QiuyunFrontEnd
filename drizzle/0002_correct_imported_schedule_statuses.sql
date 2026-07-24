UPDATE "operations_content_schedule"
SET "promotion_status" = 'none', "updated_at" = now()
WHERE "promotion_status" = 'scaling'
  AND "source_key" IN (
    '20260715-operations-content:13', '20260715-operations-content:14', '20260715-operations-content:15',
    '20260715-operations-content:16', '20260715-operations-content:17', '20260715-operations-content:18',
    '20260715-operations-content:19', '20260715-operations-content:20', '20260715-operations-content:21',
    '20260715-operations-content:22', '20260715-operations-content:23', '20260715-operations-content:24',
    '20260715-operations-content:25', '20260715-operations-content:26', '20260715-operations-content:27',
    '20260715-operations-content:28', '20260715-operations-content:29', '20260715-operations-content:30',
    '20260715-operations-content:31', '20260715-operations-content:33', '20260715-operations-content:35',
    '20260715-operations-content:36', '20260715-operations-content:37', '20260715-operations-content:38',
    '20260715-operations-content:39', '20260715-operations-content:40', '20260715-operations-content:41',
    '20260715-operations-content:44', '20260715-operations-content:49', '20260715-operations-content:50',
    '20260715-operations-content:53', '20260715-operations-content:54', '20260715-operations-content:57',
    '20260715-operations-content:58', '20260715-operations-content:59', '20260715-operations-content:60',
    '20260715-operations-content:61', '20260715-operations-content:63', '20260715-operations-content:64',
    '20260715-operations-content:66', '20260715-operations-content:67', '20260715-operations-content:68',
    '20260715-operations-content:69', '20260715-operations-content:70', '20260715-operations-content:71',
    '20260715-operations-content:72', '20260715-operations-content:73'
  );
--> statement-breakpoint
UPDATE "operations_content_schedule"
SET "completion_status" = CASE
    WHEN "actual_publish_at" IS NULL THEN 'pending'
    WHEN "actual_publish_at" - "planned_publish_at" > interval '12 hours' THEN 'delayed'
    ELSE 'on_time'
  END,
  "delay_reason" = CASE
    WHEN "actual_publish_at" - "planned_publish_at" > interval '12 hours' THEN "delay_reason"
    ELSE NULL
  END,
  "updated_at" = now()
WHERE "source_key" LIKE '20260715-operations-content:%';
