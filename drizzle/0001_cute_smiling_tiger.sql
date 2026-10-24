ALTER TABLE "operations_content_schedule" RENAME COLUMN "planned_publish_date" TO "planned_publish_at";--> statement-breakpoint
ALTER TABLE "operations_content_schedule" RENAME COLUMN "actual_publish_date" TO "actual_publish_at";--> statement-breakpoint
ALTER TABLE "operations_content_schedule" ALTER COLUMN "planned_publish_at" TYPE timestamp with time zone USING ("planned_publish_at"::timestamp AT TIME ZONE 'Asia/Shanghai');--> statement-breakpoint
ALTER TABLE "operations_content_schedule" ALTER COLUMN "actual_publish_at" TYPE timestamp with time zone USING ("actual_publish_at"::timestamp AT TIME ZONE 'Asia/Shanghai');--> statement-breakpoint
DROP INDEX "operations_schedule_planned_date_idx";--> statement-breakpoint
DROP INDEX "operations_schedule_stage_idx";--> statement-breakpoint
DROP INDEX "operations_schedule_promoted_idx";--> statement-breakpoint
ALTER TABLE "operations_content_schedule" ADD COLUMN "promotion_status" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "operations_content_schedule" ADD COLUMN "source_key" text;--> statement-breakpoint
UPDATE "operations_content_schedule" SET "promotion_status" = CASE
	WHEN "current_stage" = 'testing' THEN 'testing'
	WHEN "current_stage" = 'promoting' THEN 'scaling'
	WHEN "current_stage" IN ('paused', 'completed') AND "is_promoted" THEN 'ended'
	WHEN "current_stage" = 'pending' AND "is_promoted" THEN 'pending'
	ELSE 'none'
END;--> statement-breakpoint
CREATE INDEX "operations_schedule_planned_at_idx" ON "operations_content_schedule" USING btree ("planned_publish_at");--> statement-breakpoint
CREATE INDEX "operations_schedule_promotion_idx" ON "operations_content_schedule" USING btree ("promotion_status");--> statement-breakpoint
CREATE UNIQUE INDEX "operations_schedule_source_key_idx" ON "operations_content_schedule" USING btree ("source_key");--> statement-breakpoint
ALTER TABLE "operations_content_schedule" DROP COLUMN "is_promoted";--> statement-breakpoint
ALTER TABLE "operations_content_schedule" DROP COLUMN "current_stage";
