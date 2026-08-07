DELETE FROM "operations_content_schedule"
WHERE "planned_publish_at" < timestamp with time zone '2026-07-01 00:00:00+08:00'
   OR "planned_publish_at" >= timestamp with time zone '2026-08-01 00:00:00+08:00';
--> statement-breakpoint
UPDATE "operations_content_schedule"
SET "promotion_status" = 'none', "updated_at" = now()
WHERE "planned_publish_at" >= timestamp with time zone '2026-07-01 00:00:00+08:00'
  AND "planned_publish_at" < timestamp with time zone '2026-08-01 00:00:00+08:00'
  AND "promotion_status" NOT IN ('ended', 'discarded');
--> statement-breakpoint
UPDATE "operations_content_schedule"
SET "promotion_status" = 'pending', "updated_at" = now()
WHERE "source_key" IN (
  '20260715-operations-content:75',
  '20260715-operations-content:77',
  '20260715-operations-content:79'
);
--> statement-breakpoint
UPDATE "operations_content_schedule"
SET "promotion_status" = 'scaling', "updated_at" = now()
WHERE "planned_publish_at" >= timestamp with time zone '2026-07-01 00:00:00+08:00'
  AND "planned_publish_at" < timestamp with time zone '2026-08-01 00:00:00+08:00'
  AND "content_name" ILIKE '%TMA%推广奖%';
