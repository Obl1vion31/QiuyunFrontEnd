DELETE FROM "operations_non_promotion_review"
WHERE "checkpoint_type" = 'day_30';
--> statement-breakpoint
DELETE FROM "operations_content_performance_metric"
WHERE "checkpoint_type" = 'day_30';
--> statement-breakpoint
ALTER TABLE "operations_non_promotion_review" DROP CONSTRAINT "operations_non_promotion_review_checkpoint_check";
--> statement-breakpoint
ALTER TABLE "operations_non_promotion_review" ADD CONSTRAINT "operations_non_promotion_review_checkpoint_check" CHECK ("checkpoint_type" IN ('day_7', 'day_15'));
--> statement-breakpoint
ALTER TABLE "operations_content_performance_metric" DROP CONSTRAINT "operations_content_metric_checkpoint_check";
--> statement-breakpoint
ALTER TABLE "operations_content_performance_metric" ADD CONSTRAINT "operations_content_metric_checkpoint_check" CHECK ("checkpoint_type" IN ('day_7', 'day_15'));
