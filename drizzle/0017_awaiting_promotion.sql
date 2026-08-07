ALTER TABLE "operations_content_schedule"
ADD COLUMN "promotion_deferred_through" date;
--> statement-breakpoint

ALTER TABLE "operations_content_schedule"
DROP CONSTRAINT "operations_schedule_promotion_consistency_check";
--> statement-breakpoint

ALTER TABLE "operations_content_schedule"
ADD CONSTRAINT "operations_schedule_promotion_consistency_check"
CHECK (
  ("is_promoted" = false AND "promotion_status" = 'none')
  OR
  ("is_promoted" = true AND "promotion_status" IN (
    'pending', 'awaiting_promotion', 'testing', 'scaling',
    'ended', 'test_discarded', 'formal_discarded'
  ))
);
--> statement-breakpoint

UPDATE "operations_content_schedule"
SET "promotion_status" = 'awaiting_promotion', "updated_at" = now()
WHERE "is_promoted" = true
  AND "actual_publish_at" IS NOT NULL
  AND "promotion_status" = 'pending';
--> statement-breakpoint

ALTER TABLE "operations_promotion_daily_metric"
ALTER COLUMN "click_rate" DROP NOT NULL;
--> statement-breakpoint

ALTER TABLE "operations_promotion_daily_metric"
DROP CONSTRAINT "operations_promotion_daily_click_rate_check";
--> statement-breakpoint

ALTER TABLE "operations_promotion_daily_metric"
ADD CONSTRAINT "operations_promotion_daily_click_rate_check"
CHECK ("click_rate" IS NULL OR "click_rate" BETWEEN 0 AND 100);
